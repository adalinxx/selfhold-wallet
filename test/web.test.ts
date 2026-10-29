// Selfhold on the web: what a site may send the wallet's window, and what a
// fee sponsor may add to a write before the person's signature goes on it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNEL, MAX_HOSTS, answers, parseCall, parseRoute } from "../src/web/protocol.ts";
import { check } from "../src/web/sponsor.ts";
import { rpId } from "../src/web/account.ts";
import { recordsBody } from "../src/lib/wallet/session.ts";
import { importPrivateKey } from "../src/lib/crypto/accounts.ts";

const id = "4a1c2f0e-0000-4000-8000-000000000000";
const write = { method: "writeRecords", params: { chainPath: ["Nexus", "moniker"], actions: [{ key: "name/ada", newValue: "x" }] } };

test("the window takes one call for its id, of those that need the person, and nothing else", () => {
  const ok = parseCall({ channel: CHANNEL, id, call: write }, id);
  assert.ok(ok && !("error" in ok) && ok.call.method === "writeRecords");
  assert.deepEqual(parseCall({ channel: CHANNEL, id, call: { method: "connect" } }, id), { call: { method: "connect" }, route: { hosts: [], sponsor: "" } });
  // The account the site built a write for, if it says.
  assert.equal((parseCall({ channel: CHANNEL, id, call: write, account: "bafyreiabc" }, id) as { account?: string }).account, "bafyreiabc");
  assert.ok("error" in parseCall({ channel: CHANNEL, id, call: write, account: 7 }, id)!);
  // Another window's message, or another channel's, is not for it.
  assert.equal(parseCall({ channel: CHANNEL, id: "other", call: write }, id), null);
  assert.equal(parseCall({ channel: "lattice-wallet", id, call: write }, id), null);
  assert.equal(parseCall("connect", id), null);
  // Calls that need no window, or no person, are refused.
  for (const method of ["address", "disconnect"]) assert.ok("error" in parseCall({ channel: CHANNEL, id, call: { method } }, id)!);
  assert.ok("error" in parseCall({ channel: CHANNEL, id, call: { method: "signTransfer" } }, id)!);
  assert.ok("error" in parseCall({ channel: CHANNEL, id, call: { ...write, params: { ...write.params, chainPath: ["Other"] } } }, id)!);
});

test("a site's hosts and sponsor are http(s) URLs, few, and only those", () => {
  assert.deepEqual(parseRoute({ hosts: ["https://node.example/", "https://node.example"], sponsor: "https://sponsor.example:8650/sponsor" }),
    { hosts: ["https://node.example"], sponsor: "https://sponsor.example:8650/sponsor" });
  assert.deepEqual(parseRoute({ hosts: ["http://127.0.0.1:27181"] }), { hosts: ["http://127.0.0.1:27181"], sponsor: "" });
  for (const bad of [
    { hosts: ["javascript:alert(1)"] }, { hosts: ["http://node.example"] }, { hosts: "https://node.example" },
    { hosts: Array.from({ length: MAX_HOSTS + 1 }, (_, i) => `https://n${i}.example`) }, { sponsor: "ftp://sponsor.example" }, null,
  ]) assert.ok("error" in parseRoute(bad), JSON.stringify(bad));
});

test("passkeys belong to wallet.selfhold.app wherever the page is served, and to localhost only in tests", () => {
  for (const host of ["wallet.selfhold.app", "selfhold.app", "adalinxx.github.io", "wallet.selfhold.app.", "selfhold.app.example"]) {
    assert.equal(rpId(host), "wallet.selfhold.app", host);
  }
  assert.equal(rpId("localhost"), "localhost");
});

test("a sponsor may add only its fee debit and, when asked, its credit to the account", () => {
  const owner = importPrivateKey("a1".repeat(32)).address;
  const sponsor = importPrivateKey("b2".repeat(32)).address;
  const other = importPrivateKey("c3".repeat(32)).address;
  const draft = recordsBody(owner, { actions: [{ key: "name/ada", newValue: "x" }], fee: 0n, nonce: 3n, chainPath: ["Nexus", "moniker"] });
  const signed = (accountActions: { owner: string; delta: bigint }[], over = {}) => ({ ...draft, accountActions, signers: [owner, sponsor], ...over });

  assert.ok(check(draft, signed([{ owner: sponsor, delta: -1n }]), 1n));
  assert.ok(check(draft, signed([{ owner, delta: 40n }, { owner: sponsor, delta: -41n }]), 1n, 40n));
  for (const [bad, pay] of [
    [signed([{ owner: sponsor, delta: -2n }]), 0n], // more than its fee
    [signed([{ owner: sponsor, delta: 1n }]), 0n], // a credit to itself
    [signed([{ owner: other, delta: 40n }, { owner: sponsor, delta: -41n }]), 40n], // pays someone else
    [signed([{ owner, delta: 39n }, { owner: sponsor, delta: -40n }]), 40n], // less than asked
    [signed([{ owner: sponsor, delta: -1n }], { nonce: 4n }), 0n], // the write changed
    [signed([{ owner: sponsor, delta: -1n }], { actions: [{ key: "name/ada", newValue: "y" }] }), 0n],
    [signed([{ owner: sponsor, delta: -1n }], { signers: [owner, sponsor, other] }), 0n],
    [signed([{ owner, delta: -1n }], { signers: [owner, owner] }), 0n], // the account pays its own fee
  ] as const) assert.throws(() => check(draft, bad, 1n, pay), /changed the transaction/);
});

test("a sent write is sent, then slow, then late, until it lands; three reads of another write in its place lose it", async () => {
  const { waitFor, asSelfholdError, SelfholdError } = await import("../src/web/client.ts");
  const times = { slow: 30, late: 60, giveUp: 200, every: 10, everyLate: 10, read: 1000 };
  const states: string[] = [];
  let reads = 0;
  await waitFor(async () => ++reads >= 8, { onChange: (s) => states.push(s) }, undefined, times);
  assert.deepEqual(states, ["sent", "slow", "late"]);

  // One read of another write, then none: a lagging host, not a loss.
  let n = 0;
  await waitFor(async () => (++n === 1 ? "taken" : n > 3), {}, undefined, times);
  n = 0;
  await assert.rejects(waitFor(async () => (++n, "@ada is someone else's now"), {}, undefined, times), (e: InstanceType<typeof SelfholdError>) => e.code === "Lost" && /someone else's/.test(e.message));
  await assert.rejects(waitFor(async () => false, {}, undefined, times), (e: InstanceType<typeof SelfholdError>) => e.code === "NotRecorded");

  // Check again: a poke reads at once, not at the next turn.
  let wake = () => {};
  const slow = { ...times, every: 60_000 };
  const done = waitFor(async () => true, {}, (now) => (wake = now), slow);
  wake();
  await done;

  // Stopped by its signal.
  const stop = new AbortController();
  const stopped = waitFor(async () => false, { signal: stop.signal }, undefined, slow);
  stop.abort(new Error("left the page"));
  await assert.rejects(stopped, /left the page/);

  assert.equal(asSelfholdError(new Error("The person declined")).code, "Declined");
  assert.equal(asSelfholdError("The person just declined; ask again in a moment").code, "Declined");
  assert.equal(asSelfholdError(new Error("Locked")).code, "Failed");
});

test("a read that hangs is given up on and asked again, so the wait still goes slow and late", async () => {
  const { waitFor } = await import("../src/web/client.ts");
  const times = { slow: 30, late: 60, giveUp: 120, every: 5, everyLate: 5, read: 10 };
  const states: string[] = [];
  let reads = 0;
  // Every read hangs: the wait still moves on, and gives up in the end.
  await assert.rejects(waitFor(() => (reads++, new Promise(() => {})), { onChange: (s) => states.push(s) }, undefined, times), (e: { code?: string }) => e.code === "NotRecorded");
  assert.deepEqual(states, ["sent", "slow", "late"]);
  assert.ok(reads > 3);
});

test("only a wallet's own words or code make a failure a decline", async () => {
  const { asSelfholdError } = await import("../src/web/client.ts");
  assert.equal(asSelfholdError(Object.assign(new Error("whatever it says"), { code: "Declined" })).code, "Declined");
  assert.equal(asSelfholdError(new Error("Sent, but the node did not confirm it (rejected by peer); it may still land")).code, "Failed");
});

test("each kept release of @selfhold/web matches its integrity hash, so a site that pins one gets those bytes", async () => {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  if (!existsSync("releases/web")) return;
  for (const release of readdirSync("releases/web").filter((name) => /^v\d+\.\d+\.\d+$/.test(name))) {
    const bytes = readFileSync(`releases/web/${release}/selfhold.js`);
    assert.equal(readFileSync(`releases/web/${release}/integrity.txt`, "utf8").trim(), `sha384-${createHash("sha384").update(bytes).digest("base64")}`, release);
  }
});

test("a failure links to its code's entry in the docs", async () => {
  const { SelfholdError } = await import("../src/web/client.ts");
  assert.equal(new SelfholdError("PopupBlocked", "x").docUrl, "https://selfhold.app/docs/errors.html#PopupBlocked");
});

test("the window answers https sites and pages on this computer, and nothing else", () => {
  for (const origin of ["https://app.example", "https://localhost", "http://localhost", "http://localhost:8000", "http://127.0.0.1:5173"]) assert.ok(answers(origin), origin);
  for (const origin of ["http://app.example", "http://localhost.evil.com", "http://localhost:", "http://127.0.0.1.", "http://[::1]:8000", "http://app.localhost", "null", "file://", "chrome-extension://abc", "http://user@localhost", "https://"]) assert.ok(!answers(origin), origin);
});

