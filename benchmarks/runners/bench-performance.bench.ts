import { describe, bench, beforeAll, afterAll } from "vitest";
import { setup, warmupEmbeddings, type BenchHarness } from "../lib/harness.js";
import { search } from "../../src/search.js";
import { embedText } from "../../src/embeddings.js";
import { keywordSearch, closeDB, openDB } from "../../src/db.js";
import { fullIndex } from "../../src/indexer.js";

let harness: BenchHarness;

beforeAll(async () => {
  await warmupEmbeddings();
  harness = await setup("corpus-small");
}, 120_000);

afterAll(async () => {
  await harness?.cleanup();
});

describe("Indexing", () => {
  bench("fullIndex 10 files (warm, no changes)", async () => {
    // Re-index when nothing changed — measures hash-check speed
    await fullIndex(harness.db, harness.productDir);
  });
});

describe("Search latency", () => {
  bench("search hybrid", async () => {
    await search(harness.db, "billing rules for project management", { mode: "hybrid" });
  });

  bench("search keyword", async () => {
    await search(harness.db, "billing rules for project management", { mode: "keyword" });
  });

  bench("search semantic", async () => {
    await search(harness.db, "billing rules for project management", { mode: "semantic" });
  });
});

describe("Embedding", () => {
  bench("embedText single document", async () => {
    await embedText("A project management tool for freelancers with time tracking and client communication features");
  });
});

describe("Database operations", () => {
  bench("keywordSearch", () => {
    keywordSearch(harness.db, "billing rules", 10);
  });
});

describe("Memory", () => {
  bench("memory snapshot", () => {
    // Just a marker to report memory usage
    const mem = process.memoryUsage();
    if (mem.heapUsed < 0) throw new Error("impossible"); // prevent dead code elimination
  });
});
