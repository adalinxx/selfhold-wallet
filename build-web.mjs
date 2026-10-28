// Build Selfhold on the web into dist-web/: the wallet's window, served at
// wallet.selfhold.app, and selfhold.js, the script a site loads to open it.
// Run: `node build-web.mjs` (add --watch to watch).
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist-web";

rmSync(outdir, { recursive: true, force: true });
mkdirSync(`${outdir}/assets`, { recursive: true });
for (const asset of ["tokens.css", "selfhold-mark.svg", "selfhold-icon-32.png"]) cpSync(`public/assets/${asset}`, `${outdir}/assets/${asset}`);
cpSync("src/web/index.html", `${outdir}/index.html`);
cpSync("src/popup/popup.css", `${outdir}/popup.css`);
cpSync("src/approve/approve.css", `${outdir}/approve.css`);
cpSync("src/web/web.css", `${outdir}/web.css`);
// The domain itself is set in the repository's Pages settings: an Actions deploy reads no CNAME file.

const options = { outdir, bundle: true, format: "esm", target: "es2022", platform: "browser", legalComments: "none", sourcemap: watch };
const contexts = [
  await esbuild.context({ ...options, entryPoints: { wallet: "src/web/wallet.ts", "work/worker": "src/web/work/worker.ts" }, minify: !watch }),
  // What a site loads and vendors: small, and kept readable, so it can see what it runs.
  await esbuild.context({ ...options, entryPoints: { selfhold: "src/web/client.ts" } }),
];

if (watch) {
  for (const ctx of contexts) await ctx.watch();
  console.log("watching…");
} else {
  for (const ctx of contexts) {
    await ctx.rebuild();
    await ctx.dispose();
  }
  console.log("built -> dist-web/");
}
