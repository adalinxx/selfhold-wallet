// Selfhold on the web: a write the host refuses "for now" is sent again, as
// signed, until it takes it; any other answer ends the write at once.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signTransactionBody, signedTransactionCID } from "@adalin/lattice-core";
import { send, resend, type Quote } from "../src/web/send.ts";
import { Stopped } from "../src/web/sponsor.ts";
import { recordsBody } from "../src/lib/wallet/session.ts";
import { importPrivateKey } from "../src/lib/crypto/accounts.ts";

const fast = { afterMs: [1, 1, 1, 1] };
Object.assign(resend, fast);
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(resend, fast);
  try { localStorage.clear(); } catch {}
});

const me = importPrivateKey("a1".repeat(32));
const chainPath = ["Nexus", "moniker"];
const write = { chainPath, actions: [{ key: "name/ada", newValue: "x" }] };
const quoted: Quote = { host: "https://a.test", fee: 1n, balance: 10n, paying: 0n, sponsored: false, covered: true, short: 0n };
const route = { hosts: ["https://a.test", "https://b.test"], sponsor: "" };
// The write as the wallet signs it: Ed25519 is deterministic, so its CID too.
const body = recordsBody(me.address, { actions: write.actions, payments: [], fee: 1n, nonce: 0n, chainPath });
const signed = signTransactionBody(body, me.privateKey);
const cid = signedTransactionCID({ [signed.publicKey]: signed.signature }, body);

type Answer = { status: number; refusal?: string };
/** Hosts that answer reads, and each `/transactions` post from `answers` in turn (then 200), recording each post. */
function hosts(answers: Answer[]) {
  const posts: { host: string; payload: string }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/api/chain/info") return json(200, { minRelayFee: "1", acceptsSubmit: true });
    if (url.pathname.startsWith("/api/state/account/")) return json(200, { balance: "10", nonce: "0" });
    if (url.pathname === "/api/mempool") return json(200, { transactions: [] });
    if (url.pathname === "/transactions") {
      posts.push({ host: url.origin, payload: String(init?.body) });
      const answer = answers.shift() ?? { status: 200 };
      return answer.status === 200 ? json(200, { transactionCID: cid }) : json(answer.status, { error: { message: answer.refusal } });
    }
    return json(404, {});
  }) as typeof fetch;
  return posts;
}

const sending = (signal?: AbortSignal) => send(write, me.address, me.privateKey, route, quoted, () => {}, signal);
const same = (posts: { payload: string }[]) => posts.every((p) => p.payload === posts[0].payload);

test("a host catching up, or reading state it let go of, is sent the same write again until it takes it", async () => {
  const posts = hosts([{ status: 503, refusal: "contextChanged" }, { status: 400, refusal: "unavailable" }]);
  const sent = await sending();
  assert.equal(sent.transactionCID, cid);
  assert.equal(sent.host, "https://a.test");
  assert.deepEqual(posts.map((p) => p.host), Array(3).fill("https://a.test"), "the host that quoted it, only");
  assert.ok(same(posts), "the same signed bytes each time");
});

test("a host still refusing for now after the last wait ends the write, as does any other answer at once", async () => {
  const busy = hosts(Array(9).fill({ status: 503, refusal: "contextChanged" }));
  await assert.rejects(sending(), /^Error: The host .*the chain moved/);
  assert.equal(busy.length, 1 + resend.afterMs.length);

  for (const answer of [{ status: 400, refusal: "invalidState" }, { status: 503, refusal: "full" }, { status: 503, refusal: "shuttingDown" }, { status: 502 }]) {
    const posts = hosts([answer]);
    await assert.rejects(sending(), /^Error: The host /);
    assert.equal(posts.length, 1, `${answer.refusal ?? answer.status}: sent once`);
  }
});

test("a send with no verdict may have been taken: it is held as sent; a refusal is not", async () => {
  let works = true;
  try { localStorage.setItem("probe", "1"); localStorage.removeItem("probe"); } catch { works = false; }
  hosts([{ status: 502 }]);
  await assert.rejects(sending(), /^Error: The host /);
  if (works) assert.match(localStorage.getItem("selfhold.sent") ?? "", new RegExp(cid));
  if (works) localStorage.clear();
  hosts([{ status: 400, refusal: "invalidState" }]);
  await assert.rejects(sending(), /^Error: The host /);
  if (works) assert.equal(localStorage.getItem("selfhold.sent"), null);
});

test("Stop while waiting out a refusal sends nothing more", async () => {
  resend.afterMs = [60_000];
  const posts = hosts([{ status: 503, refusal: "contextChanged" }]);
  const stop = new AbortController();
  const sent = sending(stop.signal);
  while (posts.length === 0) await new Promise((r) => setTimeout(r, 1));
  await new Promise((r) => setTimeout(r, 5)); // its refusal read, the wait begun
  stop.abort();
  await assert.rejects(sent, (e) => e instanceof Stopped);
  assert.equal(posts.length, 1);
});
