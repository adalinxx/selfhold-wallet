// Build Selfhold on the web into dist-web/: the wallet's window, served at
// wallet.selfhold.app, and selfhold.js, the script a site loads to open it;
// and that script as the npm package @selfhold/web, in packages/web/dist/.
// Run: `node build-web.mjs` (add --watch to watch).
import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist-web";

rmSync(outdir, { recursive: true, force: true });
rmSync("packages/web/dist", { recursive: true, force: true });
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
  // What a site loads: small, and kept readable, so it can see what it runs.
  // At /v1/selfhold.js for protocol 1, and at /selfhold.js for sites that load it from before.
  // /selfhold.js keeps to Selfhold's window, as those sites expect.
  await esbuild.context({ ...options, entryPoints: { selfhold: "src/web/client-legacy.ts", "v1/selfhold": "src/web/client.ts" } }),
  // And as the npm package @selfhold/web, in packages/web/.
  await esbuild.context({ ...options, outdir: "packages/web/dist", entryPoints: { selfhold: "src/web/client.ts" } }),
];

if (watch) {
  for (const ctx of contexts) await ctx.watch();
  console.log("watching…");
} else {
  for (const ctx of contexts) {
    await ctx.rebuild();
    await ctx.dispose();
  }
  // The package's types, from the same source.
  execFileSync("npx", ["tsc", "src/web/client.ts", "--declaration", "--emitDeclarationOnly", "--target", "es2022", "--lib", "es2022,dom", "--skipLibCheck", "--outDir", "packages/web/dist"], { stdio: "inherit" });
  renameSync("packages/web/dist/client.d.ts", "packages/web/dist/selfhold.d.ts");
  // Each release of @selfhold/web, kept at its own address for good: /v<version>/selfhold.js, never changed once made.
  const { version } = JSON.parse(readFileSync("packages/web/package.json", "utf8"));
  const built = readFileSync(`${outdir}/v1/selfhold.js`);
  const release = `releases/web/v${version}`;
  if (process.argv.includes("--release")) {
    mkdirSync(release, { recursive: true });
    writeFileSync(`${release}/selfhold.js`, built);
    writeFileSync(`${release}/integrity.txt`, `sha384-${createHash("sha384").update(built).digest("base64")}\n`);
  }
  if (existsSync("releases/web")) cpSync("releases/web", outdir, { recursive: true });
  console.log("built -> dist-web/, packages/web/dist/");
}
