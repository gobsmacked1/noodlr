// Fetches the offline embedding model for Noodlr Memory Lite into `models/` (gitignored).
// Run once after install / before packaging: `npm run fetch-model`.
//
// We ship a small, fast sentence-embedding model (all-MiniLM-L6-v2, 384-dim) in the
// transformers.js layout so the module can embed entirely in the GM's browser with no API
// key and no network at play time. Only the quantized ONNX weights + tokenizer are fetched.

import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const REPO = "Xenova/all-MiniLM-L6-v2";
const BASE = `https://huggingface.co/${REPO}/resolve/main`;
const OUT = join(process.cwd(), "models", REPO);

// The exact files transformers.js requests for a feature-extraction pipeline (q8 dtype).
const FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download(rel) {
  const dest = join(OUT, rel);
  if (await exists(dest)) {
    console.log(`  = ${rel} (already present)`);
    return;
  }
  await mkdir(dirname(dest), { recursive: true });
  const url = `${BASE}/${rel}`;
  process.stdout.write(`  ↓ ${rel} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}

console.log(`Fetching ${REPO} into models/ …`);
for (const f of FILES) await download(f);
console.log("Done. (models/ is gitignored; it is included in the packaged module.zip.)");
