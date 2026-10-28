// Selfhold on the web: what a site may send the wallet's window, and what a
// fee sponsor may add to a write before the person's signature goes on it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNEL, MAX_HOSTS, parseCall, parseRoute } from "../src/web/protocol.ts";
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
