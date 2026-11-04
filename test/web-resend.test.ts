// Selfhold on the web: a write a host refuses "for now" is sent again, as
// signed, until a host takes it; any other refusal ends the write at once.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signTransactionBody, signedTransactionCID } from "@adalin/lattice-core";
import { send, resend, type Quote } from "../src/web/send.ts";
import { Stopped } from "../src/web/sponsor.ts";
import { recordsBody } from "../src/lib/wallet/session.ts";
import { importPrivateKey } from "../src/lib/crypto/accounts.ts";

resend.afterMs = [1, 1, 1, 1];
const me = importPrivateKey("a1".repeat(32));
const chainPath = ["Nexus", "moniker"];
const write = { chainPath, actions: [{ key: "name/ada", newValue: "x" }] };
const quoted: Quote = { host: "https://a.test", fee: 1n, balance: 10n, paying: 0n, sponsored: false, covered: true, short: 0n };
const route = { hosts: ["https://a.test", "https://b.test"], sponsor: "" };
// The write as the wallet signs it: Ed25519 is deterministic, so its CID too.
const body = recordsBody(me.address, { actions: write.actions, payments: [], fee: 1n, nonce: 0n, chainPath });
const signed = signTransactionBody(body, me.privateKey);
const cid = signedTransactionCID({ [signed.publicKey]: signed.signature }, body);

/** Hosts that answer reads, and `/transactions` from `answers` in turn, recording each post. */
function hosts(answers: { status: number; refusal?: string }[]) {
  const posts: { host: string; payload: string }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/api/chain/info") return json(200, { minRelayFee: "1", acceptsSubmit: true });
    if (url.pathname.startsWith("/api/state/account/")) return json(200, { balance: "10", nonce: "0" });
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

test("a host catching up, or reading state it let go of, is sent the same write again until it takes it", async () => {
  const posts = hosts([{ status: 503, refusal: "contextChanged" }, { status: 400, refusal: "unavailable" }]);
  const sent = await sending();
  assert.equal(sent.transactionCID, cid);
  assert.equal(sent.host, "https://a.test");
  assert.equal(posts.length, 3);
  assert.ok(posts.every((p) => p.host === "https://a.test" && p.payload === posts[0].payload), "the same signed bytes, to the host that quoted it");
});

test("a host that keeps refusing for now, or is shutting down, hands the write to the chain's next host", async () => {
  const busy = hosts(Array(5).fill({ status: 503, refusal: "contextChanged" }));
  const sent = await sending();
  assert.equal(sent.host, "https://b.test");
  assert.deepEqual(busy.map((p) => p.host), [...Array(5).fill("https://a.test"), "https://b.test"]);
  assert.ok(busy.every((p) => p.payload === busy[0].payload));

  const closing = hosts([{ status: 503, refusal: "shuttingDown" }]);
  assert.equal((await sending()).host, "https://b.test");
  assert.deepEqual(closing.map((p) => p.host), ["https://a.test", "https://b.test"], "a host shutting down is not asked again");
});

test("any other refusal ends the write at once, and a host that never takes it is named", async () => {
  const wrong = hosts([{ status: 400, refusal: "invalidState" }]);
  await assert.rejects(sending(), /The host .*rejects it/);
  assert.equal(wrong.length, 1);

  hosts(Array(6).fill({ status: 400, refusal: "unavailable" }));
  await assert.rejects(sending(), /The host .*try again shortly/);
});

test("Stop while waiting out a refusal sends nothing more", async () => {
  resend.afterMs = [60_000];
  const posts = hosts([{ status: 503, refusal: "contextChanged" }]);
  const stop = new AbortController();
  const sent = sending(stop.signal);
  await new Promise((r) => setTimeout(r, 20));
  stop.abort();
  await assert.rejects(sent, (e) => e instanceof Stopped);
  assert.equal(posts.length, 1);
  resend.afterMs = [1, 1, 1, 1];
});
