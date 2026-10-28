// The web wallet's account: its key is derived from a passkey (WebAuthn's
// PRF extension), so the passkey's provider keeps it and syncs it to the
// person's other devices. The wallet stores no key, only which passkey and
// the address it makes. Passkeys belong to selfhold.app itself, so the same
// passkey makes the same account on every Selfhold page, and every site that
// opens the wallet is asking the same account.

import { accountFromPrivateKey } from "@adalin/lattice-core";

const STORE = "selfhold.account"; // { credential, address }
// What the passkey derives the key from: the same passkey and salt, the same key, on every device. FROZEN.
const SALT = new TextEncoder().encode("Selfhold account key, v1");

export interface Saved { credential: string; address: string }
export interface Unlocked { address: string; key: Uint8Array }

/** The passkeys' domain: selfhold.app on its pages, else the page's own host (localhost, in tests). */
export const rpId = (hostname = location.hostname) => (hostname === "selfhold.app" || hostname.endsWith(".selfhold.app") ? "selfhold.app" : hostname);

export function saved(): Saved | null {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) ?? "null");
    return stored && typeof stored.address === "string" && typeof stored.credential === "string" ? stored : null;
  } catch {
    return null;
  }
}
const save = (record: Saved | null) => {
  try {
    if (record) localStorage.setItem(STORE, JSON.stringify(record));
    else localStorage.removeItem(STORE);
  } catch {}
};

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const base64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const fromBase64url = (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
type PrfResults = { enabled?: boolean; results?: { first?: ArrayBuffer } };
const prfOf = (credential: Credential) => ((credential as PublicKeyCredential).getClientExtensionResults() as { prf?: PrfResults }).prf;
const noKey = () => new Error("This passkey can't make a key here. Try another browser or device, or Selfhold for Chrome.");

/** The browser's WebAuthn refusal, as a person reads it. */
function passkeyError(error: unknown): Error {
  const name = (error as Error)?.name;
  if (name === "NotAllowedError") return new Error("The passkey was cancelled. Nothing was signed.");
  if (name === "InvalidStateError") return new Error("That passkey is already on this device.");
  if (name === "SecurityError") return new Error("Passkeys work only on selfhold.app, or on localhost.");
  return error as Error;
}

/** Takes `key` as the account's, remembering which passkey made it. */
function hold(key: Uint8Array, credential: string): Unlocked {
  const { address } = accountFromPrivateKey(key);
  save({ credential, address });
  return { address, key };
}

/** The key a passkey derives, asking for it (any of selfhold.app's passkeys unless `credential` names one). */
async function derive(credential?: string): Promise<{ key: Uint8Array; credential: string }> {
  let assertion: Credential | null;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: rpId(),
        allowCredentials: credential ? [{ type: "public-key", id: fromBase64url(credential) }] : [],
        userVerification: "required",
        extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs,
      },
    });
  } catch (error) {
    throw passkeyError(error);
  }
  if (!assertion) throw passkeyError({ name: "NotAllowedError" });
  const secret = prfOf(assertion)?.results?.first;
  if (!secret) throw noKey();
  return { key: new Uint8Array(secret), credential: base64url((assertion as PublicKeyCredential).rawId) };
}

/**
 * Asks the passkey this wallet remembers for its key: the person's approval
 * of what they were shown, as `address`, the account they were shown.
 */
export async function unlock(address: string): Promise<Unlocked> {
  const record = saved();
  if (!record) throw new Error("There is no Selfhold account in this browser yet.");
  // Another Selfhold window may have signed in with another passkey since.
  if (record.address !== address) throw new Error("Selfhold now uses another account in this browser. Nothing was signed; ask again.");
  const found = await derive(record.credential);
  if (accountFromPrivateKey(found.key).address !== record.address) throw new Error("That passkey makes a different account.");
  return hold(found.key, found.credential);
}

/** Signs in with a Selfhold passkey made before, on this device or synced to it. */
export async function signIn(): Promise<Unlocked> {
  const found = await derive();
  return hold(found.key, found.credential);
}

/** Makes a new account: a passkey, and the key it derives. */
export async function create(): Promise<Unlocked> {
  let created: Credential | null;
  try {
    created = await navigator.credentials.create({
      publicKey: {
        rp: { id: rpId(), name: "Selfhold" },
        user: { id: random(16), name: `Selfhold account, ${new Date().toISOString().slice(0, 10)}`, displayName: "Selfhold account" },
        challenge: random(32),
        pubKeyCredParams: [{ type: "public-key", alg: -8 }, { type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        extensions: { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs,
      },
    });
  } catch (error) {
    throw passkeyError(error);
  }
  if (!created) throw passkeyError({ name: "NotAllowedError" });
  const prf = prfOf(created);
  if (prf?.enabled === false) throw noKey();
  const credential = base64url((created as PublicKeyCredential).rawId);
  // Some providers derive at creation; the rest, on the first use.
  const first = prf?.results?.first;
  return first ? hold(new Uint8Array(first), credential) : hold((await derive(credential)).key, credential);
}

/** Forgets the account here; its passkey brings it back with `signIn`. */
export const forget = () => save(null);
