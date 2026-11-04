// Selfhold on the web: a write a host refuses "for now" is sent again, as
// signed, until a host takes it; a host's judgment ends it at once.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { signTransactionBody, signedTransactionCID } from "@adalin/lattice-core";
import { send, resend, type Progress, type Quote } from "../src/web/send.ts";
import { Stopped } from "../src/web/sponsor.ts";
import { recordsBody } from "../src/lib/wallet/session.ts";
import { importPrivateKey } from "../src/lib/crypto/accounts.ts";

const fast = { afterMs: [1, 1, 1, 1], timeoutMs: 200 };
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

type Answer = { status: number; refusal?: string } | "hang";
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
      if (answer === "hang") {
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
      }
      return answer.status === 200 ? json(200, { transactionCID: cid }) : json(answer.status, { error: { message: answer.refusal } });
    }
    return json(404, {});
  }) as typeof fetch;
  return posts;
}

const sending = (signal?: AbortSignal, steps: Progress[] = []) =>
  send(write, me.address, me.privateKey, route, quoted, (step) => steps.push(step), signal);
const same = (posts: { payload: string }[]) => posts.every((p) => p.payload === posts[0].payload);

test("a host catching up, or reading state it let go of, is sent the same write again until it takes it", async () => {
  const posts = hosts([{ status: 503, refusal: "contextChanged" }, { status: 400, refusal: "unavailable" }]);
  const steps: Progress[] = [];
  const sent = await sending(undefined, steps);
  assert.equal(sent.transactionCID, cid);
  assert.equal(sent.host, "https://a.test");
  assert.deepEqual(posts.map((p) => p.host), Array(3).fill("https://a.test"));
  assert.ok(same(posts), "the same signed bytes each time");
  assert.deepEqual(steps.filter((s) => s.stage === "resend"), [{ stage: "resend", maybe: false }, { stage: "resend", maybe: false }]);
});

test("a host that keeps refusing for now, is full or shutting down, or isn't reached hands the write to the next host", async () => {
  const busy = hosts(Array(5).fill({ status: 503, refusal: "contextChanged" }));
  assert.equal((await sending()).host, "https://b.test");
  assert.deepEqual(busy.map((p) => p.host), [...Array(5).fill("https://a.test"), "https://b.test"]);
  assert.ok(same(busy));

  for (const refusal of ["full", "shuttingDown"]) {
    const posts = hosts([{ status: 503, refusal }]);
    assert.equal((await sending()).host, "https://b.test");
    assert.deepEqual(posts.map((p) => p.host), ["https://a.test", "https://b.test"], `${refusal}: not asked again`);
  }

  const gone = hosts([{ status: 502 }]);
  assert.equal((await sending()).host, "https://b.test");
  assert.deepEqual(gone.map((p) => p.host), ["https://a.test", "https://b.test"]);

  const hung = hosts(["hang"]);
  assert.equal((await sending()).host, "https://b.test", "a send that never answers times out");
  assert.equal(hung.length, 2);
});

test("the quoting host's judgment ends the write; another host's doesn't hide the quoting host's answer", async () => {
  const wrong = hosts([{ status: 400, refusal: "invalidState" }]);
  await assert.rejects(sending(), /^Error: The host at https:\/\/a\.test .*rejects it/);
  assert.equal(wrong.length, 1);

  // A's "not now" throughout, B behind: the person hears A, named.
  hosts([...Array(5).fill({ status: 400, refusal: "unavailable" }), { status: 400, refusal: "invalidState" }]);
  await assert.rejects(sending(), /^Error: No host took it: the host at https:\/\/a\.test .*cannot check it yet/);
});

test("a host that gave no answer may have taken it: the write says so and is held as sent", async () => {
  hosts([{ status: 502 }, { status: 503, refusal: "shuttingDown" }]);
  await assert.rejects(sending(), /https:\/\/a\.test didn't answer, so it may have taken this write/);
  let held = true;
  try { localStorage.setItem("probe", "1"); localStorage.removeItem("probe"); } catch { held = false; }
  if (held) assert.match(localStorage.getItem("selfhold.sent") ?? "", new RegExp(cid));
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
});
