// esbuild bundle config for the Noodlr Foundry module.
// Bundles src/module.ts -> dist/noodlr.js as an ES module (Foundry v13+ loads ESM).
// Foundry globals (game, Hooks, foundry, CONFIG, ...) are provided by the host at runtime.
//
// Code splitting is ON so the heavy Memory Lite embedding stack (transformers.js + ONNX
// Runtime Web) is emitted as a separate chunk, loaded on demand via dynamic import() only
// when a GM actually uses in-browser memory. The ORT WASM/.mjs helpers are copied into
// dist/ort/ (transformers.js fetches them from there at runtime; see rag/local/embedder.ts).

import { build, context } from "esbuild";
import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const watch = process.argv.includes("--watch");

// Single-threaded CPU WASM only (Foundry isn't cross-origin isolated, so no threads/WebGPU).
const ORT_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

async function copyOrtAssets() {
  const src = "node_modules/onnxruntime-web/dist";
  const dest = "dist/ort";
  await mkdir(dest, { recursive: true });
  let names = ORT_FILES;
  try {
    const present = new Set(await readdir(src));
    names = ORT_FILES.filter((f) => present.has(f));
  } catch {
    /* fall through — copy attempts below will report */
  }
  for (const f of names) {
    await cp(join(src, f), join(dest, f));
  }
  console.log(`[noodlr] copied ORT assets -> dist/ort/ (${names.join(", ")})`);
}

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: { noodlr: "src/module.ts" },
  outdir: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  // Node-only backends transformers.js may reference; never used in the browser build.
  external: ["onnxruntime-node", "sharp"],
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
  await copyOrtAssets();
  console.log("[noodlr] esbuild watching for changes...");
} else {
  await build(options);
  await copyOrtAssets();
  console.log("[noodlr] build complete -> dist/noodlr.js");
}
