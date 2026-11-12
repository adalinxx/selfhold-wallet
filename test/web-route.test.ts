// Selfhold on the web: a site's hosts are where the wallet starts looking
// for its chain, not the last word. A host that doesn't serve the chain is
// passed over; one that serves it but holds no state for the account is a
// fresh account there.

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { quote, routeFor } from "../src/web/send.ts";
import { importPrivateKey } from "../src/lib/crypto/accounts.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const me = importPrivateKey("a1".repeat(32)).address;
const chainPath = ["Nexus", "app"];
const write = { chainPath, actions: [{ key: "k", newValue: "v" }] };
const GENESIS = "bafynexusgenesis";

/** Each host serves the chains it is given, with `account` its answer for the account (404 when absent); the rest is 404. */
function network(hosts: Record<string, { chains: string[]; account?: object; endpoints?: Record<string, string[]> }>) {
  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const chain = url.searchParams.get("chainPath") ?? "";
    asked.push(`${url.host}${url.pathname} ${chain}`);
    const json = (value: unknown) => Response.json(value);
    const host = hosts[url.host];
    if (host?.chains.includes(chain)) {
      if (url.pathname === "/api/chain/info") return json({ chain: chain.split("/"), height: "3", tipCID: "bafytip", minRelayFee: "2" });
      if (url.pathname === "/api/chain/genesis") return json({ genesisHash: GENESIS });
      if (url.pathname.startsWith("/api/state/account/") && host.account) return json(host.account);
    }
    const declared = host?.endpoints?.[chain];
    if (url.pathname === "/api/chain/endpoints" && declared) return json({ chainPath: chain.split("/"), endpoints: declared });
    return new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 });
  }) as typeof fetch;
  return asked;
}

test("a site's first host serving the chain is still the one written to", async () => {
  network({
    "a.example": { chains: ["Nexus/app"], account: { balance: "10", nonce: "4" } },
    "b.example": { chains: ["Nexus/app"], account: { balance: "10", nonce: "4" } },
  });
  const route = await routeFor(chainPath, { hosts: ["https://a.example", "https://b.example"], sponsor: "" });
  assert.equal(route.hosts[0], "https://a.example");
  const quoted = await quote(write, me, route);
  assert.deepEqual([quoted.host, quoted.fee, quoted.balance], ["https://a.example", 2n, 10n]);
});

test("a site's first host not serving the chain is passed over for the second", async () => {
  network({
    "a.example": { chains: ["Nexus"], account: { balance: "99", nonce: "0" } },
    "b.example": { chains: ["Nexus/app"], account: { balance: "10", nonce: "4" } },
  });
  const site = { hosts: ["https://a.example", "https://b.example"], sponsor: "" };
  // Even given straight to quote: a 404 for the chain is no fresh account.
  assert.equal((await quote(write, me, site)).host, "https://b.example");
  const route = await routeFor(chainPath, site);
  assert.deepEqual(route.hosts, ["https://b.example"]);
  const quoted = await quote(write, me, route);
  assert.deepEqual([quoted.host, quoted.balance], ["https://b.example", 10n]);
});

test("a site whose hosts serve none of the chain has its write sent where the directory says", async () => {
  network({
    "a.example": { chains: ["Nexus"], endpoints: { "Nexus/app": ["https://c.example", "https://d.example"] } },
    "b.example": { chains: ["Nexus"], endpoints: { "Nexus/app": ["https://c.example", "https://d.example"] } },
    "c.example": { chains: ["Nexus/app"], account: { balance: "7", nonce: "1" } },
    "d.example": { chains: ["Nexus/app"], account: { balance: "7", nonce: "1" } },
  });
  const route = await routeFor(chainPath, { hosts: ["https://a.example", "https://b.example"], sponsor: "https://sponsor.example" });
  assert.deepEqual(route, { hosts: ["https://c.example", "https://d.example"], sponsor: "https://sponsor.example" });
  const quoted = await quote(write, me, route);
  assert.deepEqual([quoted.host, quoted.balance], ["https://c.example", 7n]);
});

test("a host serving the chain with no state for the account quotes a fresh account", async () => {
  network({ "a.example": { chains: ["Nexus/app"] } });
  const route = await routeFor(chainPath, { hosts: ["https://a.example"], sponsor: "" });
  const quoted = await quote(write, me, route);
  assert.deepEqual([quoted.host, quoted.fee, quoted.balance], ["https://a.example", 2n, 0n]);
});

test("no host serving the chain anywhere refuses the write", async () => {
  network({ "a.example": { chains: ["Nexus"] } });
  const route = await routeFor(chainPath, { hosts: ["https://a.example"], sponsor: "" });
  assert.deepEqual(route.hosts, ["https://a.example"], "nothing found: the site's hosts as given");
  await assert.rejects(quote(write, me, route), /No host takes transactions for Nexus\/app/);
});
