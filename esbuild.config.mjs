// esbuild bundle config for the Noodlr Foundry module.
// Bundles src/module.ts -> dist/noodlr.js as an ES module (Foundry v13+ loads ESM).
// Foundry globals (game, Hooks, foundry, CONFIG, ...) are provided by the host at
// runtime, so nothing external needs bundling; we ship a single self-contained file.

import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/module.ts"],
  outfile: "dist/noodlr.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  // Keep output human-inspectable during early development; minify at packaging time.
  minify: false,
  logLevel: "info",
  banner: {
    js: "/* Noodlr — AI Dungeon Master for Foundry VTT. MIT. Generated bundle; edit src/. */",
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[noodlr] esbuild watching for changes...");
} else {
  await build(options);
  console.log("[noodlr] build complete -> dist/noodlr.js");
}
