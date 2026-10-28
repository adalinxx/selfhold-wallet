// Selfhold on the web, at wallet.selfhold.app: the window a site opens to
// ask the person's account for something. Nothing to install: the account's
// key comes from a passkey (account.ts), asked again for every approval, and
// lives only in this window while it is open. A site never holds the key,
// and sees only what the person approves: an address, a signed write's CID,
// a signed message.
//
// One window, one call (protocol.ts). The site is the origin the browser
// reports for the call; the window refuses to run inside a frame, so no site
// can show it under something else.

import { accountFromPrivateKey } from "@adalin/lattice-core";
import { NEXUS_DEFAULT_NODES } from "../lib/config.ts";
import { chainNodes } from "../lib/wallet/node.ts";
import { otherHosts, payeeRecords, shortAddress } from "../lib/wallet/review.ts";
import { signMessage } from "../lib/wallet/session.ts";
import type { PageWriteRequest } from "../lib/wallet/provider.ts";
import { el, fmt, fullAddress, label, named, notice, row, site, valueNode, visible } from "../approve/view.ts";
import { create, forget, saved, signIn, unlock, type Unlocked } from "./account.ts";
import { CHANNEL, parseCall, type SiteRoute, type WindowCall } from "./protocol.ts";
import { NeedsCoins, quote, send, type Progress, type Quote, type Route } from "./send.ts";
import { Stopped, workDevice } from "./sponsor.ts";

type Answer = { ok: boolean; error?: string; [key: string]: unknown };
const view = document.getElementById("view")!;
// The approving button waits this long in a focused window, so a click meant for the site can't land on it.
const ARM_MS = 800;
const say = (text: string) => el("p", { className: "meta", textContent: text });
const message = (error: unknown) => String((error as Error)?.message ?? error);

function refuseFrame(): boolean {
  if (window.top === window) return false;
  document.documentElement.replaceChildren();
  return true;
}

/** `button`, off until this window has been in front for ARM_MS, and off again whenever it isn't. */
function armed(button: HTMLButtonElement, ready: () => boolean = () => true) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    button.disabled = true;
    clearTimeout(timer);
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    timer = setTimeout(() => { button.disabled = !ready(); }, ARM_MS);
  };
  window.addEventListener("focus", arm);
  window.addEventListener("blur", arm);
  document.addEventListener("visibilitychange", arm);
  arm();
  return Object.assign(button, { arm });
}

const button = (text: string, onclick: () => void, primary = false) =>
  // One filled button a screen, the step forward; every other is outlined.
  el("button", { className: primary ? "btn--primary block" : "btn block", type: "button", textContent: text, onclick }) as HTMLButtonElement;

// ---------------------------------------------------------------- a site's call

// A site on this computer may ask only a wallet on this computer: the published one takes https sites.
const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";

function serve(opener: Window, id: string) {
  let origin: string | null = null;
  let answered = false;
  const reply = (body: object) => opener.postMessage({ channel: CHANNEL, id, ...body }, origin!);
  const answer = (response: Answer, close = true) => {
    if (answered) return;
    answered = true;
    reply({ response });
    if (close) setTimeout(() => window.close(), response.ok ? 900 : 0);
  };
  const decline = () => answer({ ok: false, error: "The person declined" });
  // Closing the window is declining: the site hears it from the window being gone.

  window.addEventListener("message", (event) => {
    if (origin !== null || event.source !== opener) return;
    const parsed = parseCall(event.data, id);
    if (!parsed) return;
    if (!/^https:\/\//.test(event.origin) && !(local && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(event.origin))) return;
    origin = event.origin;
    if ("error" in parsed) return answer({ ok: false, error: parsed.error });
    const { call, route } = parsed;
    handle(call, origin, route, { answer, decline, progress: (text) => reply({ progress: text }) })
      .catch((error) => { show(el("p", { className: "warn", textContent: `${message(error)}. Nothing was signed.` }), button("Close", () => answer({ ok: false, error: message(error) }))); });
  });
  opener.postMessage({ channel: CHANNEL, id, ready: true }, "*");
  show(say("Waiting for the site…"));
}

interface Replies { answer: (response: Answer, close?: boolean) => void; decline: () => void; progress: (text: string) => void }

async function handle(call: WindowCall, origin: string, route: SiteRoute, replies: Replies) {
  const account = saved() ?? await setUp(origin, call.method === "connect" ? "connect" : "approve");
  if (call.method === "connect") return connect(origin, account.address, replies);
  if (call.method === "signMessage") return sign(origin, account.address, call.params.text, replies);
  return review(origin, account.address, call.params, route, replies);
}

/** A first account, made or found with a passkey, for `origin`'s request. */
function setUp(origin: string, purpose: "connect" | "approve"): Promise<{ address: string }> {
  return new Promise((resolve) => {
    const status = el("p", { className: "warn", role: "status" });
    const run = (how: () => Promise<Unlocked>) => () => {
      status.textContent = "";
      how().then(({ address }) => resolve({ address }), (error) => (status.textContent = message(error)));
    };
    show(
      el("h1", { textContent: purpose === "connect" ? "Connect" : "Sign in" }),
      el("p", {}, site(origin), " asks for your Selfhold account."),
      say("Selfhold keeps your account in a passkey on this device: nothing to install, and the same account on every site that uses Selfhold."),
      button("Create an account", run(create), true),
      button("I have a Selfhold passkey", run(signIn)),
      status,
    );
  });
}

function connect(origin: string, address: string, { answer, decline }: Replies) {
  const status = el("p", { className: "warn", role: "status" });
  const approve = armed(button("Connect", () => {
    answer({ ok: true, address });
    show(el("h1", { textContent: "Connected" }));
  }, true));
  show(
    el("h1", { textContent: "Connect" }),
    el("p", {}, site(origin), " asks for your account's address."),
    el("section", { className: "balance-card" }, label("Your account"), el("p", { className: "mono", textContent: shortAddress(address) })),
    say("It will see the address and what the account holds. It can't move anything: every write asks you here."),
    el("div", { className: "actions-row" }, button("Decline", decline), approve),
    el("button", { className: "text-action", type: "button", textContent: "Use another Selfhold passkey", onclick: () => {
      status.textContent = "";
      signIn().then(({ address }) => connect(origin, address, { answer, decline, progress: () => {} }), (error) => (status.textContent = message(error)));
    } }),
    status,
  );
}

function sign(origin: string, address: string, text: string, { answer, decline }: Replies) {
  const status = el("p", { className: "warn", role: "status" });
  let busy = false;
  const approve = armed(button("Sign with your passkey", () => {
    if (busy) return;
    busy = true;
    approve.arm();
    status.textContent = "";
    unlock(address).then(({ key }) => {
      const { publicKey, signature } = signMessage({ index: -1, ...accountFromPrivateKey(key) }, origin, text);
      key.fill(0);
      answer({ ok: true, publicKey, signature });
      show(el("h1", { textContent: "Signed" }));
    }, (error) => {
      busy = false;
      approve.arm();
      status.textContent = message(error);
    });
  }, true), () => !busy);
  const others = otherHosts(text, origin);
  show(
    el("h1", { textContent: "Sign a message" }),
    el("p", {}, "from ", site(origin), " · as ", el("span", { className: "mono", textContent: shortAddress(address) })),
    ...(others.length ? [notice("danger", `This message names ${others.join(", ")}, not the site asking. A message for another site, signed here, is how accounts are taken.`)] : []),
    el("pre", { className: "message", textContent: visible(text) }),
    status,
    el("div", { className: "actions-row" }, button("Decline", decline), approve),
  );
}

/** The hosts for a write: the site's, else those the Nexus directory names for its chain. */
async function routeFor(chainPath: string[], route: SiteRoute): Promise<Route> {
  if (route.hosts.length) return route;
  const found = await chainNodes([...NEXUS_DEFAULT_NODES]).list(chainPath);
  return { hosts: found.map((node) => node.url), sponsor: route.sponsor };
}

async function review(origin: string, address: string, write: PageWriteRequest, siteRoute: SiteRoute, replies: Replies) {
  const { answer, decline, progress } = replies;
  if (write.payments?.some((p) => p.to === address)) return answer({ ok: false, error: "A write cannot pay the account that signs it" });
  show(say("Reading the chain…"));
  const route = await routeFor(write.chainPath, siteRoute);
  let quoted: Quote;
  try {
    quoted = await quote(write, address, route);
  } catch (error) {
    return show(el("p", { className: "warn", textContent: `${message(error)}. Nothing was signed.` }), button("Close", () => answer({ ok: false, error: message(error) })));
  }
  const device = quoted.sponsored ? await workDevice() : null;
  const chain = write.chainPath.join("/");
  const payments = write.payments ?? [];
  const names = new Map([[address, "you"], ...payments.map((p, i): [string, string] => [p.to, payments.length === 1 ? "payee" : `payee ${i + 1}`])]);
  const namedBy = payeeRecords(write.actions, payments);

  const feeLine = quoted.fee === 0n ? "No network fee"
    : device ? `Network fee ${fmt(quoted.fee)}, paid with work on this device's ${device}${quoted.covered ? ", or from your coins if that can't be done" : ""}`
    : `Network fee ${fmt(quoted.fee)}, from your coins`;
  // Every coin that can leave the account, fee included, is in the headline.
  const fromCoins = quoted.sponsored ? quoted.paying - quoted.short : quoted.paying + quoted.fee;
  const atMost = quoted.sponsored && quoted.covered ? quoted.paying + quoted.fee : fromCoins;
  const feeFromCoins = !quoted.sponsored || quoted.covered;
  const dear = feeFromCoins && quoted.fee > 0n && (quoted.paying > 0n ? quoted.fee * 2n >= quoted.paying : quoted.fee * 4n >= quoted.balance);
  const summary = el("section", { className: "balance-card summary" },
    label(atMost === 0n ? "No coins move" : "You pay"),
    ...(atMost > 0n ? [el("span", { className: "balance-value", textContent: fmt(fromCoins) })] : []),
    ...(atMost > fromCoins ? [say(`${fmt(atMost)} if the work can't be done: the fee then comes from your coins.`)] : []),
    el("p", { className: "meta", textContent: `on ${chain} · you hold ${fmt(quoted.balance)}` }),
    ...(dear ? [notice("warning", `The network fee is ${fmt(quoted.fee)} of your ${fmt(quoted.balance)} coins${quoted.paying > 0n ? `, against ${fmt(quoted.paying)} paid` : ""}. Check it before you approve.`)] : []),
    ...(quoted.short > 0n && quoted.sponsored ? [say(`The fee sponsor pays the ${fmt(quoted.short)} you're short, for more work.`)] : []),
    el("ul", { className: "breakdown" },
      ...payments.map((p, i) => el("li", {}, el("span", { className: "amount", textContent: fmt(p.amount) }), el("div", { className: "to" },
        el("div", {}, "to ", el("span", { className: "name", title: p.to, textContent: names.get(p.to)! }), namedBy[i] ? "" : ", an address the site chose"),
        namedBy[i] ? el("div", { className: "meta" }, "in record ", named(namedBy[i]!, names, 60)) : el("div", { className: "meta" }, fullAddress(p.to)),
        ...(namedBy[i] ? [] : [notice("danger", "No record in this write names this address. Check every group of it before you pay.")])))),
      el("li", {}, el("div", { className: "to", textContent: feeLine }))));

  const change = (a: PageWriteRequest["actions"][number]) =>
    a.newValue === undefined ? el("div", { className: "meta" }, "deleted · was ", named(a.oldValue ?? "", names, 80))
    : a.oldValue === undefined ? el("div", { className: "meta" }, "new · ", named(a.newValue, names, 80))
    : el("div", { className: "meta" }, named(a.oldValue, names, 40), " → ", named(a.newValue, names, 40));

  const status = el("p", { className: "meta", role: "status" });
  const short = !quoted.sponsored && !quoted.covered;
  let busy = false;
  const approve = armed(button("Approve with your passkey", async () => {
    busy = true;
    approve.arm();
    status.className = "meta";
    status.textContent = "";
    let key: Uint8Array;
    try {
      ({ key } = await unlock(address));
    } catch (error) {
      busy = false;
      approve.arm();
      status.className = "warn";
      status.textContent = message(error);
      return;
    }
    const stopping = new AbortController();
    const screen = working(quoted, route, device, () => stopping.abort());
    const tell = (step: Progress) => { screen.update(step); progress(words(step)); };
    try {
      const transactionCID = await send(write, address, key, route, quoted, tell, stopping.signal);
      answer({ ok: true, transactionCID, address });
      show(el("h1", { textContent: "Sent" }), say("You can close this window."));
    } catch (error) {
      if (error instanceof Stopped) return answer({ ok: false, error: "The person declined" });
      const needs = error instanceof NeedsCoins
        ? { code: "NeedsCoins", address: error.address, needed: String(error.needed), balance: String(error.balance), sponsor: error.sponsor } : {};
      answer({ ok: false, error: message(error), ...needs }, false);
      show(el("p", { className: "warn", textContent: message(error) }), button("Close", () => window.close()));
    } finally {
      key.fill(0);
    }
  }, true), () => !busy && !short);

  show(
    el("h1", { textContent: payments.length ? "Review payment" : "Review write" }),
    el("p", { className: "from" }, "from ", site(origin)),
    summary,
    ...(short ? [notice("warning", `Your account holds ${fmt(quoted.balance)}: this needs ${fmt(fromCoins)}.`)] : []),
    label(`Records · ${write.actions.length}`),
    el("ul", { className: "records" }, ...write.actions.map((a) => el("li", {}, el("div", { className: "key" }, named(a.key, names, 80)), change(a)))),
    el("details", { className: "advanced" },
      el("summary", { textContent: "Details" }),
      el("div", { className: "advanced-content" },
        el("div", { className: "kv" },
          row("Account", fullAddress(address)),
          row("Chain", chain),
          row("Host", quoted.host),
          ...(route.sponsor ? [row("Fee sponsor", route.sponsor)] : []),
          ...payments.map((p) => row(names.get(p.to)!, fullAddress(p.to)))),
        label("Records as sent"),
        el("ul", { className: "records raw" }, ...write.actions.map((a) => el("li", {},
          el("div", { className: "key", textContent: visible(a.key) }),
          ...(a.newValue === undefined ? [valueNode("delete, was", a.oldValue)]
            : a.oldValue === undefined ? [valueNode("new", a.newValue)]
            : [valueNode("was", a.oldValue), valueNode("now", a.newValue)])))))),
    status,
    // Too few coins and no sponsor: nothing to approve, and the site hears why, so it can offer coins.
    short
      ? button("Close", () => answer({ ok: false, error: `Your account needs ${fromCoins} coins for this and holds ${quoted.balance}.`, code: "NeedsCoins", address, needed: String(fromCoins), balance: String(quoted.balance), sponsor: null }), true)
      : el("div", { className: "actions-row" }, button("Decline", () => !busy && decline()), approve),
  );
}

// ---------------------------------------------------------------- the write, being paid for and sent

const STEPS = [["work", "Getting work from the fee sponsor"], ["grind", "Working on this device"], ["sign", "The sponsor adds the fee"], ["send", "Sending to Lattice"]] as const;
const about = (ms: number) => (ms < 90_000 ? `About ${Math.max(1, Math.round(ms / 1000))} s left` : `About ${Math.round(ms / 60_000)} min left`);
const rate = (perMs: number) => (perMs >= 1000 ? `${(perMs / 1000).toFixed(1)} million hashes a second` : `${Math.round(perMs)} thousand hashes a second`);

/** A step, as the site hears it. */
function words(step: Progress): string {
  switch (step.stage) {
    case "work": return "Getting work from the fee sponsor…";
    case "busy": return "The fee sponsor is busy; trying again in a moment…";
    case "grind": return `Paying the fee with this device's ${step.device}${step.left && step.left >= 1000 ? `, ${about(step.left).toLowerCase()}` : ""}…`;
    case "sign": return "The fee sponsor is adding the fee…";
    case "coins": return "Paying the fee from your coins…";
    case "send": return "Sending…";
  }
}

/**
 * The screen while a write is paid for and sent: with a sponsor, what is
 * happening and why, a bar that only moves forward, a rough time left, the
 * steps, and Stop, while nothing has been sent; without one, only Sending.
 */
function working(quoted: Quote, route: Route, device: string | null, stop: () => void) {
  if (!quoted.sponsored) {
    show(el("h1", { textContent: "Sending" }), say("Your passkey signed it. This takes a moment."));
    return { update: () => {} };
  }
  const bar = el("div", { className: "work-bar", role: "progressbar", ariaValueMin: "0", ariaValueMax: "100", ariaValueNow: "0", ariaLabel: "Work done" }, el("span"));
  const fill = bar.firstChild as HTMLElement;
  const left = el("p", { className: "work-left", textContent: "Starting…" });
  const steps = STEPS.map(([, text]) => el("li", { textContent: text }));
  const facts = el("div", { className: "kv" }, row("Device", `This device's ${device}`), row("Fee sponsor", route.sponsor));
  const speed = row("Speed", "measuring…");
  const shares = row("Shares accepted", "0");
  facts.append(speed, shares);
  // Quiet, and away from where Approve was: a second click there must not stop the work.
  const stopButton = el("button", { className: "text-action", type: "button", textContent: "Stop, and send nothing", onclick: stop }) as HTMLButtonElement;
  show(
    el("h1", { textContent: `Paying the fee with your ${device}` }),
    say(`Instead of coins, this device does work for the fee sponsor, and the sponsor pays the network fee (${fmt(quoted.fee)} ${quoted.fee === 1n ? "coin" : "coins"}).`),
    bar,
    left,
    el("ol", { className: "work-steps" }, ...steps),
    say("Keep this window open. Nothing is sent until the work is done."),
    el("details", { className: "advanced" }, el("summary", { textContent: "Details" }), el("div", { className: "advanced-content" }, facts)),
    stopButton,
  );
  let at = 0;
  return {
    update(step: Progress) {
      const index = step.stage === "busy" ? 0 : STEPS.findIndex(([stage]) => stage === step.stage);
      if (index >= 0) at = Math.max(at, index);
      steps.forEach((item, i) => (item.className = i < at ? "done" : i === at ? "now" : ""));
      if (step.stage === "busy") left.textContent = "The fee sponsor is busy. Trying again in a moment…";
      if (step.stage === "grind") {
        const done = Math.round((step.done ?? 0) * 100);
        fill.style.width = `${done}%`;
        bar.setAttribute("aria-valuenow", String(done));
        left.textContent = step.left === undefined ? "Measuring this device's speed…"
          : step.left >= 1000 ? about(step.left) : "Almost done. Waiting for the fee sponsor to count the work…";
        if (step.rate) speed.lastChild!.textContent = rate(step.rate);
        shares.lastChild!.textContent = String(step.shares ?? 0);
      }
      if (step.stage === "sign" || step.stage === "send") {
        fill.style.width = "100%";
        bar.setAttribute("aria-valuenow", "100");
        left.textContent = step.stage === "sign" ? "Work done." : "Sending…";
        // Past here the write is being sent: stopping can't take it back.
        stopButton.disabled = true;
      }
      if (step.stage === "coins") {
        left.textContent = "The fee sponsor can't help now: paying the fee from your coins…";
        stopButton.disabled = true;
      }
    },
  };
}

// ---------------------------------------------------------------- opened on its own

function home() {
  const account = saved();
  if (!account) {
    const status = el("p", { className: "warn", role: "status" });
    const run = (how: () => Promise<Unlocked>) => () => how().then(home, (error) => (status.textContent = message(error)));
    return show(
      el("h1", { textContent: "Selfhold" }),
      say("A Lattice account in a passkey: nothing to install, and the same account on every site that uses Selfhold."),
      button("Create an account", run(create), true),
      button("I have a Selfhold passkey", run(signIn)),
      status,
    );
  }
  show(
    el("h1", { textContent: "Selfhold" }),
    el("section", { className: "balance-card" }, label("Your account"), el("p", {}, fullAddress(account.address))),
    say("Sites that use Selfhold open this window to ask you. Your passkey approves each write."),
    el("button", { className: "text-action", type: "button", textContent: "Forget this account here", onclick: () => { forget(); home(); } }),
  );
}

function show(...children: (Node | string)[]) {
  view.replaceChildren(...children);
}

if (!refuseFrame()) {
  const id = location.hash.slice(1);
  const opener = window.opener as Window | null;
  if (opener && /^[A-Za-z0-9-]{8,64}$/.test(id)) serve(opener, id);
  else home();
}
