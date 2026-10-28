// How a site and the web wallet's window talk. The site opens the window
// (wallet.selfhold.app/#<id>) from a click; the window says it is ready;
// the site sends one call; the window answers it, with progress on the way.
// The site is whoever the browser says sent the call (the message's
// origin), never what the call says. Pure, so it is testable without a browser.
//
//   window → site   { channel, id, ready: true }
//   site → window   { channel, id, call: { method, params }, route?: { hosts?, sponsor? }, account? }
//   window → site   { channel, id, progress: "…" } … { channel, id, response: { ok, … } }

import { parseProviderCall, type ProviderCall } from "../lib/wallet/provider.ts";
import { normalizeNodeURL } from "../lib/config.ts";

export const CHANNEL = "selfhold";
export const MAX_HOSTS = 8;

/** The calls a site may make of the window: those that need the person. */
export type WindowCall = Extract<ProviderCall, { method: "connect" | "writeRecords" | "signMessage" }>;

/** A site's suggested hosts and fee sponsor, each an http(s) URL; shown to the person, never trusted with more than a write's delivery. */
export interface SiteRoute { hosts: string[]; sponsor: string }

const url = (text: unknown): string | null => (typeof text === "string" ? normalizeNodeURL(text) : null);

export function parseRoute(raw: unknown): SiteRoute | { error: string } {
  if (raw === undefined) return { hosts: [], sponsor: "" };
  if (typeof raw !== "object" || raw === null) return { error: "Malformed route" };
  const { hosts = [], sponsor = "" } = raw as { hosts?: unknown; sponsor?: unknown };
  if (!Array.isArray(hosts) || hosts.length > MAX_HOSTS) return { error: `hosts must be a list of at most ${MAX_HOSTS} URLs` };
  const clean = hosts.map(url);
  if (clean.some((h) => h === null)) return { error: "A host must be an http(s) URL" };
  const sponsorURL = sponsor === "" ? "" : url(sponsor);
  if (sponsorURL === null) return { error: "The sponsor must be an http(s) URL" };
  return { hosts: [...new Set(clean as string[])], sponsor: sponsorURL };
}

/**
 * A site's message to the window, or why it is refused. `account` is the
 * address the site was given and built its write for, if it says one.
 */
export function parseCall(data: unknown, id: string): { call: WindowCall; route: SiteRoute; account?: string } | { error: string } | null {
  if (typeof data !== "object" || data === null) return null;
  const message = data as { channel?: unknown; id?: unknown; call?: unknown; route?: unknown; account?: unknown };
  if (message.channel !== CHANNEL || message.id !== id) return null;
  const call = parseProviderCall(message.call);
  if ("error" in call) return call;
  if (call.method !== "connect" && call.method !== "writeRecords" && call.method !== "signMessage") return { error: `The Selfhold window does not take ${call.method}` };
  const route = parseRoute(message.route);
  if ("error" in route) return route;
  if (message.account === undefined) return { call, route };
  if (typeof message.account !== "string" || message.account.length > 128) return { error: "Malformed account" };
  return { call, route, account: message.account };
}
