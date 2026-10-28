// selfhold.js: Selfhold on the web, for a site. Each call that needs the
// person opens Selfhold's window (wallet.selfhold.app) over the page, as a
// payment window does, and resolves with what they approved there. The site
// never holds a key. The same calls as Selfhold for Chrome's `window.lattice`:
//
//   import { selfhold } from "./selfhold.js";
//   const wallet = selfhold({ hosts: () => [node], sponsor: () => sponsorURL });
//   const address = await wallet.connect();                       // from a click
//   const { transactionCID } = await wallet.writeRecords({ chainPath, actions, payments, fee }); // from a click
//   const { publicKey, signature } = await wallet.signMessage({ text });                         // from a click
//
// Call each from a click, before awaiting anything else: browsers open a
// window only in answer to one. A write that needs reading first can be
// passed as a promise: the window opens at once and waits for it.
//
// The page must keep its opener: a Cross-Origin-Opener-Policy of
// `same-origin` cuts the window off; `same-origin-allow-popups` keeps it.

const CHANNEL = "selfhold";
const ADDRESS = "selfhold.web.address";

export interface Options {
  /** The wallet's page; tests point it elsewhere. */
  wallet?: string;
  /** Hosts for the chain a write goes to; without them the wallet finds them. */
  hosts?: () => string[] | Promise<string[]>;
  /** A fee sponsor's URL, or "" for none: with one, fees are paid with work on the person's device. */
  sponsor?: () => string | Promise<string>;
}

export interface WriteRequest {
  chainPath: string[];
  actions: { key: string; oldValue?: string; newValue?: string }[];
  payments?: { to: string; amount: string }[];
  fee?: string;
}

/** A write the account can't pay for: it needs `needed` coins and holds `balance`. */
export class NeedsCoins extends Error {
  /** `sponsor`: why the fee sponsor didn't pay, if it was asked: "dear", "down", or "most". */
  constructor(message: string, readonly address: string, readonly needed: bigint, readonly balance: bigint, readonly sponsor: string | null) {
    super(message);
    this.name = "NeedsCoins";
  }
}

type Answer = { ok: boolean; error?: string; [key: string]: unknown };

export function selfhold(options: Options = {}) {
  const wallet = new URL(options.wallet ?? "https://wallet.selfhold.app/");
  const key = `${ADDRESS} ${wallet.origin}`;
  const remember = (address: unknown) => {
    try { if (typeof address === "string") localStorage.setItem(key, address); } catch {}
  };
  const given = () => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const forget = () => {
    try { localStorage.removeItem(key); } catch {}
  };

  /** Opens the window with `call` (or what it resolves to; null closes the window), resolving with its answer. */
  function ask(call: object | Promise<object | null>, progress: (text: string) => void = () => {}, route = false, account?: string): Promise<Answer> {
    // A request that fails after the window is gone is answered by the window's closing.
    if (call instanceof Promise) call.catch(() => {});
    const id = crypto.randomUUID();
    const width = 420, height = 700;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 3);
    const opened = window.open(`${wallet.href}#${id}`, `selfhold-${id}`, `popup,width=${width},height=${height},left=${left},top=${top}`);
    if (!opened) return Promise.reject(new Error("The browser blocked Selfhold's window. Allow pop-ups for this site, then try again."));
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
        if (event.origin !== wallet.origin || event.source !== opened || data?.channel !== CHANNEL || data.id !== id) return;
        // Ready again: the window was reloaded, and the call it had is gone. It is never sent twice.
        if (data.ready && sent) {
          opened.close();
          return finish({ ok: false, error: "The Selfhold window was reloaded. Nothing was signed; try again." });
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
            opened.postMessage({ channel: CHANNEL, id, call: asked, ...(route ? { route: { ...(hosts && { hosts }), ...(sponsor && { sponsor }) } } : {}), ...(account && { account }) }, wallet.origin);
          } catch (error) {
            opened.close();
            return finish({ ok: false, error: String((error as Error)?.message ?? error) });
          }
        }
        if (typeof data.progress === "string") progress(data.progress);
        if (data.response) finish(data.response);
      };
      window.addEventListener("message", heard);
      // Closed before it answered: declined, or never approved.
      const watching = setInterval(() => opened.closed && finish({ ok: false, error: "The Selfhold window was closed. Nothing was signed." }), 400);
    });
  }

  const answered = (answer: Answer): Answer => {
    if (answer.ok) return answer;
    // The window's account isn't the one given here: forgotten, so the site asks to connect again.
    if (answer.code === "AccountChanged") forget();
    if (answer.code === "NeedsCoins") {
      throw new NeedsCoins(answer.error ?? "", answer.address as string, BigInt(answer.needed as string), BigInt(answer.balance as string), (answer.sponsor as string | null) ?? null);
    }
    throw new Error(answer.error ?? "Selfhold did not answer");
  };

  return Object.freeze({
    isSelfholdWeb: true,
    /** The address this site was given, or null; never asks. */
    address: async (): Promise<string | null> => given(),
    /** The person's address, once they connect in Selfhold's window. Call it from a click. */
    connect: async (): Promise<string> => {
      const { address } = answered(await ask({ method: "connect" }));
      remember(address);
      return address as string;
    },
    /** Forget the address here. */
    disconnect: async () => forget(),
    /**
     * Write records on one chain, and pay addresses from the account in the
     * same transaction, once the person approves in Selfhold's window, which
     * signs and sends it. `progress(text)` hears what the window is doing.
     * `request` may be a promise; resolving to null closes the window, and
     * the write resolves to null: nothing to send. Built for the address
     * given here, the window signs it only as that account.
     */
    writeRecords: async (request: WriteRequest | Promise<WriteRequest | null>, { progress }: { progress?: (text: string) => void } = {}): Promise<{ transactionCID: string } | null> => {
      const call = Promise.resolve(request).then((params) => (params === null ? null : { method: "writeRecords", params }));
      const answer = answered(await ask(call, progress, true, given() ?? undefined));
      if (answer.nothing) return null;
      remember(answer.address);
      return { transactionCID: answer.transactionCID as string };
    },
    /** Sign `text`, once the person approves, as the address given here if any. The signed bytes are "lattice-message:" + this origin + "\n" + text. */
    signMessage: async (params: { text: string }) => {
      const { publicKey, signature } = answered(await ask({ method: "signMessage", params }, undefined, false, given() ?? undefined));
      return { publicKey: publicKey as string, signature: signature as string };
    },
  });
}
