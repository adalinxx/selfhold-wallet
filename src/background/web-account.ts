// An account Selfhold's window handed this extension, held until the person
// adds it here or not: one at a time, for two minutes, in memory the browser
// keeps for the session only (it outlasts the worker's idle stops, never a restart).

import { importPrivateKey } from "../lib/crypto/accounts.ts";

export const HOLD_MS = 2 * 60_000;

export interface Offered { privHex: string; address: string }
export interface Held extends Offered { until: number }
/** Where the held account is kept: chrome.storage.session in the extension. */
export interface Keep { get(): Promise<Held | null>; set(held: Held | null): Promise<void> }

export const memoryKeep = (): Keep => {
  let held: Held | null = null;
  return { get: async () => held, set: async (next) => { held = next; } };
};

export function webAccounts(keep: Keep, now = () => Date.now()) {
  const current = async () => {
    const held = await keep.get();
    if (held && held.until > now()) return held;
    if (held) await keep.set(null);
    return null;
  };
  return {
    /**
     * Holds `privHex` for the person to add: its address, or why not. While
     * another account waits, it is refused, so the one the person is shown
     * is the one added.
     */
    async offer(privHex: unknown): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
      if (typeof privHex !== "string" || !/^[0-9a-f]{64}$/.test(privHex)) return { ok: false, error: "Not an account key" };
      let address: string;
      try {
        ({ address } = importPrivateKey(privHex));
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
      const waiting = await current();
      if (waiting && waiting.address !== address) return { ok: false, error: "Another account is waiting to be added: answer it in Selfhold for Chrome first." };
      await keep.set({ privHex, address, until: now() + HOLD_MS });
      return { ok: true, address };
    },
    /** The held account's address, or null. */
    pending: async (): Promise<string | null> => (await current())?.address ?? null,
    /** The held account, still held, if it is `address`'s. */
    async peek(address: string): Promise<Offered | null> {
      const held = await current();
      return held && held.address === address ? { privHex: held.privHex, address: held.address } : null;
    },
    /** Forgets it. */
    clear: () => keep.set(null),
  };
}
