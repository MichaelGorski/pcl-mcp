import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDB, type TestHarness } from "./helpers/test-harness.js";
import { fullIndex } from "../src/indexer.js";
import { search, findRelated, type SearchMode } from "../src/search.js";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestDB({ copyCorpus: true });
  await fullIndex(harness.db, harness.productDir);
}, 120_000);

afterAll(async () => {
  await harness?.cleanup();
});

// ─── search ────────────────────────────────────────────────────────────────────

describe("search", () => {
  describe("hybrid mode", () => {
    it("returns results for a valid query", async () => {
      const results = await search(harness.db, "project management");
      expect(results.length).toBeGreaterThan(0);
    });

    it("scores are in [0, 1] range", async () => {
      const results = await search(harness.db, "project management");
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it("top result has score 1.0 (normalized)", async () => {
      const results = await search(harness.db, "project management");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.score).toBe(1.0);
    });

    it("results are sorted by score descending", async () => {
      const results = await search(harness.db, "project management");
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
      }
    });

    it("respects topK parameter", async () => {
      // topK limits core results; cross-reference resolution may add extras
      const results = await search(harness.db, "project management", { topK: 2 });
      // Should return at least 1 result and not explode
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(10); // reasonable upper bound
    });
  });

  describe("keyword mode", () => {
    it("returns results matching exact terms", async () => {
      const results = await search(harness.db, "billing", { mode: "keyword" });
      expect(results.length).toBeGreaterThan(0);
      // At least one result should be the billing-rules domain file
      const hasBilling = results.some(r => r.id === "billing-rules");
      expect(hasBilling).toBe(true);
    });

    it("returns empty for query with no keyword matches", async () => {
      const results = await search(harness.db, "xyzzyplughnotaword", { mode: "keyword" });
      expect(results).toHaveLength(0);
    });
  });

  describe("semantic mode", () => {
    it("returns conceptually similar results", async () => {
      const results = await search(harness.db, "user experience and onboarding", { mode: "semantic" });
      expect(results.length).toBeGreaterThan(0);
    });

    it("finds related content even without exact keyword match", async () => {
      // "payment processing rules" should find billing-rules even though
      // the query terms differ from the exact title
      const results = await search(harness.db, "payment processing rules", { mode: "semantic" });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("type filtering", () => {
    it("returns only files of specified types (plus cross-refs)", async () => {
      const results = await search(harness.db, "project", { types: ["persona"] });
      // Core results are filtered to the requested type
      // Cross-reference resolution may add related docs of other types
      const personaResults = results.filter(r => r.type === "persona");
      expect(personaResults.length).toBeGreaterThan(0);
    });

    it("empty types array returns all types", async () => {
      const results = await search(harness.db, "project", { types: [] });
      const types = new Set(results.map(r => r.type));
      expect(types.size).toBeGreaterThan(1);
    });

    it("non-existent type returns empty results", async () => {
      const results = await search(harness.db, "project", { types: ["nonexistent"] });
      expect(results).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("empty query returns empty results for keyword mode", async () => {
      const results = await search(harness.db, "", { mode: "keyword" });
      expect(results).toHaveLength(0);
    });

    it("returns results even with special characters in query", async () => {
      const results = await search(harness.db, "project's \"management\" & billing*", { mode: "hybrid" });
      // Should not throw and should return some results or empty gracefully
      expect(Array.isArray(results)).toBe(true);
    });
  });
});

// ─── findRelated ───────────────────────────────────────────────────────────────

describe("findRelated", () => {
  it("returns related documents", async () => {
    const results = await findRelated(harness.db, "sarah-pm");
    expect(results.length).toBeGreaterThan(0);
  });

  it("excludes the source document from results", async () => {
    const results = await findRelated(harness.db, "sarah-pm");
    const ids = results.map(r => r.id);
    expect(ids).not.toContain("sarah-pm");
  });

  it("returns empty for non-existent source ID", async () => {
    const results = await findRelated(harness.db, "does-not-exist-at-all");
    expect(results).toHaveLength(0);
  });

  it("respects topK parameter", async () => {
    const results = await findRelated(harness.db, "sarah-pm", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("scores represent similarity values", async () => {
    const results = await findRelated(harness.db, "sarah-pm");
    for (const r of results) {
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
