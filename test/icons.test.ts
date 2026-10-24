import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { ICONS, icon, strokeFor, type IconName } from "../src/popup/icons.ts";

test("every icon is drawn at exactly 1 px, at both sizes, hidden beside its word", () => {
  const { window } = new JSDOM("");
  Object.defineProperty(globalThis, "document", { configurable: true, value: window.document });
  for (const name of Object.keys(ICONS) as IconName[]) {
    for (const size of [16, 32] as const) {
      const svg = icon(name, size);
      assert.equal(Number(svg.getAttribute("stroke-width")) * size / 24, 1, `${name} at ${size}`);
      assert.equal(svg.getAttribute("width"), String(size));
      assert.equal(svg.getAttribute("aria-hidden"), "true");
      assert.equal(svg.getAttribute("stroke"), "currentColor");
      assert.equal(svg.children.length, ICONS[name].shapes.length);
    }
  }
  assert.equal(strokeFor(16), 1.5);
  assert.equal(strokeFor(32), 0.75);
});

test("one icon, one meaning: no two names share a Lucide glyph or a meaning", () => {
  const entries = Object.values(ICONS);
  assert.equal(new Set(entries.map((entry) => entry.lucide)).size, entries.length);
  assert.equal(new Set(entries.map((entry) => entry.meaning)).size, entries.length);
});
