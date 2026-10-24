import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARK_GEOMETRY } from "../src/popup/mark.ts";

test("the interface mark is the master mark's geometry, shape for shape", () => {
  const master = readFileSync(new URL("../public/assets/selfhold-mark.svg", import.meta.url), "utf8");
  const shapes = [...master.matchAll(/<(path|circle)\s([^>]*?)\/>/g)].map(([, tag, attributes]) =>
    [tag, Object.fromEntries([...attributes.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))]);
  assert.deepEqual(shapes, MARK_GEOMETRY.map(([tag, attributes]) => [tag, { ...attributes }]));
});
