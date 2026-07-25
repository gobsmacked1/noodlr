// In-browser text embeddings for Memory Lite. Runs entirely on the GM's client via
// transformers.js (ONNX Runtime Web, WASM) with weights bundled in the module — no API key,
// no network at play time. transformers.js is loaded with a dynamic import() so its ~1 MB of
// JS (and the ORT WASM) are only pulled in when Memory Lite is actually used.
//
// Foundry is not cross-origin isolated (no COOP/COEP), so SharedArrayBuffer is unavailable —
// we force single-threaded WASM. WebGPU is left off for now for maximum compatibility.

import { MODULE_ID, log } from "../../constants";

/** The bundled sentence-embedding model + its output dimension. */
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;

type FeatureExtractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array | number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

/**
 * Resolve a module-relative path to an ABSOLUTE URL. Two reasons this must be absolute:
 *  1) ORT loads its WASM glue via dynamic import(); a bare specifier like "modules/noodlr/…"
 *     is rejected by the browser ("must start with ./ ../ or /"). An absolute URL is valid.
 *  2) Foundry can run under a route prefix — getRoute() accounts for it; new URL() with the
 *     page origin then yields a fully-qualified href that works for both fetch and import().
 */
function moduleUrl(path: string): string {
  const getRoute = (foundry as any).utils?.getRoute;
  const routed = typeof getRoute === "function" ? getRoute(path) : `/${path}`;
  let href = new URL(routed, window.location.origin).href;
  // CRITICAL: getRoute() strips a trailing slash. ORT/transformers treat wasmPaths/localModelPath
  // as DIRECTORY prefixes and resolve child files relative to them, so a missing slash drops the
  // last segment: ".../dist/ort" + "ort-wasm-*.mjs" -> ".../dist/ort-wasm-*.mjs" (404). Re-add the
  // slash when the source path was a directory so the "ort/" (or "models/") segment survives.
  if (path.endsWith("/") && !href.endsWith("/")) href += "/";
  return href;
}

/** Configure transformers.js for fully-offline, module-local, single-threaded operation. */
async function loadTransformers(): Promise<typeof import("@huggingface/transformers")> {
  const tf = await import("@huggingface/transformers");
  const env = tf.env;
  // Only ever use the weights we ship; never phone home to the HF Hub.
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = moduleUrl(`modules/${MODULE_ID}/models/`);
  const wasm = env.backends?.onnx?.wasm;
  if (wasm) {
    // ORT fetches its .wasm and dynamic-imports its .mjs from here at runtime (copied by esbuild).
    // Must be an absolute URL — see moduleUrl() above.
    wasm.wasmPaths = moduleUrl(`modules/${MODULE_ID}/dist/ort/`);
    // No cross-origin isolation in Foundry -> no SharedArrayBuffer -> single thread (asyncify build).
    wasm.numThreads = 1;
  }
  return tf;
}

/** Lazily build (and cache) the feature-extraction pipeline. */
function getExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const tf = await loadTransformers();
      log("Memory Lite: loading embedding model", EMBED_MODEL);
      const pipe = await tf.pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
      return pipe as unknown as FeatureExtractor;
    })().catch((err) => {
      // Reset so a later attempt can retry after the user fixes the environment.
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

/** Whether the model has already been loaded (for UI hints). */
export function isEmbedderLoaded(): boolean {
  return extractorPromise !== null;
}

/**
 * Embed a batch of texts into 384-dim unit vectors (mean-pooled, L2-normalized). Processes in
 * small batches with optional progress so a large ingest doesn't lock the UI in one call.
 */
export async function embedTexts(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const out: number[][] = [];
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const result = await extractor(batch, { pooling: "mean", normalize: true });
    const rows = result.dims[0] ?? batch.length;
    const dim = result.dims[1] ?? EMBED_DIM;
    const data = result.data as Float32Array | number[];
    for (let r = 0; r < rows; r++) {
      const vec = new Array<number>(dim);
      for (let c = 0; c < dim; c++) vec[c] = Number(data[r * dim + c]);
      out.push(vec);
    }
    onProgress?.(Math.min(i + BATCH, texts.length), texts.length);
  }
  return out;
}

/** Embed a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v ?? [];
}

/** Load the model and embed one probe sentence — used by the Diagnostics self-test. */
export async function selfTestEmbedder(): Promise<{ dims: number; ms: number }> {
  const t0 = performance.now();
  const v = await embedQuery("Noodlr Memory Lite embedder self-test.");
  return { dims: v.length, ms: Math.round(performance.now() - t0) };
}
