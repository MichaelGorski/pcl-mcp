import { mkdtemp, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDB, closeDB } from "../../src/db.js";
import { fullIndex } from "../../src/indexer.js";
import type Database from "better-sqlite3";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

export interface BenchHarness {
  db: Database.Database;
  productDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a fresh benchmark environment:
 * 1. Copy corpus to a temp directory
 * 2. Open a fresh SQLite DB
 * 3. Run fullIndex to populate it
 */
export async function setup(
  corpus: "corpus-small" = "corpus-small",
  options: { skipIndex?: boolean } = {}
): Promise<BenchHarness> {
  // Ensure any previous DB singleton is closed
  closeDB();

  // Create temp directory and copy corpus
  const tmpDir = await mkdtemp(join(tmpdir(), "pcl-bench-"));
  const productDir = join(tmpDir, "product");
  await cp(join(FIXTURES_DIR, corpus), productDir, { recursive: true });

  // Open fresh DB
  const db = openDB(productDir);

  // Index corpus unless skipped
  if (!options.skipIndex) {
    await fullIndex(db, productDir);
  }

  return {
    db,
    productDir,
    cleanup: async () => {
      closeDB();
      await rm(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Warm up the embedding pipeline (first call loads the 23MB model).
 * Call once before timed benchmarks.
 */
export async function warmupEmbeddings(): Promise<void> {
  const { embedText } = await import("../../src/embeddings.js");
  await embedText("warmup");
}

export { FIXTURES_DIR };
