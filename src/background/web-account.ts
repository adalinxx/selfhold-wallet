// An account Selfhold's window handed this extension, held until the person
// adds it here or not: one at a time, for two minutes, never stored.

import { importPrivateKey } from "../lib/crypto/accounts.ts";

export const HOLD_MS = 2 * 60_000;

export interface Offered { privHex: string; address: string }

export function webAccounts(now = () => Date.now()) {
  let held: (Offered & { until: number }) | null = null;
  const current = () => (held && held.until > now() ? held : (held = null));
  return {
    /** Holds `privHex` for the person to add, replacing any held before; its address, or why not. */
    offer(privHex: unknown): { ok: true; address: string } | { ok: false; error: string } {
      if (typeof privHex !== "string" || !/^[0-9a-f]{64}$/.test(privHex)) return { ok: false, error: "Not an account key" };
      let address: string;
      try {
        ({ address } = importPrivateKey(privHex));
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
      held = { privHex, address, until: now() + HOLD_MS };
      return { ok: true, address };
    },
    /** The held account's address, or null. */
    pending: (): string | null => current()?.address ?? null,
    /** The held account, given up: to add, or to forget. */
    take(): Offered | null {
      const taken = current();
      held = null;
      return taken && { privHex: taken.privHex, address: taken.address };
    },
  };
}
