// A site's write, quoted, then signed and sent from the web wallet. The fee
// is the hosts' relay floor; with a fee sponsor it is paid in work ground on
// this device, and what the account is short of the write's payments the
// sponsor pays too, for more work. Without the sponsor's help the account's
// own coins pay, if it has them; else the write is refused as NeedsCoins.

import { signTransactionBody, signedTransactionCID, transactionPayload, type TransactionBody } from "@adalin/lattice-core";
import { recordsBody } from "../lib/wallet/session.ts";
import { describe, submitChecked, submitter } from "../lib/wallet/node.ts";
import type { PageWriteRequest } from "../lib/wallet/provider.ts";
import { NoPay, NoSponsor, Stopped, TooMuchWork, sponsorFee, type Step } from "./sponsor.ts";

/** Where sending is: paying the fee in work (sponsor.ts), paying from coins, or sending. */
export type Progress = Step | { stage: "coins" | "send" };

const SENT = "selfhold.sent"; // { "<chain> <address>": the nonce after the last one sent from this browser }

/** Where a site's write goes: hosts for its chain, and a fee sponsor's URL or "" for none. */
export interface Route { hosts: string[]; sponsor: string }

/** A write the account can't pay for: it needs `needed` coins and holds `balance`. */
export class NeedsCoins extends Error {
  /** `sponsor`: why the sponsor didn't pay, if it was asked: "dear" (too much work here), "down", or "most" (not this much of a price). */
  constructor(readonly address: string, readonly needed: bigint, readonly balance: bigint, readonly sponsor: "dear" | "down" | "most" | null = null) {
    super(`Your account needs ${needed} ${needed === 1n ? "coin" : "coins"} for this and holds ${balance}.`);
    this.name = "NeedsCoins";
  }
}

/** What a write will cost, read before the person approves it. */
export interface Quote {
  host: string;
  /** The fee signed: the site's, raised to the host's floor. */
  fee: bigint;
  balance: bigint;
  /** What the write pays others. */
  paying: bigint;
  /** The fee is paid in work, the account's coins the fallback while `covered`. */
  sponsored: boolean;
  /** The account's coins cover the payments and the fee. */
  covered: boolean;
  /** What the sponsor pays the account toward the payments. */
  short: bigint;
}

/** A host that answers, with the chain's relay floor and the account's balance and nonce there. */
async function reach(hosts: readonly string[], chainPath: readonly string[], address: string) {
  const chain = chainPath.join("/");
  let failure: unknown;
  for (const host of hosts) {
    try {
      const get = async (path: string) => {
        // Fresh, never the browser's copy: hosts let reads be cached for seconds, and a balance or nonce that old signs wrong.
        const response = await fetch(`${host}${path}?chainPath=${encodeURIComponent(chain)}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (response.status === 404) return {};
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        return response.json();
      };
      const [info, account] = await Promise.all([get("/api/chain/info"), get(`/api/state/account/${address}`)]);
      if (info.acceptsSubmit === false) throw new Error(`${host} takes no transactions`);
      return { host, fee: BigInt(info.minRelayFee ?? 0), balance: BigInt(account.balance ?? 0), nonce: BigInt(account.nonce ?? 0) };
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(`No host takes transactions for ${chain}`, { cause: failure });
}

const payments = (write: PageWriteRequest) => (write.payments ?? []).map(({ to, amount }) => ({ to, amount: BigInt(amount) }));

export async function quote(write: PageWriteRequest, owner: string, route: Route): Promise<Quote> {
  const at = await reach(route.hosts, write.chainPath, owner);
  const paying = payments(write).reduce((sum, p) => sum + p.amount, 0n);
  const fee = write.fee === undefined || BigInt(write.fee) < at.fee ? at.fee : BigInt(write.fee);
  return {
    host: at.host, fee, balance: at.balance, paying,
    sponsored: fee > 0n && route.sponsor !== "",
    covered: at.balance >= paying + fee,
    short: paying > at.balance ? paying - at.balance : 0n,
  };
}

// What this browser last sent from an account on a chain: the next write
// goes past it while the hosts may not count it yet. Only a little past the
// chain's nonce, and only for a while: a host that lied about the nonce, or a
// write the pool dropped, must not hold the account's later writes up for good.
const SENT_FOR_MS = 10 * 60_000;
const SENT_AHEAD = 8n;
const sentKey = (chainPath: readonly string[], owner: string) => `${chainPath.join("/")} ${owner}`;
function sentNonce(key: string, chainNonce: bigint): bigint {
  try {
    const sent = JSON.parse(localStorage.getItem(SENT) ?? "{}")[key];
    if (!sent || Date.now() - sent.at > SENT_FOR_MS) return chainNonce;
    const next = BigInt(sent.next);
    return next > chainNonce && next - chainNonce <= SENT_AHEAD ? next : chainNonce;
  } catch {
    return chainNonce;
  }
}
function rememberSent(key: string, next: bigint) {
  try {
    const all = JSON.parse(localStorage.getItem(SENT) ?? "{}");
    localStorage.setItem(SENT, JSON.stringify({ ...all, [key]: { next: String(next), at: Date.now() } }));
  } catch {}
}

/**
 * `run`, while no other Selfhold window in this browser sends: two would take
 * the same nonce. `waiting()` hears that another holds it; Stop still stops.
 */
async function oneAtATime<T>(run: () => Promise<T>, waiting: () => void, signal?: AbortSignal): Promise<T> {
  if (!navigator.locks) return run();
  const now = await navigator.locks.request("selfhold.send", { ifAvailable: true }, async (lock) => (lock ? { done: await run() } : null));
  if (now) return now.done;
  waiting();
  try {
    return await navigator.locks.request("selfhold.send", { signal }, run) as T;
  } catch (error) {
    if (signal?.aborted) throw new Stopped();
    throw error;
  }
}

/**
 * Signs `write` with `key` and sends it as `quoted` said, returning its CID,
 * its nonce, and the host it went to: a site waits on that nonce passing there.
 * Coins pay the fee only where the review said they might: when the sponsor
 * can't help (never when it changed the write) and the account covered it.
 * Once sent, a write is never sent again; once stopped, nothing is sent.
 */
export interface Sent { transactionCID: string; nonce: bigint; host: string }

export function send(write: PageWriteRequest, owner: string, key: Uint8Array, route: Route, quoted: Quote, progress: (step: Progress) => void, signal?: AbortSignal): Promise<Sent> {
  return oneAtATime(() => sendNow(write, owner, key, route, quoted, progress, signal), () => progress({ stage: "queued" }), signal);
}

async function sendNow(write: PageWriteRequest, owner: string, key: Uint8Array, route: Route, quoted: Quote, progress: (step: Progress) => void, signal?: AbortSignal): Promise<Sent> {
  const at = await reach([quoted.host, ...route.hosts.filter((h) => h !== quoted.host)], write.chainPath, owner);
  const sentAt = sentKey(write.chainPath, owner);
  const nonce = sentNonce(sentAt, at.nonce);
  const build = (fee: bigint) => recordsBody(owner, { actions: write.actions, payments: payments(write), fee, nonce, chainPath: write.chainPath });
  const covered = quoted.covered && at.balance >= quoted.paying + quoted.fee;
  const feeRose = () => new Error(`The fee rose to ${at.fee} since this was shown. Nothing was sent; try again.`);

  const submit = async (body: TransactionBody, signatures: Record<string, string> = {}) => {
    if (signal?.aborted) throw new Stopped();
    const { bodyCID, publicKey, signature } = signTransactionBody(body, key);
    const all = { ...signatures, [publicKey]: signature };
    const signed = { payload: transactionPayload(all, body), bodyCID, transactionCID: signedTransactionCID(all, body) };
    progress({ stage: "send" });
    try {
      await submitChecked(submitter(at.host), signed);
    } catch (error) {
      throw new Error(`The host ${describe(error)}`);
    }
    rememberSent(sentAt, nonce + 1n);
    return { transactionCID: signed.transactionCID, nonce, host: at.host };
  };

  if (quoted.sponsored) {
    const short = quoted.paying > at.balance ? quoted.paying - at.balance : 0n;
    let sponsored;
    try {
      // With coins to fall back on, a busy sponsor isn't waited for.
      sponsored = await sponsorFee(route.sponsor, build(0n), progress, { wait: !covered, pay: short, signal });
    } catch (error) {
      const why = error instanceof TooMuchWork ? "dear" : error instanceof NoSponsor ? "down" : error instanceof NoPay ? "most" : null;
      // Stopped, or a sponsor that changed the write: nothing is sent, coins included.
      if (!why) throw error;
      if (!covered) throw new NeedsCoins(owner, quoted.paying + quoted.fee, at.balance, why);
    }
    if (sponsored) return submit(sponsored.body, sponsored.signatures);
    progress({ stage: "coins" });
  }
  if (at.fee > quoted.fee) throw feeRose();
  if (covered) return submit(build(quoted.fee));
  throw new NeedsCoins(owner, quoted.paying + quoted.fee, at.balance);
}
