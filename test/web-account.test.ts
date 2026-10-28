// An account Selfhold's window hands Selfhold for Chrome: taken only from
// wallet.selfhold.app's page, held for the person, never shown to the popup,
// and added only when the person adds it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { accountFromPrivateKey } from "@adalin/lattice-core";
import { HOLD_MS, memoryKeep, webAccounts } from "../src/background/web-account.ts";
import { WEB_WALLET_ORIGIN } from "../src/lib/web-wallet.ts";

const KEY = "5e".repeat(32);
const addressOf = (hex: string) => accountFromPrivateKey(Uint8Array.from(Buffer.from(hex, "hex"))).address;
const ADDRESS = addressOf(KEY);
const OTHER = "7a".repeat(32);
const OTHER_ADDRESS = addressOf(OTHER);

test("the holder takes an account key, one at a time, for two minutes, until it is added or not", async () => {
  let now = 0;
  const held = webAccounts(memoryKeep(), () => now);
  for (const bad of ["", "5e", "5E".repeat(32), `0x${KEY}`, 7, null]) assert.equal((await held.offer(bad)).ok, false, String(bad));
  // The window's key and the extension's import make one account.
  assert.deepEqual(await held.offer(KEY), { ok: true, address: ADDRESS });
  assert.equal(await held.pending(), ADDRESS);
  // Another, while it waits, is refused: the account the person is shown is the one added.
  assert.match(((await held.offer(OTHER)) as { error: string }).error, /Another account is waiting/);
  assert.equal(await held.peek(OTHER_ADDRESS), null);
  assert.deepEqual(await held.offer(KEY), { ok: true, address: ADDRESS });
  now += HOLD_MS - 1;
  assert.deepEqual(await held.peek(ADDRESS), { privHex: KEY, address: ADDRESS });
  assert.deepEqual(await held.peek(ADDRESS), { privHex: KEY, address: ADDRESS }, "held until it is added");
  await held.clear();
  assert.equal(await held.peek(ADDRESS), null);
  await held.offer(KEY);
  now += HOLD_MS;
  assert.equal(await held.pending(), null);
  assert.deepEqual(await held.offer(OTHER), { ok: true, address: OTHER_ADDRESS }, "an expired one is no longer waiting");
});

const prefix = "chrome-extension://wallet-id/";
type Sender = { id: string; url?: string; origin?: string; frameId?: number; tab?: { id: number }; documentId?: string };
type Answer = { ok: boolean; error?: string; [key: string]: any };

test("the worker takes it from Selfhold's window only, and adds the account the person was shown, as a new wallet or beside the accounts there", async () => {
  let listener!: (msg: unknown, sender: Sender, reply: (r: Answer) => void) => boolean;
  let external!: typeof listener;
  let closed!: (id: number) => void;
  const opened: string[] = [];
  const focused: number[] = [];
  const data: Record<string, unknown> = {};
  const session: Record<string, unknown> = {};
  const area = (store: Record<string, unknown>) => ({
    get: async (key: string) => (key in store ? { [key]: structuredClone(store[key]) } : {}),
    set: async (items: Record<string, unknown>) => { Object.assign(store, structuredClone(items)); },
    remove: async (keys: string[]) => { for (const k of keys) delete store[k]; },
  });
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: {
    runtime: { id: "wallet-id", getURL: (path: string) => prefix + path, sendMessage: async () => {},
      onMessage: { addListener: (fn: typeof listener) => { listener = fn; } },
      onMessageExternal: { addListener: (fn: typeof listener) => { external = fn; } } },
    storage: { local: area(data), session: area(session) },
    alarms: { create: () => {}, clear: async () => true, onAlarm: { addListener: () => {} } },
    windows: {
      create: async ({ url }: { url: string }) => { opened.push(url); return { id: opened.length }; },
      update: async (id: number) => { if (id > opened.length) throw new Error("No window"); focused.push(id); return { id }; },
      onRemoved: { addListener: (fn: typeof closed) => { closed = fn; } },
    },
  } });
  await import("../src/background/service-worker.ts");
  const ask = (fn: typeof listener, msg: unknown, sender: Sender) => new Promise<Answer>((resolve, reject) => {
    if (!fn(msg, sender, resolve)) setTimeout(() => reject(new Error("ignored")), 0);
  });
  const page = (origin: string, extra: Partial<Sender> = {}): Sender => ({ id: undefined as unknown as string, url: `${origin}/`, origin, frameId: 0, tab: { id: 3 }, documentId: "d", ...extra });
  const hand = (sender: Sender, privHex = KEY) => ask(external, { type: "webAccount", privHex }, sender);
  const popup = (msg: unknown) => ask(listener, msg, { id: "wallet-id", url: `${prefix}popup/index.html?view=web-account` });
  const window = page(WEB_WALLET_ORIGIN);

  // Any other page, a frame of the window's, or the window's origin claimed by the URL alone: ignored.
  for (const sender of [page("https://evil.example"), page("https://wallet.selfhold.app.evil.example"), page(WEB_WALLET_ORIGIN, { frameId: 1 }),
    { ...page("https://evil.example"), url: `${WEB_WALLET_ORIGIN}/` }, page(WEB_WALLET_ORIGIN, { tab: undefined })]) {
    await assert.rejects(hand(sender), /ignored/);
    await assert.rejects(ask(external, { type: "webAccountHere" }, sender), /ignored/);
  }
  // Nor by the extension's own messaging, from a content script there.
  await assert.rejects(ask(listener, { type: "webAccount", privHex: KEY }, { ...window, id: "wallet-id" }), /ignored/);
  assert.equal((await popup({ type: "webAccountPending" })).address, null);
  assert.equal(opened.length, 0);
  assert.deepEqual(await ask(external, { type: "webAccountHere" }, window), { ok: true });

  // From the window: held, and the extension's own window opens to ask; the popup sees the address, never the key.
  assert.deepEqual(await hand(window), { ok: true, address: ADDRESS });
  assert.deepEqual(opened, [`${prefix}popup/index.html?view=web-account`]);
  const pending = await popup({ type: "webAccountPending" });
  assert.equal(pending.address, ADDRESS);
  assert.doesNotMatch(JSON.stringify(pending), new RegExp(KEY));
  assert.doesNotMatch(JSON.stringify(data), new RegExp(KEY), "never in lasting storage");
  // Handed again: the window already open is shown, not another; another account is refused while it waits.
  await hand(window);
  assert.deepEqual([opened.length, focused], [1, [1]]);
  assert.equal((await hand(window, OTHER)).ok, false);

  // No wallet here yet: a password first, and a short one keeps the account waiting; so does adding another address.
  assert.match((await popup({ type: "webAccountAccept", address: ADDRESS, password: "short" })).error!, /at least 8/);
  assert.match((await popup({ type: "webAccountAccept", address: OTHER_ADDRESS, password: "correct horse battery" })).error!, /Nothing to add/);
  const made = await popup({ type: "webAccountAccept", address: ADDRESS, password: "correct horse battery" });
  assert.equal(made.ok, true, made.error);
  assert.deepEqual(made.state.accounts.map((a: { address: string; label: string }) => [a.address, a.label]), [[ADDRESS, "Selfhold web"]]);
  assert.equal((await popup({ type: "webAccountPending" })).address, null);
  assert.match((await popup({ type: "webAccountAccept", address: ADDRESS })).error!, /Nothing to add/);

  // Beside the accounts there: numbered past a name taken in any case, and handed again, it is the one already there.
  await popup({ type: "renameAccount", address: ADDRESS, label: "SELFHOLD WEB" });
  await popup({ type: "addAccount" });
  await hand(window, OTHER);
  const added = await popup({ type: "webAccountAccept", address: OTHER_ADDRESS });
  assert.equal(added.ok, true, added.error);
  assert.ok(added.state.accounts.some((a: { address: string; label: string }) => a.address === OTHER_ADDRESS && a.label === "Selfhold web 2"));
  assert.equal(added.state.active, OTHER_ADDRESS);
  await hand(window);
  const again = await popup({ type: "webAccountAccept", address: ADDRESS });
  assert.equal(again.ok, true, again.error);
  assert.equal(again.state.active, ADDRESS);
  assert.equal(again.state.accounts.length, added.state.accounts.length);

  // Not now forgets it; so does closing the window that asks.
  await hand(window, OTHER);
  await popup({ type: "webAccountDecline" });
  assert.equal((await popup({ type: "webAccountPending" })).address, null);
  await hand(window, OTHER);
  closed(1);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal((await popup({ type: "webAccountPending" })).address, null);
});
