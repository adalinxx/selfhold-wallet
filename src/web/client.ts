// selfhold.js: Selfhold for a site. One wallet object: Selfhold for Chrome
// (`window.lattice`) where it is installed, else Selfhold's window
// (wallet.selfhold.app), opened over the page as a payment window is. Either
// way the site never holds a key, and the person approves each write.
//
//   import { selfhold } from "@selfhold/web";
//   const wallet = selfhold();
//   const address = await wallet.connect();                         // from a click
//   const sent = await wallet.writeRecords({ chainPath, actions }); // from a click
//   await sent.wait({ onChange: (state) => show(state) });          // "sent", "slow", "late", then landed
//
// Call connect, writeRecords and signMessage from a click, before awaiting
// anything else: browsers open a window only in answer to one. A write that
// needs reading first can be passed as a promise: the window opens at once
// and waits for it.
//
// The page must keep its opener: a Cross-Origin-Opener-Policy of
// `same-origin` cuts the window off; `same-origin-allow-popups` keeps it.
//
// Failures are SelfholdErrors, each with a `code` and a message fit to show.

/** The version of the calls between a site and Selfhold's window. */
export const PROTOCOL = 1;
const CHANNEL = "selfhold";
const ADDRESS = "selfhold.web.address";

export interface Options {
  /** Which wallet: Selfhold for Chrome where installed, else the window ("auto", the default); or only one of them. */
  use?: "auto" | "window" | "extension";
  /** The window's page; tests point it elsewhere. */
  wallet?: string;
  /** Hosts for the chain a write goes to; without them the wallet finds them through Nexus. */
  hosts?: () => string[] | Promise<string[]>;
  /** A fee sponsor's URL, or "" for none: with one, Selfhold's window pays fees with work on the person's device. */
  sponsor?: () => string | Promise<string>;
}

export interface WriteRequest {
  chainPath: string[];
  actions: { key: string; oldValue?: string; newValue?: string }[];
  payments?: { to: string; amount: string }[];
  fee?: string;
}

/** What a failure was, for a site to act on; its message says it to the person. */
export type Code =
  | "PopupBlocked" // the browser blocked the window: allow pop-ups, or call from a click
  | "Closed" // the window was closed before it answered
  | "Declined" // the person declined
  | "Reloaded" // the window was reloaded mid-call: nothing was signed
  | "AccountChanged" // the wallet uses another account now: connect again
  | "NotConnected" // no account was given to this site yet: connect first
  | "NeedsCoins" // the account can't pay for the write (a NeedsCoins)
  | "NoWallet" // `use: "extension"` without Selfhold for Chrome
  | "Lost" // sent, but the chain took another write in its place
  | "NotRecorded" // sent, and still not recorded after 30 minutes
  | "Failed"; // anything else: the message says what

/** Where each code is explained, with what to do about it. */
export const ERRORS_URL = "https://selfhold.app/docs/errors.html";

export class SelfholdError extends Error {
  readonly code: Code;
  /** This code's entry in the docs: its cause, and what to do. For the developer; `message` is for the person. */
  readonly docUrl: string;
  constructor(code: Code, message: string) {
    super(message);
    this.name = "SelfholdError";
    this.code = code;
    this.docUrl = `${ERRORS_URL}#${code}`;
  }
}

/** A write the account can't pay for: it needs `needed` coins and holds `balance`. */
export class NeedsCoins extends SelfholdError {
  readonly address: string;
  readonly needed: bigint;
  readonly balance: bigint;
  /** Why the fee sponsor didn't pay, if it was asked: "dear", "down", or "most". */
  readonly sponsor: string | null;
  constructor(message: string, address: string, needed: bigint, balance: bigint, sponsor: string | null) {
    super("NeedsCoins", message);
    this.name = "NeedsCoins";
    this.address = address;
    this.needed = needed;
    this.balance = balance;
    this.sponsor = sponsor;
  }
}

/** Where a sent write is: "sent", the device's part done; "slow", past 30 s; "late", past 5 min, and it may still land. */
export type WriteState = "sent" | "slow" | "late";

export interface WaitOptions {
  /** Hears each new state, from "sent". */
  onChange?: (state: WriteState) => void;
  /**
   * Whether the chain shows the write, read from the site's own state: true,
   * landed; a string, another write landed in its place (why, to show);
   * false, not yet. Without it, a write has landed once the account's nonce
   * passes the write's, at its host.
   */
  check?: () => Promise<boolean | string>;
  signal?: AbortSignal;
}

/** A write the wallet sent. */
export interface Sent {
  transactionCID: string;
  /** The account that signed it. */
  account: string;
  chainPath: string[];
  /** Its nonce and the host it went to, where the wallet says them (Selfhold for Chrome before 0.6 doesn't). */
  nonce?: string;
  host?: string;
  /** Resolves once it lands; rejects with a SelfholdError coded "Lost" or "NotRecorded", or the signal's reason. */
  wait(options?: WaitOptions): Promise<void>;
  /** Checks now, not at the next turn: a "Check again" for a late write. */
  checkNow(): void;
}

/** How long a write may take before it is "slow", "late", or given up on; and how often it is checked. */
export const TIMES = { slow: 30_000, late: 300_000, giveUp: 1_800_000, every: 2_500, everyLate: 15_000, read: 20_000 };
/** Reads agreeing another write landed in this one's place before it is lost: a lagging host can mislead one. */
const LOST_READS = 3;

type Answer = { ok: boolean; error?: string; code?: string; [key: string]: unknown };
type Extension = {
  isLatticeWallet: true;
  connect(): Promise<string>;
  address(): Promise<string | null>;
  disconnect(): Promise<void>;
  writeRecords(params: WriteRequest): Promise<{ transactionCID: string; nonce?: string; host?: string }>;
  signMessage(params: { text: string }): Promise<{ publicKey: string; signature: string }>;
};

const CODES = new Set<string>(["PopupBlocked", "Closed", "Declined", "Reloaded", "AccountChanged", "NotConnected", "NeedsCoins", "NoWallet", "Lost", "NotRecorded", "Failed"]);

/** A wallet's failure, as a SelfholdError: its code if it gave one, else read from what it said. */
export function asSelfholdError(error: unknown): SelfholdError {
  if (error instanceof SelfholdError) return error;
  const text = String((error as Error)?.message ?? error);
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && CODES.has(code)) return new SelfholdError(code as Code, text);
  // The wallets' own words for a decline, never a node's text that happens to say "rejected".
  if (/^The person just declined/.test(text)) return new SelfholdError("Declined", "The wallet waits a few seconds after a decline. Try again in a moment.");
  if (/^The person declined/.test(text)) return new SelfholdError("Declined", "You declined it in the wallet. Nothing was sent.");
  return new SelfholdError("Failed", text);
}

/** Waits for a sent write to land, as `options` say; `poke` registers a way to check at once. */
export async function waitFor(
  landed: () => Promise<boolean | string>,
  { onChange = () => {}, signal }: Omit<WaitOptions, "check"> = {},
  poke: (now: () => void) => void = () => {},
  times = TIMES,
): Promise<void> {
  const started = Date.now();
  let state: WriteState = "sent";
  let lost = 0;
  onChange(state);
  for (;;) {
    if (signal?.aborted) throw signal.reason;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, state === "late" ? times.everyLate : times.every);
      const now = () => { clearTimeout(timer); resolve(); };
      poke(now);
      signal?.addEventListener("abort", now, { once: true });
    });
    if (signal?.aborted) throw signal.reason;
    let result: boolean | string = false;
    try {
      // A read that hangs is given up on, and asked again: a stuck host never stops the wait.
      result = await new Promise<boolean | string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no answer")), times.read);
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        landed().then(resolve, reject).finally(() => clearTimeout(timer));
      });
    } catch {} // a host that didn't answer is asked again
    if (result === true) return;
    lost = typeof result === "string" ? lost + 1 : 0;
    if (lost >= LOST_READS) throw new SelfholdError("Lost", result as string);
    const waited = Date.now() - started;
    if (waited > times.giveUp) throw new SelfholdError("NotRecorded", "Still not recorded after 30 minutes. It probably didn't go through: check your account, then try again.");
    const next: WriteState = waited > times.late ? "late" : waited > times.slow ? "slow" : "sent";
    if (next !== state) onChange((state = next));
  }
}

/**
 * Whether `account`'s nonce on `chainPath` has passed `nonce` at any of
 * `hosts`, read fresh. A host that doesn't serve the chain, or doesn't know
 * the account yet, answers 404: the next is asked. It can't tell this write
 * from another the account signed at the same nonce elsewhere: pass wait() a
 * check for that.
 */
async function nonceLanded(hosts: string[], account: string, chainPath: string[], nonce: bigint): Promise<boolean> {
  let answered = false;
  let error: unknown = new Error("No host to read the account from");
  for (const host of hosts) {
    try {
      const response = await fetch(`${host.replace(/\/+$/, "")}/api/state/account/${account}?chainPath=${chainPath.join("/")}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (response.status === 404) {
        answered = true;
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      answered = true;
      if (BigInt((await response.json()).nonce ?? 0) > nonce) return true;
    } catch (e) {
      error = e;
    }
  }
  if (answered) return false;
  throw error;
}

export function selfhold(options: Options = {}) {
  const use = options.use ?? "auto";
  const page = new URL(options.wallet ?? "https://wallet.selfhold.app/");
  const key = `${ADDRESS} ${page.origin}`;
  const remember = (address: unknown) => {
    try { if (typeof address === "string") localStorage.setItem(key, address); } catch {}
  };
  const given = () => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const forget = () => {
    try { localStorage.removeItem(key); } catch {}
  };
  const installed = (): Extension | null => {
    const lattice = (globalThis as { lattice?: Extension }).lattice;
    return lattice?.isLatticeWallet ? lattice : null;
  };
  /** Selfhold for Chrome, if it is the wallet here, else null: the window. */
  const extension = (): Extension | null => {
    if (use === "window") return null;
    const found = installed();
    if (!found && use === "extension") throw new SelfholdError("NoWallet", "Selfhold for Chrome isn't installed in this browser.");
    return found;
  };

  /** Opens the window with `call` (or what it resolves to; null closes the window), resolving with its answer. */
  function ask(call: object | Promise<object | null>, progress: (text: string) => void = () => {}, route = false, account?: string): Promise<Answer> {
    // A request that fails after the window is gone is answered by the window's closing.
    if (call instanceof Promise) call.catch(() => {});
    const id = crypto.randomUUID();
    const width = 420, height = 700;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 3);
    const opened = window.open(`${page.href}#${id}`, `selfhold-${id}`, `popup,width=${width},height=${height},left=${left},top=${top}`);
    if (!opened) return Promise.reject(new SelfholdError("PopupBlocked", "The browser blocked Selfhold's window. Allow pop-ups for this site, then try again."));
    return new Promise((resolve) => {
      let sent = false;
      let settled = false;
      const finish = (answer: Answer) => {
        settled = true;
        window.removeEventListener("message", heard);
        clearInterval(watching);
        resolve(answer);
      };
      const heard = async (event: MessageEvent) => {
        const data = event.data;
        if (event.origin !== page.origin || event.source !== opened || data?.channel !== CHANNEL || data.id !== id) return;
        // Ready again: the window was reloaded, and the call it had is gone. It is never sent twice.
        if (data.ready && sent) {
          opened.close();
          return finish({ ok: false, code: "Reloaded", error: "The Selfhold window was reloaded. Nothing was signed; try again." });
        }
        if (data.ready) {
          sent = true;
          try {
            const asked = await call;
            if (asked === null) {
              opened.close();
              return finish({ ok: true, nothing: true });
            }
            const hosts = route && options.hosts ? await options.hosts() : undefined;
            const sponsor = route && options.sponsor ? await options.sponsor() : undefined;
            // Answered meanwhile (reloaded, or closed): the call is never sent.
            if (settled) return;
            opened.postMessage({ channel: CHANNEL, v: PROTOCOL, id, call: asked, ...(route ? { route: { ...(hosts && { hosts }), ...(sponsor && { sponsor }) } } : {}), ...(account && { account }) }, page.origin);
          } catch (error) {
            opened.close();
            const failed = asSelfholdError(error);
            return finish({ ok: false, code: failed.code, error: failed.message });
          }
        }
        if (typeof data.progress === "string") progress(data.progress);
        if (data.response) finish(data.response);
      };
      window.addEventListener("message", heard);
      // Closed before it answered: declined, or never approved.
      const watching = setInterval(() => opened.closed && finish({ ok: false, code: "Closed", error: "The Selfhold window was closed. Nothing was signed." }), 400);
    });
  }

  const answered = (answer: Answer): Answer => {
    if (answer.ok) return answer;
    // The window's account isn't the one given here: forgotten, so the site asks to connect again.
    if (answer.code === "AccountChanged") forget();
    if (answer.code === "NeedsCoins") {
      throw new NeedsCoins(answer.error ?? "", answer.address as string, BigInt(answer.needed as string), BigInt(answer.balance as string), (answer.sponsor as string | null) ?? null);
    }
    if (answer.code && CODES.has(answer.code)) throw new SelfholdError(answer.code as Code, answer.error ?? "Selfhold did not answer");
    throw asSelfholdError(answer.error ?? "Selfhold did not answer");
  };

  // Selfhold for Chrome takes one request from a page at a time.
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
    const next = turn.then(run);
    turn = next.catch(() => {});
    return next;
  };

  /** A sent write, to wait on. */
  const sentWrite = (transactionCID: string, account: string, chainPath: string[], nonce?: string, host?: string): Sent => {
    const pokes = new Set<() => void>();
    return Object.freeze({
      transactionCID, account, chainPath,
      ...(nonce !== undefined && { nonce }), ...(host !== undefined && { host }),
      wait: async ({ check, ...rest }: WaitOptions = {}) => {
        let landed = check;
        if (!landed) {
          if (nonce === undefined) throw new SelfholdError("Failed", "This wallet doesn't say its write's nonce: pass wait() a check.");
          const hosts = [...new Set([...(host ? [host] : []), ...(options.hosts ? await options.hosts() : [])])];
          if (!hosts.length) throw new SelfholdError("Failed", "No host to watch this write at: give selfhold() hosts, or wait() a check.");
          landed = () => nonceLanded(hosts, account, chainPath, BigInt(nonce));
        }
        let now: (() => void) | null = null;
        const poke = () => now?.();
        pokes.add(poke);
        try {
          await waitFor(landed, rest, (wake) => (now = wake));
        } finally {
          pokes.delete(poke);
        }
      },
      checkNow: () => pokes.forEach((poke) => poke()),
    });
  };

  return Object.freeze({
    isSelfholdWeb: true,
    /** "extension" where Selfhold for Chrome is the wallet here, else "window". It can change once the extension reaches the page. */
    get kind(): "extension" | "window" {
      return extension() ? "extension" : "window";
    },
    /** The address this site was given, or null; never asks. */
    address: async (): Promise<string | null> => {
      const lattice = extension();
      if (!lattice) return given();
      return (await lattice.address().catch(() => null)) ?? null;
    },
    /** The person's address, once they connect. Call it from a click. */
    connect: async (): Promise<string> => {
      const lattice = extension();
      if (lattice) return lattice.connect().catch((error) => { throw asSelfholdError(error); });
      const { address } = answered(await ask({ method: "connect" }));
      remember(address);
      return address as string;
    },
    /** Forget the address here. */
    disconnect: async () => {
      const lattice = extension();
      if (lattice) return lattice.disconnect();
      forget();
    },
    /**
     * Write records on one chain, and pay addresses from the account in the
     * same transaction, once the person approves; the wallet signs and sends
     * it. `request` may be a promise; resolving to null sends nothing, and
     * the write resolves to null. `account`, the address the site built the
     * write for, is checked first: if the wallet's is another now, nothing is
     * sent and it fails "AccountChanged". `progress(text)` hears what
     * Selfhold's window is doing.
     */
    writeRecords: async (
      request: WriteRequest | Promise<WriteRequest | null>,
      { progress, account }: { progress?: (text: string) => void; account?: string } = {},
    ): Promise<Sent | null> => {
      const lattice = extension();
      const expected = account ?? (lattice ? undefined : given() ?? undefined);
      const changed = (now: string | null) => {
        Promise.resolve(request).catch(() => {});
        return new SelfholdError(now ? "AccountChanged" : "NotConnected", now
          ? "Selfhold now connects this site to a different account. Look again, then try again."
          : "Selfhold isn't connected to this site anymore. Connect again, then try again.");
      };
      if (!lattice) {
        if (account !== undefined && given() !== account) throw changed(given());
        const call = Promise.resolve(request).then((params) => (params === null ? null : { method: "writeRecords", params }));
        const answer = answered(await ask(call, progress, true, expected));
        if (answer.nothing) return null;
        remember(answer.address);
        const params = await request;
        return sentWrite(answer.transactionCID as string, answer.address as string, params!.chainPath, answer.nonce as string | undefined, answer.host as string | undefined);
      }
      return inTurn(async () => {
        const now = await lattice.address().catch(() => null);
        if (now === null || (account !== undefined && now !== account)) throw changed(now);
        const params = await request;
        if (params === null) return null;
        const sent = await lattice.writeRecords(params).catch((error) => { throw asSelfholdError(error); });
        return sentWrite(sent.transactionCID, now, params.chainPath, sent.nonce, sent.host);
      });
    },
    /** Sign `text`, once the person approves, as the address given here if any. The signed bytes are "lattice-message:" + this origin + "\n" + text. */
    signMessage: async (params: { text: string }) => {
      const lattice = extension();
      if (lattice) return lattice.signMessage(params).catch((error) => { throw asSelfholdError(error); });
      const { publicKey, signature } = answered(await ask({ method: "signMessage", params }, undefined, false, given() ?? undefined));
      return { publicKey: publicKey as string, signature: signature as string };
    },
  });
}

export type Wallet = ReturnType<typeof selfhold>;
