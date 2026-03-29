import { describe, it, expect, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  openDB,
  closeDB,
  packEmbedding,
  unpackEmbedding,
  hashContent,
  upsertFile,
  updateEmbedding,
  deleteFile,
  getFileByPath,
  getFileById,
  getProductFile,
  listByType,
  getCritical,
  getAllWithEmbeddings,
  getAllWithoutEmbeddings,
  keywordSearch,
} from "../src/db.js";
import { createTestDB, createTestFile, type TestHarness } from "./helpers/test-harness.js";

// ─── packEmbedding / unpackEmbedding ────────────────────────────────────────

describe("packEmbedding / unpackEmbedding", () => {
  it("round-trips a 384-dim float vector exactly", () => {
    const vec = Array.from({ length: 384 }, (_, i) => i * 0.001);
    const packed = packEmbedding(vec);
    const unpacked = unpackEmbedding(packed);
    expect(unpacked).toHaveLength(384);
    for (let i = 0; i < vec.length; i++) {
      expect(unpacked[i]).toBeCloseTo(vec[i], 5);
    }
  });

  it("round-trips an empty vector", () => {
    const packed = packEmbedding([]);
    const unpacked = unpackEmbedding(packed);
    expect(unpacked).toEqual([]);
  });

  it("preserves negative values", () => {
    const vec = [-1.5, -0.001, 0, 0.001, 1.5];
    const unpacked = unpackEmbedding(packEmbedding(vec));
    for (let i = 0; i < vec.length; i++) {
      expect(unpacked[i]).toBeCloseTo(vec[i], 5);
    }
  });

  it("maintains Float32 precision", () => {
    // Float32 has ~7 significant digits
    const vec = [Math.PI, Math.E, 1.23456789];
    const unpacked = unpackEmbedding(packEmbedding(vec));
    for (let i = 0; i < vec.length; i++) {
      // Float32 rounds to ~6 decimal precision
      expect(unpacked[i]).toBeCloseTo(vec[i], 5);
    }
  });
});

// ─── hashContent ─────────────────────────────────────────────────────────────

describe("hashContent", () => {
  it("returns a 16-char hex string", () => {
    const hash = hashContent("hello world");
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    const a = hashContent("test content");
    const b = hashContent("test content");
    expect(a).toBe(b);
  });

  it("different content produces different hash", () => {
    const a = hashContent("content A");
    const b = hashContent("content B");
    expect(a).not.toBe(b);
  });

  it("whitespace differences produce different hashes", () => {
    const a = hashContent("hello world");
    const b = hashContent("hello  world");
    expect(a).not.toBe(b);
  });
});

// ─── openDB / closeDB ──────────────────────────────────────────────────────

describe("openDB / closeDB", () => {
  let harness: TestHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("creates .pcl.db in productDir", async () => {
    harness = await createTestDB();
    const dbPath = join(harness.productDir, ".pcl.db");
    expect(existsSync(dbPath)).toBe(true);
  });

  it("closeDB allows re-opening with new path", async () => {
    harness = await createTestDB();
    const file = createTestFile({ path: join(harness.productDir, "personas/p.md") });
    upsertFile(harness.db, file);

    // Close and re-open with a fresh harness
    closeDB();
    const harness2 = await createTestDB();

    // New DB should be empty since it is a different temp dir
    const result = getFileByPath(harness2.db, file.path);
    expect(result).toBeNull();

    await harness2.cleanup();
  });
});

// ─── upsertFile ─────────────────────────────────────────────────────────────

describe("upsertFile", () => {
  let harness: TestHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("inserts a new file", async () => {
    harness = await createTestDB();
    const file = createTestFile({ path: join(harness.productDir, "personas/dev.md") });
    upsertFile(harness.db, file);

    const retrieved = getFileByPath(harness.db, file.path);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(file.id);
    expect(retrieved!.type).toBe(file.type);
    expect(retrieved!.body).toBe(file.body);
  });

  it("updates existing file at same path", async () => {
    harness = await createTestDB();
    const path = join(harness.productDir, "personas/dev.md");
    const file = createTestFile({ path });
    upsertFile(harness.db, file);

    const updated = createTestFile({ path, body: "Updated body content" });
    upsertFile(harness.db, updated);

    const retrieved = getFileByPath(harness.db, path);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.body).toBe("Updated body content");

    // Should still be one row, not two
    const allPersonas = listByType(harness.db, "persona");
    expect(allPersonas).toHaveLength(1);
  });

  it("is idempotent: same file twice produces same result", async () => {
    harness = await createTestDB();
    const file = createTestFile({ path: join(harness.productDir, "personas/dev.md") });
    upsertFile(harness.db, file);
    upsertFile(harness.db, file);

    const allPersonas = listByType(harness.db, "persona");
    expect(allPersonas).toHaveLength(1);
  });

  it("handles file move: same (id,type) different path replaces old", async () => {
    harness = await createTestDB();
    const oldPath = join(harness.productDir, "personas/old-name.md");
    const newPath = join(harness.productDir, "personas/new-name.md");

    const file = createTestFile({ id: "dev-dan", path: oldPath });
    upsertFile(harness.db, file);

    const moved = createTestFile({ id: "dev-dan", path: newPath });
    upsertFile(harness.db, moved);

    // Old path should no longer exist
    expect(getFileByPath(harness.db, oldPath)).toBeNull();
    // New path should exist
    expect(getFileByPath(harness.db, newPath)).not.toBeNull();
    // Only one record for this id/type
    const allPersonas = listByType(harness.db, "persona");
    expect(allPersonas).toHaveLength(1);
  });

  it("stores embedding as BLOB", async () => {
    harness = await createTestDB();
    const embedding = Array.from({ length: 384 }, () => Math.random());
    const file = createTestFile({
      path: join(harness.productDir, "personas/dev.md"),
      embedding,
    });
    upsertFile(harness.db, file);

    const retrieved = getFileByPath(harness.db, file.path);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.embedding).toHaveLength(384);
    for (let i = 0; i < 384; i++) {
      expect(retrieved!.embedding[i]).toBeCloseTo(embedding[i], 5);
    }
  });

  it("stores null embedding when empty array", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      path: join(harness.productDir, "personas/dev.md"),
      embedding: [],
    });
    upsertFile(harness.db, file);

    // File with no embedding should appear in "without embeddings" list
    const withoutEmb = getAllWithoutEmbeddings(harness.db);
    expect(withoutEmb).toHaveLength(1);
    expect(withoutEmb[0].embedding).toEqual([]);
  });
});

// ─── queries ─────────────────────────────────────────────────────────────────

describe("queries", () => {
  let harness: TestHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("getFileByPath returns file for existing path", async () => {
    harness = await createTestDB();
    const file = createTestFile({ path: join(harness.productDir, "personas/dev.md") });
    upsertFile(harness.db, file);

    const result = getFileByPath(harness.db, file.path);
    expect(result).not.toBeNull();
    expect(result!.path).toBe(file.path);
  });

  it("getFileByPath returns null for non-existent path", async () => {
    harness = await createTestDB();
    const result = getFileByPath(harness.db, "/does/not/exist.md");
    expect(result).toBeNull();
  });

  it("getFileById returns file matching (type, id)", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      id: "dev-dan",
      type: "persona",
      path: join(harness.productDir, "personas/dev-dan.md"),
    });
    upsertFile(harness.db, file);

    const result = getFileById(harness.db, "persona", "dev-dan");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("dev-dan");
    expect(result!.type).toBe("persona");
  });

  it("getFileById returns null for non-existent id", async () => {
    harness = await createTestDB();
    const result = getFileById(harness.db, "persona", "does-not-exist");
    expect(result).toBeNull();
  });

  it("getProductFile returns product file", async () => {
    harness = await createTestDB();
    const product = createTestFile({
      id: "acme",
      type: "product",
      path: join(harness.productDir, "product.md"),
      title: "Acme Widget",
    });
    upsertFile(harness.db, product);

    const result = getProductFile(harness.db);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("product");
    expect(result!.title).toBe("Acme Widget");
  });

  it("getProductFile returns null on empty DB", async () => {
    harness = await createTestDB();
    expect(getProductFile(harness.db)).toBeNull();
  });

  it("listByType returns all files of type sorted by id", async () => {
    harness = await createTestDB();

    const files = ["charlie", "alice", "bob"].map((name) =>
      createTestFile({
        id: name,
        path: join(harness.productDir, `personas/${name}.md`),
      }),
    );
    for (const f of files) upsertFile(harness.db, f);

    const result = listByType(harness.db, "persona");
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["alice", "bob", "charlie"]);
  });

  it("listByType returns empty array for type with no files", async () => {
    harness = await createTestDB();
    const result = listByType(harness.db, "journey");
    expect(result).toEqual([]);
  });

  it("getCritical returns only critical files", async () => {
    harness = await createTestDB();
    const critical = createTestFile({
      id: "important",
      type: "domain",
      path: join(harness.productDir, "domain/important.md"),
      critical: true,
    });
    const normal = createTestFile({
      id: "normal",
      type: "domain",
      path: join(harness.productDir, "domain/normal.md"),
      critical: false,
    });
    upsertFile(harness.db, critical);
    upsertFile(harness.db, normal);

    const result = getCritical(harness.db);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("important");
    expect(result[0].critical).toBe(true);
  });

  it("getCritical returns empty on no critical files", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      id: "normal",
      type: "domain",
      path: join(harness.productDir, "domain/normal.md"),
      critical: false,
    });
    upsertFile(harness.db, file);

    expect(getCritical(harness.db)).toEqual([]);
  });

  it("getAllWithEmbeddings returns only files with embeddings", async () => {
    harness = await createTestDB();
    const withEmb = createTestFile({
      id: "with-emb",
      path: join(harness.productDir, "personas/with-emb.md"),
      embedding: Array.from({ length: 384 }, () => 0.5),
    });
    const withoutEmb = createTestFile({
      id: "without-emb",
      path: join(harness.productDir, "personas/without-emb.md"),
      embedding: [],
    });
    upsertFile(harness.db, withEmb);
    upsertFile(harness.db, withoutEmb);

    const result = getAllWithEmbeddings(harness.db);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("with-emb");
  });

  it("getAllWithoutEmbeddings returns only files without embeddings", async () => {
    harness = await createTestDB();
    const withEmb = createTestFile({
      id: "with-emb",
      path: join(harness.productDir, "personas/with-emb.md"),
      embedding: Array.from({ length: 384 }, () => 0.5),
    });
    const withoutEmb = createTestFile({
      id: "without-emb",
      path: join(harness.productDir, "personas/without-emb.md"),
      embedding: [],
    });
    upsertFile(harness.db, withEmb);
    upsertFile(harness.db, withoutEmb);

    const result = getAllWithoutEmbeddings(harness.db);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("without-emb");
  });
});

// ─── embedding cache ─────────────────────────────────────────────────────────

describe("embedding cache", () => {
  let harness: TestHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("getAllWithEmbeddings caches results", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      id: "cached",
      path: join(harness.productDir, "personas/cached.md"),
      embedding: Array.from({ length: 384 }, () => 0.5),
    });
    upsertFile(harness.db, file);

    const first = getAllWithEmbeddings(harness.db);
    const second = getAllWithEmbeddings(harness.db);
    // Cache returns the same array reference
    expect(first).toBe(second);
  });

  it("cache invalidated after upsertFile", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      id: "cached",
      path: join(harness.productDir, "personas/cached.md"),
      embedding: Array.from({ length: 384 }, () => 0.5),
    });
    upsertFile(harness.db, file);

    const first = getAllWithEmbeddings(harness.db);

    // Upsert a new file to invalidate cache
    const file2 = createTestFile({
      id: "new-file",
      path: join(harness.productDir, "personas/new-file.md"),
      embedding: Array.from({ length: 384 }, () => 0.1),
    });
    upsertFile(harness.db, file2);

    const second = getAllWithEmbeddings(harness.db);
    // Should be a different reference because cache was invalidated
    expect(first).not.toBe(second);
    expect(second).toHaveLength(2);
  });

  it("cache invalidated after deleteFile", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      id: "to-delete",
      path: join(harness.productDir, "personas/to-delete.md"),
      embedding: Array.from({ length: 384 }, () => 0.5),
    });
    upsertFile(harness.db, file);

    const first = getAllWithEmbeddings(harness.db);
    expect(first).toHaveLength(1);

    deleteFile(harness.db, file.path);

    const second = getAllWithEmbeddings(harness.db);
    expect(first).not.toBe(second);
    expect(second).toHaveLength(0);
  });
});

// ─── keywordSearch ───────────────────────────────────────────────────────────

describe("keywordSearch", () => {
  let harness: TestHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("returns matching documents", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      id: "searchable",
      path: join(harness.productDir, "personas/searchable.md"),
      title: "Semantic Search Expert",
      body: "This persona specializes in building vector search engines.",
    });
    upsertFile(harness.db, file);

    const results = keywordSearch(harness.db, "vector search");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("searchable");
  });

  it("respects limit parameter", async () => {
    harness = await createTestDB();
    for (let i = 0; i < 5; i++) {
      const file = createTestFile({
        id: `file-${i}`,
        path: join(harness.productDir, `personas/file-${i}.md`),
        title: `Widget maker ${i}`,
        body: `This persona makes widgets in factory ${i}.`,
      });
      upsertFile(harness.db, file);
    }

    const results = keywordSearch(harness.db, "widget", 2);
    expect(results).toHaveLength(2);
  });

  it("returns empty for empty query", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      path: join(harness.productDir, "personas/dev.md"),
    });
    upsertFile(harness.db, file);

    const results = keywordSearch(harness.db, "");
    expect(results).toEqual([]);
  });

  it("handles special FTS5 characters without throwing", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      path: join(harness.productDir, "personas/dev.md"),
    });
    upsertFile(harness.db, file);

    // These characters are special in FTS5 syntax — should not throw
    expect(() => keywordSearch(harness.db, "hello* world^2")).not.toThrow();
    expect(() => keywordSearch(harness.db, '"unclosed quote')).not.toThrow();
    expect(() => keywordSearch(harness.db, "a'b'c")).not.toThrow();
  });
});

// ─── deleteFile ─────────────────────────────────────────────────────────────

describe("deleteFile", () => {
  let harness: TestHarness;

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("removes file from DB", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      path: join(harness.productDir, "personas/dev.md"),
    });
    upsertFile(harness.db, file);
    expect(getFileByPath(harness.db, file.path)).not.toBeNull();

    deleteFile(harness.db, file.path);
    expect(getFileByPath(harness.db, file.path)).toBeNull();
  });

  it("FTS no longer matches deleted file", async () => {
    harness = await createTestDB();
    const file = createTestFile({
      id: "deleteme",
      path: join(harness.productDir, "personas/deleteme.md"),
      title: "Unique unicorn title",
      body: "Completely unique zebra content for search verification.",
    });
    upsertFile(harness.db, file);

    // Verify it is searchable before deletion
    const before = keywordSearch(harness.db, "unicorn");
    expect(before.length).toBeGreaterThan(0);

    deleteFile(harness.db, file.path);

    // Should no longer appear in search results
    const after = keywordSearch(harness.db, "unicorn");
    expect(after).toHaveLength(0);
  });
});
