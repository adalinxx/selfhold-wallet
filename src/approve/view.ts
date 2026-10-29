// How a request is put on screen, in the extension's approval window and in
// the web wallet's alike: what a page sent is only ever shown as text, and an
// address the wallet knows as its name in an inverted tag, which no text a
// page sends can look like.

import { addressGroups, nameAddresses } from "../lib/wallet/review.ts";
import { icon } from "../popup/icons.ts";

export function el(tag: string, props: Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElement {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
// Characters that print as nothing, or reorder what follows, are shown as
// their code points, so a key cannot pass for another.
// A backslash is escaped too, so an escape shown is never text that looks like one.
export const visible = (text: string) => text.replace(/\\|[^\S ]|[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}\u115f\u1160\u2800\u3164\uffa0]/gu,
  (ch) => ch === "\\" ? "\\\\" : ch === " " ? ch : `\\u{${ch.codePointAt(0)!.toString(16)}}`);
/** A value as sent: the first 400 characters, the rest a click away. */
export function valueNode(label: string, value: string | undefined): HTMLElement {
  if (value === undefined) return el("div", { className: "value", textContent: `${label}: (none)` });
  const text = visible(value);
  if (text.length <= 400) return el("div", { className: "value", textContent: `${label}: ${text}` });
  return el("details", { className: "value" }, el("summary", { textContent: `${label}: ${text.slice(0, 400)}… (${text.length} characters)` }), text);
}
// Exact: amounts are UInt64, never rounded through a double.
export const fmt = (n: string | bigint) => BigInt(n).toLocaleString("en-US");
export const label = (text: string) => el("p", { className: "section-label", textContent: text });
export const row = (key: string, ...value: (Node | string)[]) => el("div", { className: "row" }, el("span", { className: "k", textContent: key }), el("span", { className: "v" }, ...value));

/** A site as people check it: the host, whole and in bold; the scheme only when it is not https. Null: pasted into the wallet. */
export function site(origin: string | null): HTMLElement {
  if (origin === null) return el("span", { className: "origin" }, el("strong", { textContent: "a pasted request" }));
  const url = new URL(origin);
  const here = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  return el("span", { className: "origin" }, ...(url.protocol === "https:" ? [] : [el("span", { className: "scheme", textContent: `${url.protocol}//` })]), el("strong", { textContent: url.host }),
    // A developer's page on this computer, say so: not a site on the web.
    ...(here ? [el("span", { className: "meta", textContent: " (a site on this computer)" })] : []));
}
/** A whole address, four characters to a group, to compare a group at a time. Copied, it is unbroken. */
export const fullAddress = (address: string) => el("span", { className: "groups" }, ...addressGroups(address).map((g) => el("span", { textContent: g })));

/**
 * Text with every address the wallet knows shown as its name, cut to about
 * `limit` characters (Details shows it all).
 */
export function named(text: string, names: ReadonlyMap<string, string>, limit = Infinity): HTMLElement {
  const out = el("span", { className: "named" });
  let room = limit;
  for (const segment of nameAddresses(text, names)) {
    if (room <= 0) break;
    if ("name" in segment) {
      out.append(el("span", { className: "name", title: segment.address, textContent: segment.name }));
      room -= segment.name.length;
    } else {
      const shown = visible(segment.text);
      out.append(shown.length > room ? `${shown.slice(0, room)}…` : shown);
      room -= shown.length;
    }
  }
  return out;
}

/**
 * A risk, at its tier (docs/brand/guidebook.md §6): told apart by ink weight,
 * never color. A warning is outlined in ink; a danger is inverted, and turns
 * the decision round (see `decision`). The message names the specific risk.
 */
export function notice(tier: "warning" | "danger", message: string) {
  return el("p", { className: `notice ${tier}` }, icon("warning"),
    el("span", {}, el("strong", { className: "tier", textContent: tier === "danger" ? "Danger" : "Warning" }), el("span", { className: "notice-text", textContent: message })));
}

