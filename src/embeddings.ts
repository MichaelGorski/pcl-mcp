// src/embeddings.ts
// Local embedding pipeline — zero API cost, works offline.
//
// Model: all-MiniLM-L6-v2
//   • 23 MB download (cached after first run at ~/.cache/huggingface)
//   • 384-dim output
//   • ~3ms/doc on modern hardware
//   • Best-in-class for semantic similarity at this size
//
// The pipeline is lazily initialised on first call and reused.

import type { FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/all-mpnet-base-v2";
const DIMS = 768;

let _pipeline: FeatureExtractionPipeline | null = null;
let _initPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (_pipeline) return _pipeline;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    // Dynamic import so the model only loads when embedding is first needed
    const { pipeline, env } = await import("@huggingface/transformers");

    // Disable remote model fetching after first download for offline resilience
    env.localModelPath = "";
    env.allowLocalModels = true;
    env.allowRemoteModels = true;

    // @ts-expect-error — transformers type union is too complex for TS to resolve
    const p: FeatureExtractionPipeline = await pipeline("feature-extraction", MODEL_ID, {
      dtype: "fp32",   // fp16 would halve memory but fp32 = maximum accuracy
      device: "cpu",
    });
    _pipeline = p;
    return p;
  })();

  return _initPromise;
}

// ─── Embed a single text ───────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const pipe = await getPipeline();

  // Truncate to 512 tokens (model limit) — MiniLM tokens ≈ 3 chars each
  const truncated = text.slice(0, 512 * 3);

  const output = await pipe(truncated, { pooling: "mean", normalize: true });

  // output.data is Float32Array of length 384
  return Array.from(output.data as Float32Array);
}

// ─── Batch embed (sequential to avoid OOM on large corpora) ───────────────────

export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void
): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    try {
      results.push(await embedText(texts[i]!));
    } catch {
      results.push([]);
    }
    onProgress?.(i + 1, texts.length);
  }
  return results;
}

// ─── Cosine similarity (pure JS, no native extensions) ────────────────────────
// For ~200 docs × 384 dims this runs in < 2ms total. No need for FAISS/sqlite-vec.

export function cosineSimilarity(a: number[], b: number[]): number {
  // Both vectors are L2-normalised by the model, so cosine = dot product
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i]! * b[i]!;
  return dot;  // already in [-1, 1]
}

// Rank a corpus by similarity to a query embedding, descending
export function rankBySimilarity(
  query: number[],
  corpus: Array<{ id: string; type: string; embedding: number[] }>,
  topK = 10
): Array<{ id: string; type: string; score: number }> {
  return corpus
    .map(doc => ({
      id:    doc.id,
      type:  doc.type,
      score: cosineSimilarity(query, doc.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export { DIMS };
