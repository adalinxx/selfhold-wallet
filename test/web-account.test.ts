// An account Selfhold's window hands Selfhold for Chrome: taken only from
// wallet.selfhold.app's page, held for the person, never shown to the popup,
// and added only when the person adds it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { accountFromPrivateKey } from "@adalin/lattice-core";
import { HOLD_MS, webAccounts } from "../src/background/web-account.ts";
import { WEB_WALLET_ORIGIN } from "../src/lib/web-wallet.ts";

const KEY = "5e".repeat(32);
const ADDRESS = accountFromPrivateKey(Uint8Array.from(Buffer.from(KEY, "hex"))).address;

test("the holder takes an account key, holds it for two minutes, and gives it up once", () => {
  let now = 0;
  const held = webAccounts(() => now);
  for (const bad of ["", "5e", "5E".repeat(32), `0x${KEY}`, 7, null]) assert.equal(held.offer(bad).ok, false, String(bad));
  // The window's key and the extension's import make one account.
  assert.deepEqual(held.offer(KEY), { ok: true, address: ADDRESS });
  assert.equal(held.pending(), ADDRESS);
  now += HOLD_MS - 1;
  assert.deepEqual(held.take(), { privHex: KEY, address: ADDRESS });
  assert.equal(held.take(), null);
  held.offer(KEY);
  now += HOLD_MS;
  assert.equal(held.pending(), null);
  assert.equal(held.take(), null);
});

const prefix = "chrome-extension://wallet-id/";
type Sender = { id: string; url?: string; origin?: string; frameId?: number; tab?: { id: number }; documentId?: string };
type Answer = { ok: boolean; error?: string; [key: string]: any };

test("the worker takes it from Selfhold's window only, and adds it when the person does, as a new wallet or beside the accounts there", async () => {
  let listener!: (msg: unknown, sender: Sender, reply: (r: Answer) => void) => boolean;
  const opened: string[] = [];
  const data: Record<string, unknown> = {};
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: {
    runtime: { id: "wallet-id", getURL: (path: string) => prefix + path, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } }, sendMessage: async () => {} },
    storage: { local: {
      get: async (key: string) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
      set: async (items: Record<string, unknown>) => { Object.assign(data, structuredClone(items)); },
      remove: async (keys: string[]) => { for (const k of keys) delete data[k]; },
    } },
    alarms: { create: () => {}, clear: async () => true, onAlarm: { addListener: () => {} } },
    windows: { create: async ({ url }: { url: string }) => { opened.push(url); return { id: opened.length }; }, onRemoved: { addListener: () => {} } },
  } });
  await import("../src/background/service-worker.ts");
  const send = (msg: unknown, sender: Sender) => new Promise<Answer>((resolve, reject) => {
    if (!listener(msg, sender, resolve)) setTimeout(() => reject(new Error("ignored")), 0);
  });
  const page = (origin: string, extra: Partial<Sender> = {}) => ({ id: "wallet-id", url: `${origin}/`, origin, frameId: 0, tab: { id: 3 }, documentId: "d", ...extra });
  const hand = (sender: Sender, privHex = KEY) => send({ type: "webAccount", privHex }, sender);
  const popup = (msg: unknown) => send(msg, { id: "wallet-id", url: `${prefix}popup/index.html?view=web-account` });

  // Any other page, a frame of the window's, or the window's origin claimed by the URL alone: ignored.
  for (const sender of [page("https://evil.example"), page("https://wallet.selfhold.app.evil.example"), page(WEB_WALLET_ORIGIN, { frameId: 1 }),
    { ...page("https://evil.example"), url: `${WEB_WALLET_ORIGIN}/` }]) {
    await assert.rejects(hand(sender), /ignored/);
  }
  assert.equal((await popup({ type: "webAccountPending" })).address, null);
  assert.equal(opened.length, 0);

  // From the window: held, and the extension's own window opens to ask; the popup sees the address, never the key.
  assert.deepEqual(await hand(page(WEB_WALLET_ORIGIN)), { ok: true, address: ADDRESS });
  assert.deepEqual(opened, [`${prefix}popup/index.html?view=web-account`]);
  const pending = await popup({ type: "webAccountPending" });
  assert.equal(pending.address, ADDRESS);
  assert.doesNotMatch(JSON.stringify(pending), new RegExp(KEY));

  // No wallet here yet: a password first, and a short one keeps the account waiting.
  assert.match((await popup({ type: "webAccountAccept", password: "short" })).error!, /at least 8/);
  const made = await popup({ type: "webAccountAccept", password: "correct horse battery" });
  assert.equal(made.ok, true, made.error);
  assert.deepEqual(made.state.accounts.map((a: { address: string; label: string }) => [a.address, a.label]), [[ADDRESS, "Selfhold web"]]);
  assert.equal((await popup({ type: "webAccountPending" })).address, null);
  assert.match((await popup({ type: "webAccountAccept" })).error!, /Nothing to add/);

  // Beside the accounts there: added, and handed again, it is the one already there.
  await popup({ type: "addAccount" });
  const other = "7a".repeat(32);
  await hand(page(WEB_WALLET_ORIGIN), other);
  const added = await popup({ type: "webAccountAccept" });
  assert.equal(added.ok, true, added.error);
  const otherAddress = accountFromPrivateKey(Uint8Array.from(Buffer.from(other, "hex"))).address;
  assert.ok(added.state.accounts.some((a: { address: string; label: string }) => a.address === otherAddress && a.label === "Selfhold web 2"));
  assert.equal(added.state.active, otherAddress);
  await hand(page(WEB_WALLET_ORIGIN));
  const again = await popup({ type: "webAccountAccept" });
  assert.equal(again.ok, true, again.error);
  assert.equal(again.state.active, ADDRESS);
  assert.equal(again.state.accounts.length, added.state.accounts.length);

  // Not now forgets it.
  await hand(page(WEB_WALLET_ORIGIN), other);
  await popup({ type: "webAccountDecline" });
  assert.equal((await popup({ type: "webAccountPending" })).address, null);
});
