// A fee sponsor pays a write's fee, and what the account is short of its
// payments, for proof of work ground on this device: its graphics chip where
// the page can use one, else its processor's cores. The sponsor adds only
// its own debit and, with a `pay`, its credit to the account, and co-signs;
// `check` refuses anything else before the person's signature is added.

import { transactionPayload, type TransactionBody } from "@adalin/lattice-core";
import { gpuGrinder } from "./work/gpu.ts";

const SPONSOR_CLIENT = "selfhold.sponsorClient"; // + " <sponsor's origin>": a token earned at one sponsor is that sponsor's only
// The longest this device works for one fee, expected at its pace: past it, the wallet asks for coins instead.
const LONGEST = 2 * 60_000;
let pace: number | null = null; // hashes per millisecond this device last managed

/** What pays a fee in work here: "GPU" where WebGPU runs, else "processor". */
export const workDevice = async () => ((await gpuGrinder()) ? "GPU" : "processor");

/** The sponsor's price in work is past what this device will do. */
export class TooMuchWork extends Error {}
/** The sponsor can't pay the fee now: not answering, busy or sold out, or taking no work. */
export class NoSponsor extends Error {}
/** The sponsor won't pay this much of a price for work (its --most-pay). */
export class NoPay extends Error {}

type Refusal = Error & { status?: number };

/**
 * Where paying the fee in work is, for the window to show: getting work
 * ("busy" while the sponsor has none), grinding it, then the sponsor's
 * signature. `done` (0 to 1, only ever growing) and `left` (milliseconds,
 * expected at this device's pace) come with the grinding.
 */
export interface Step {
  stage: "work" | "busy" | "grind" | "sign" | "queued";
  device?: string;
  done?: number;
  left?: number;
  /** Hashes per millisecond, measured here. */
  rate?: number;
  shares?: number;
}
type Progress = (step: Step) => void;

/** The person stopped it: nothing is sent. */
export class Stopped extends Error {
  constructor() { super("Stopped. Nothing was sent."); this.name = "Stopped"; }
}
type Wire = Record<string, unknown>;
interface Work {
  client: string; assignment: string; fee: string; pay?: string; sharesForFee: string; shareTarget: string;
  prefixHex: string; startNonce: string; count: string; expiresInMilliseconds: string;
}

/** A signal that aborts with the first of `a` and `b` (AbortSignal.any, where the browser lacks it). */
function either(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (AbortSignal.any) return AbortSignal.any([a, b]);
  const both = new AbortController();
  for (const s of [a, b]) {
    if (s.aborted) both.abort(s.reason);
    else s.addEventListener("abort", () => both.abort(s.reason), { once: true });
  }
  return both.signal;
}

/** POSTs `body` to the sponsor's `path`; its refusal as an Error with the status. */
async function ask(url: string, path: string, body: unknown, stop?: AbortSignal): Promise<Wire> {
  let response: Response;
  try {
    response = await fetch(new URL(path, url.endsWith("/") ? url : `${url}/`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: stop ? either(stop, AbortSignal.timeout(15_000)) : AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (stop?.aborted) throw new Stopped();
    throw new NoSponsor((error as Error).name === "TimeoutError" ? "The fee sponsor didn't answer." : "The fee sponsor can't be reached.");
  }
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (stop?.aborted) throw new Stopped();
    throw new NoSponsor((error as Error).name === "TimeoutError" ? "The fee sponsor didn't answer." : "The fee sponsor can't be reached.");
  }
  // It pays fees, but not this much of a price: from /work, or /sponsor with a token already earned.
  if (response.status === 400 && /pays at most/.test(text)) throw new NoPay(text);
  if (!response.ok) {
    let reason = text || String(response.status);
    try { reason = JSON.parse(text)?.error?.message ?? reason; } catch {}
    throw Object.assign(new Error(`The fee sponsor: ${reason}`), { status: response.status });
  }
  return JSON.parse(text);
}

/** A sponsor's wire body as the SDK's: its 64-bit integers as BigInt. */
const fromWire = (body: Wire): TransactionBody => ({
  ...(body as unknown as TransactionBody),
  accountActions: (body.accountActions as { owner: string; delta: string }[]).map((a) => ({ owner: a.owner, delta: BigInt(a.delta) })),
  nonce: BigInt(body.nonce as string),
});
const toWire = (body: TransactionBody) => transactionPayload({}, body).transaction.body;
/** JSON with every object's keys sorted: the sponsor's encoder orders them as it likes. */
const canonical = (value: unknown) =>
  JSON.stringify(value, (_, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));

const tokenKey = (url: string) => `${SPONSOR_CLIENT} ${new URL(url).origin}`;
const stored = (url: string): string | null => {
  try { return localStorage.getItem(tokenKey(url)); } catch { return null; }
};

/**
 * The sponsored transaction for `draft` (fee 0, one signer): the sponsor's
 * fee debit and signature added, and with a `pay`, its credit of `pay` to the
 * account; nothing else changed. Earns both first, grinding the sponsor's
 * shares, when this browser's credit there is short.
 */
export async function sponsorFee(url: string, draft: TransactionBody, progress: Progress, { wait = true, pay = 0n, signal }: { wait?: boolean; pay?: bigint; signal?: AbortSignal } = {}): Promise<{ body: TransactionBody; signatures: Record<string, string> }> {
  const chain = draft.chainPath.join("/");
  const paid = pay > 0n ? { pay: String(pay) } : {};
  let client = stored(url);
  const sponsored = async () => {
    const answer = await ask(url, "sponsor", { client, transaction: { signatures: {}, body: toWire(draft) }, ...paid }, signal);
    const signed = answer.transaction as { body: Wire; signatures: Record<string, string> };
    return { body: check(draft, fromWire(signed.body), BigInt(answer.fee as string), pay), signatures: signed.signatures };
  };
  if (client) {
    try {
      return await sponsored();
    } catch (error) {
      if (error instanceof Stopped) throw error;
      // 402: the credit here doesn't cover the fee yet (or the sponsor restarted, forgetting it).
      if ((error as Refusal).status !== 402) throw error;
    }
  }
  // The chip ready first: work is good only until the chain moves on, and a
  // first shader compile can take seconds.
  progress({ stage: "work" });
  await workDevice();
  // Hashes, and milliseconds spent hashing, across works: not the waits between them.
  const effort = { spent: 0, hashes: 0, done: 0, shares: 0 };
  const patience = Date.now() + (wait ? 60_000 : 0);
  // Work refused round after round earns nothing: past this, the sponsor is no help.
  const deadline = Date.now() + LONGEST;
  for (;;) {
    if (signal?.aborted) throw new Stopped();
    if (Date.now() > deadline) throw new NoSponsor("The fee sponsor took none of this device's work.");
    let work: Work;
    try {
      work = await ask(url, "work", { ...(client && { client }), chain, ...paid }, signal) as unknown as Work;
    } catch (error) {
      if (error instanceof Stopped) throw error;
      const { status, message } = error as Refusal;
      // Busy, or this block's fees all sold: a block or two from now, it has work again.
      if (status === 503 && Date.now() < patience) {
        progress({ stage: "busy" });
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (signal?.aborted) throw new Stopped();
        continue;
      }
      // A token from before the sponsor restarted: start over with a new one.
      if (status === 503) throw new NoSponsor(message);
      if (!client || status !== 400 || !/client token/.test(message)) throw error;
      client = null;
      continue;
    }
    client = work.client;
    try { localStorage.setItem(tokenKey(url), client); } catch {}
    if (await grind(url, work, effort, progress, signal)) {
      progress({ stage: "sign" });
      try {
        return await sponsored();
      } catch (error) {
        // Out of coins, or busy, after all: it can't pay now.
        if ((error as Refusal).status === 503) throw new NoSponsor((error as Error).message);
        throw error;
      }
    }
  }
}

/**
 * `sponsored` if it is `draft` with only the sponsor's debit for the fee and
 * `pay` added, and with a `pay`, its credit of exactly `pay` to the draft's
 * signer; else throws.
 */
export function check(draft: TransactionBody, sponsored: TransactionBody, fee: bigint, pay = 0n): TransactionBody {
  const sponsor = sponsored.signers[1];
  const added = pay > 0n ? 2 : 1;
  const credit = pay > 0n ? sponsored.accountActions.at(-2) : null;
  const debit = sponsored.accountActions.at(-1);
  const same = canonical(toWire({ ...sponsored, accountActions: sponsored.accountActions.slice(0, -added), signers: sponsored.signers.slice(0, 1) })) === canonical(toWire(draft));
  const credited = pay === 0n || (credit?.owner === draft.signers[0] && credit.delta === pay);
  if (!same || !credited || sponsored.signers.length !== 2 || sponsor === draft.signers[0] || debit?.owner !== sponsor || debit.delta >= 0n || -debit.delta > fee + pay) {
    throw new Error("The fee sponsor changed the transaction. Nothing was sent.");
  }
  return sponsored;
}

/**
 * Grinds `work`'s nonces on this device, sending each share, until the credit
 * covers the fee (true) or the work runs out or expires (false). `effort`
 * carries the time and hashes spent on this fee across works. Throws
 * TooMuchWork once this device's pace shows the fee would take too long.
 */
async function grind(url: string, work: Work, effort: { spent: number; hashes: number; done: number; shares: number }, progress: Progress, signal?: AbortSignal): Promise<boolean> {
  // What the credit buys: the fee, and what the sponsor pays the account.
  const fee = BigInt(work.fee) + BigInt(work.pay ?? 0);
  // A share is worth 2^256 / (target + 1) hashes, expected.
  const needed = Number(BigInt(work.sharesForFee) * (2n ** 256n / (BigInt(`0x${work.shareTarget}`) + 1n)));
  if (pace && needed / pace > LONGEST) throw new TooMuchWork();
  const device = await workDevice();
  // How far along: the hashes done of those expected, held under the end
  // until the sponsor's credit says so, and never going back.
  let left: number | undefined;
  const tell = (done: number) => {
    effort.done = Math.max(effort.done, Math.min(done, 1));
    progress({ stage: "grind", device, done: effort.done, ...(left === undefined ? {} : { left }), ...(pace ? { rate: pace } : {}), shares: effort.shares });
  };
  tell(0);

  let settle!: { resolve: (value: boolean) => void; reject: (error: Error) => void };
  const outcome = new Promise<boolean>((resolve, reject) => (settle = { resolve, reject }));
  let over = false;
  const finish = (value: boolean, error?: Error) => {
    if (over) return;
    over = true;
    if (error) settle.reject(error);
    else settle.resolve(value);
  };
  // One share at a time, so the credit heard last is the newest.
  let sending = Promise.resolve();
  const found = (nonce: bigint) => {
    sending = sending.then(async () => {
      if (over) return;
      try {
        const { credit } = await ask(url, "shares", { assignment: work.assignment, nonce: String(nonce) });
        effort.shares += 1;
        const earned = BigInt(credit as string);
        tell(Number((earned * 1000n) / (fee > 0n ? fee : 1n)) / 1000);
        if (earned >= fee) finish(true);
      } catch (error) {
        const { status, message } = error as Refusal;
        console.info(`[fee] share refused: ${message}`);
        // A doubled share earns nothing; expired work, or a full block, calls for new work.
        if (/duplicateShare|missesShareTarget/.test(message)) return;
        if (status === 400 || status === 503) finish(false);
        else finish(false, error as Error);
      }
    });
  };
  let began = 0; // this work's first batch done, past its start-up
  const hashed = (count: number) => {
    // Paced from the first batch done, past the start-up.
    if (!began) return void (began = performance.now());
    effort.hashes += count;
    const spent = effort.spent + performance.now() - began;
    if (spent < 2000) return;
    pace = effort.hashes / spent;
    const expected = needed / pace;
    if (expected > LONGEST) return finish(false, new TooMuchWork());
    // 0 once the expected work is done: the rest is luck, and the sponsor counting it.
    left = Math.max(0, expected - spent);
    tell(Math.min(0.95, effort.hashes / needed));
  };
  const stop = () => finish(false, new Stopped());
  signal?.addEventListener("abort", stop);

  const timer = setTimeout(() => finish(false), Number(work.expiresInMilliseconds));
  const hashing = await hasher(work, found, hashed);
  hashing.done.then(
    () => sending.then(() => finish(false)),
    (error: Error) => finish(false, new Error(`The work stopped: ${error.message}`)),
  );
  try {
    return await outcome;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
    if (began) effort.spent += performance.now() - began;
    hashing.stop();
  }
}

/**
 * Hashes `work`'s nonces on this device's graphics chip where the page can
 * use one, else on its processor's cores: `found(nonce)` for each share,
 * `hashed(count)` as it goes. `done` settles when the range is through.
 */
async function hasher(work: Work, found: (nonce: bigint) => void, hashed: (count: number) => void): Promise<{ done: Promise<unknown>; stop: () => void }> {
  const gpu = await gpuGrinder();
  if (gpu) {
    const job = gpu.job(work.prefixHex, work.shareTarget);
    let stopped = false;
    const done = (async () => {
      let next = BigInt(work.startNonce);
      const end = next + BigInt(work.count);
      let batch = 1 << 16;
      try {
        while (!stopped && next < end) {
          const size = end - next < BigInt(batch) ? Number(end - next) : batch;
          const began = performance.now();
          const shares = await job.run(next, size);
          if (stopped) return;
          next += BigInt(size);
          hashed(size);
          shares.forEach(found);
          // Batches of a tenth of a second or so: few round trips, the chip still draws the page,
          // and a share reaches the sponsor before the chain moves past its work.
          const spent = performance.now() - began;
          if (spent < 100 && batch < 1 << 26) batch *= 2;
          else if (spent > 400 && batch > 1 << 12) batch /= 2;
        }
      } finally {
        job.close();
      }
    })();
    return { done, stop: () => (stopped = true) };
  }

  const count = Math.max(1, Math.min(8, (navigator.hardwareConcurrency ?? 2) - 1));
  const span = BigInt(work.count) / BigInt(count);
  const workers: Worker[] = [];
  const done = Promise.all(Array.from({ length: count }, (_, i) => new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL("./work/worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.share) found(BigInt(data.share));
      if (data.hashes) hashed(data.hashes);
      if (data.done) resolve();
    };
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage({ prefixHex: work.prefixHex, targetHex: work.shareTarget, start: String(BigInt(work.startNonce) + BigInt(i) * span), count: String(span) });
    workers.push(worker);
  })));
  return { done, stop: () => workers.forEach((worker) => worker.terminate()) };
}
