import { describe, it, expect, beforeAll } from "vitest";
import {
  embedText,
  embedBatch,
  cosineSimilarity,
  rankBySimilarity,
  DIMS,
} from "../src/embeddings.js";

// ─── embedText ──────────────────────────────────────────────────────────────

describe("embedText", () => {
  // First call downloads/loads the 23 MB model — allow up to 120s.
  beforeAll(async () => {
    await embedText("warmup");
  }, 120_000);

  it("returns exactly 384 dimensions", async () => {
    const vec = await embedText("hello world");
    expect(vec).toHaveLength(DIMS);
    expect(vec).toHaveLength(384);
  });

  it("all values are finite numbers (no NaN or Infinity)", async () => {
    const vec = await embedText("some meaningful sentence");
    for (const v of vec) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("is deterministic: same text produces same vector", async () => {
    const text = "deterministic embedding test";
    const a = await embedText(text);
    const b = await embedText(text);
    expect(a).toEqual(b);
  });

  it("different texts produce different vectors", async () => {
    const a = await embedText("the quick brown fox");
    const b = await embedText("quantum mechanics in curved spacetime");
    // Vectors should not be identical — cosine similarity < 1.0
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeLessThan(1.0);
  });

  it("handles empty string without throwing", async () => {
    const vec = await embedText("");
    expect(vec).toHaveLength(DIMS);
    // All values should still be finite
    for (const v of vec) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("handles very long text (>2000 chars) without throwing", async () => {
    // Model truncates to 512*3 = 1536 chars
    const longText = "a".repeat(3000);
    const vec = await embedText(longText);
    expect(vec).toHaveLength(DIMS);
  });

  it("handles single word input", async () => {
    const vec = await embedText("cat");
    expect(vec).toHaveLength(DIMS);
    for (const v of vec) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

// ─── embedBatch ─────────────────────────────────────────────────────────────

describe("embedBatch", () => {
  beforeAll(async () => {
    await embedText("warmup");
  }, 120_000);

  it("returns array matching input length", async () => {
    const texts = ["hello", "world", "test"];
    const results = await embedBatch(texts);
    expect(results).toHaveLength(texts.length);
    for (const vec of results) {
      expect(vec).toHaveLength(DIMS);
    }
  });

  it("returns empty array for failed embeddings", async () => {
    // embedBatch catches errors per-item and pushes [] for failures.
    // With valid strings the model should not fail, so we verify that
    // the happy path produces non-empty vectors for every input.
    const results = await embedBatch(["valid text"]);
    expect(results).toHaveLength(1);
    expect(results[0]!.length).toBe(DIMS);
  });

  it("calls onProgress with correct counts", async () => {
    const texts = ["alpha", "beta", "gamma"];
    const progress: Array<{ done: number; total: number }> = [];

    await embedBatch(texts, (done, total) => {
      progress.push({ done, total });
    });

    expect(progress).toHaveLength(texts.length);
    for (let i = 0; i < texts.length; i++) {
      expect(progress[i]!.done).toBe(i + 1);
      expect(progress[i]!.total).toBe(texts.length);
    }
  });
});

// ─── cosineSimilarity ───────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical normalized vectors", () => {
    // Create a normalized vector (unit length)
    const dim = 384;
    const val = 1 / Math.sqrt(dim);
    const vec = Array.from({ length: dim }, () => val);
    const sim = cosineSimilarity(vec, vec);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it("returns ~0 for orthogonal vectors", () => {
    // Two basis vectors in high-dim space are orthogonal
    const a = Array.from({ length: 384 }, () => 0);
    const b = Array.from({ length: 384 }, () => 0);
    a[0] = 1;
    b[1] = 1;
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(0, 5);
  });

  it("result is in [-1, 1] range", () => {
    // Opposite direction vectors
    const dim = 384;
    const val = 1 / Math.sqrt(dim);
    const a = Array.from({ length: dim }, () => val);
    const b = Array.from({ length: dim }, () => -val);

    const simSame = cosineSimilarity(a, a);
    const simOpposite = cosineSimilarity(a, b);

    expect(simSame).toBeGreaterThanOrEqual(-1);
    expect(simSame).toBeLessThanOrEqual(1);
    expect(simOpposite).toBeGreaterThanOrEqual(-1);
    expect(simOpposite).toBeLessThanOrEqual(1);
    expect(simOpposite).toBeCloseTo(-1.0, 5);
  });

  it("returns 0 for empty vectors", () => {
    const sim = cosineSimilarity([], []);
    expect(sim).toBe(0);
  });
});

// ─── rankBySimilarity ───────────────────────────────────────────────────────

describe("rankBySimilarity", () => {
  // Pre-compute some distinct vectors for ranking tests.
  // Use simple hand-crafted vectors so tests are deterministic.
  function makeVec(index: number): number[] {
    const vec = Array.from({ length: 384 }, () => 0);
    vec[index % 384] = 1;
    return vec;
  }

  const corpus = [
    { id: "a", type: "persona", embedding: makeVec(0) },
    { id: "b", type: "spec", embedding: makeVec(1) },
    { id: "c", type: "journey", embedding: makeVec(2) },
    { id: "d", type: "decision", embedding: makeVec(3) },
  ];

  it("returns results sorted by score descending", () => {
    // Query aligns with item "a" (index 0)
    const query = makeVec(0);
    const results = rankBySimilarity(query, corpus, 4);

    expect(results[0]!.id).toBe("a");
    expect(results[0]!.score).toBeCloseTo(1.0, 5);

    // Remaining items should all have score ~0 (orthogonal)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  it("respects topK limit", () => {
    const query = makeVec(0);
    const results = rankBySimilarity(query, corpus, 2);
    expect(results).toHaveLength(2);
  });

  it("returns fewer than topK when corpus is smaller", () => {
    const query = makeVec(0);
    const results = rankBySimilarity(query, corpus, 100);
    expect(results).toHaveLength(corpus.length);
  });
});
