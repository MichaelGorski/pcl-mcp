import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTestDB,
  writeTestMarkdown,
  CORPUS_DIR,
  type TestHarness,
} from "./helpers/test-harness.js";
import { parseFile, indexFile, fullIndex } from "../src/indexer.js";
import { embedText } from "../src/embeddings.js";
import { getFileByPath } from "../src/db.js";

// ─── parseFile ──────────────────────────────────────────────────────────────

describe("parseFile", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    // Warm up embedding model for later suites
    await embedText("warmup");
  }, 120_000);

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("parses valid persona markdown into correct shape", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "personas/alpha-user.md",
      {
        id: "alpha-user",
        name: "Alpha User",
        role: "Engineer",
        primary_goal: "Ship fast",
      },
      "## About\n\nAlpha user is a power user who loves automation."
    );

    const result = await parseFile(path, harness.productDir);

    expect(result).not.toBeNull();
    expect(result!.file.id).toBe("alpha-user");
    expect(result!.file.type).toBe("persona");
    expect(result!.file.body).toContain("Alpha user is a power user");
    expect(result!.file.frontmatter).toHaveProperty("name", "Alpha User");
    expect(typeof result!.file.hash).toBe("string");
    expect(result!.file.hash.length).toBeGreaterThan(0);
  });

  it("detects type 'product' from path product.md", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "product.md",
      {
        name: "TestProduct",
        tagline: "A test",
        problem: "Testing",
        solution: "Tests",
        primary_persona: "tester",
        stage: "idea",
      },
      "# Product"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.type).toBe("product");
  });

  it("detects type 'persona' from path personas/x.md", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "personas/test-persona.md",
      { id: "test-persona", name: "Test", role: "Tester", primary_goal: "Test" },
      "Body"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.type).toBe("persona");
  });

  it("detects type 'journey' from path journeys/x.md", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "journeys/test-journey.md",
      {
        id: "test-journey",
        persona: "tester",
        trigger: "click",
        success_state: "done",
        steps: "step1",
      },
      "Journey body"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.type).toBe("journey");
  });

  it("detects type 'spec' from path specs/x.md", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "specs/test-spec.md",
      { id: "test-spec", title: "Test Spec", status: "draft" },
      "Spec body"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.type).toBe("spec");
  });

  it("detects type 'decision' from path decisions/x.md", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "decisions/adr-test.md",
      {
        id: "adr-test",
        title: "Test Decision",
        status: "proposed",
        date: "2025-01-01",
        context: "Testing",
        decision: "Decided",
      },
      "Decision body"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.type).toBe("decision");
  });

  it("detects type 'domain' from path domain/x.md", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "domain/rules.md",
      { id: "rules", title: "Business Rules" },
      "Domain rules here"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.type).toBe("domain");
  });

  it("returns null for unrecognized path (e.g., random/file.md)", async () => {
    harness = await createTestDB();
    // Write a file outside the recognized directories
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const dir = join(harness.productDir, "random");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "file.md");
    await writeFile(path, "---\nid: x\n---\nBody");

    const result = await parseFile(path, harness.productDir);
    expect(result).toBeNull();
  });

  it("returns null for non-existent file", async () => {
    harness = await createTestDB();
    const fakePath = harness.productDir + "/personas/does-not-exist.md";
    const result = await parseFile(fakePath, harness.productDir);
    expect(result).toBeNull();
  });

  it("returns error when frontmatter fails validation", async () => {
    harness = await createTestDB();
    // Persona requires id, name, role, primary_goal — omit required fields
    const path = await writeTestMarkdown(
      harness.productDir,
      "personas/invalid.md",
      { id: "invalid" },
      "Body with missing fields"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.error).toBeDefined();
    expect(typeof result!.error).toBe("string");
    expect(result!.error!.length).toBeGreaterThan(0);
  });

  it("still returns file data when frontmatter is invalid", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "personas/partial.md",
      { id: "partial" },
      "Some body content"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.error).toBeDefined();
    // Even with validation failure, file data is returned
    expect(result!.file.id).toBe("partial");
    expect(result!.file.type).toBe("persona");
    expect(result!.file.body).toContain("Some body content");
  });

  it("derives id from frontmatter.id when present", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "personas/filename-differs.md",
      {
        id: "custom-id",
        name: "Custom",
        role: "Tester",
        primary_goal: "Test",
      },
      "Body"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.id).toBe("custom-id");
  });

  it("derives id from filename when frontmatter.id is missing", async () => {
    harness = await createTestDB();
    // Product schema does not require an id field in frontmatter
    const path = await writeTestMarkdown(
      harness.productDir,
      "product.md",
      {
        name: "NoIdProduct",
        tagline: "Tag",
        problem: "Prob",
        solution: "Sol",
        primary_persona: "tester",
        stage: "idea",
      },
      "Body"
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    // Falls back to basename without extension: "product"
    expect(result!.file.id).toBe("product");
  });

  it("sets critical=true only for domain files with critical: true", async () => {
    harness = await createTestDB();

    const criticalPath = await writeTestMarkdown(
      harness.productDir,
      "domain/critical-rules.md",
      { id: "critical-rules", critical: true, title: "Critical" },
      "Critical domain rules"
    );
    const nonCriticalPath = await writeTestMarkdown(
      harness.productDir,
      "domain/normal-rules.md",
      { id: "normal-rules", critical: false, title: "Normal" },
      "Normal domain rules"
    );
    const personaPath = await writeTestMarkdown(
      harness.productDir,
      "personas/not-domain.md",
      { id: "not-domain", name: "NPC", role: "None", primary_goal: "Nothing" },
      "Not a domain file"
    );

    const critical = await parseFile(criticalPath, harness.productDir);
    const nonCritical = await parseFile(nonCriticalPath, harness.productDir);
    const persona = await parseFile(personaPath, harness.productDir);

    expect(critical!.file.critical).toBe(true);
    expect(nonCritical!.file.critical).toBe(false);
    expect(persona!.file.critical).toBe(false);
  });

  it("generates summary from first 300 chars of body", async () => {
    harness = await createTestDB();
    const longBody = "A".repeat(500);
    const path = await writeTestMarkdown(
      harness.productDir,
      "domain/long-body.md",
      { id: "long-body", title: "Long" },
      longBody
    );

    const result = await parseFile(path, harness.productDir);
    expect(result).not.toBeNull();
    expect(result!.file.summary.length).toBeLessThanOrEqual(300);
  });
});

// ─── indexFile ───────────────────────────────────────────────────────────────

describe("indexFile", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    await embedText("warmup");
  }, 120_000);

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("indexes a new file and returns indexed: true", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "personas/new-persona.md",
      {
        id: "new-persona",
        name: "New Persona",
        role: "Engineer",
        primary_goal: "Build things",
      },
      "## About\n\nA brand new persona for testing."
    );

    const result = await indexFile(harness.db, path, harness.productDir, true);

    expect(result.indexed).toBe(true);
    expect(result.embedded).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify it was actually written to DB
    const stored = getFileByPath(harness.db, path);
    expect(stored).not.toBeNull();
    expect(stored!.id).toBe("new-persona");
    expect(stored!.embedding.length).toBe(384);
  });

  it("skips re-indexing when content hash unchanged", async () => {
    harness = await createTestDB();
    const path = await writeTestMarkdown(
      harness.productDir,
      "personas/stable.md",
      {
        id: "stable",
        name: "Stable Persona",
        role: "Tester",
        primary_goal: "Remain stable",
      },
      "Unchanged body content"
    );

    // First index
    const first = await indexFile(harness.db, path, harness.productDir, true);
    expect(first.indexed).toBe(true);

    // Second index with same content — should skip
    const second = await indexFile(harness.db, path, harness.productDir, true);
    expect(second.indexed).toBe(false);
    expect(second.embedded).toBe(false);
  });

  it("returns indexed: false for non-markdown paths", async () => {
    harness = await createTestDB();
    // parseFile returns null for unrecognized paths
    const result = await indexFile(
      harness.db,
      harness.productDir + "/README.txt",
      harness.productDir,
      false
    );

    expect(result.indexed).toBe(false);
    expect(result.embedded).toBe(false);
  });
});

// ─── fullIndex ──────────────────────────────────────────────────────────────

describe("fullIndex", () => {
  let harness: TestHarness;

  beforeAll(async () => {
    await embedText("warmup");
  }, 120_000);

  afterEach(async () => {
    if (harness) await harness.cleanup();
  });

  it("indexes all markdown files in corpus", async () => {
    harness = await createTestDB({ copyCorpus: true });
    const result = await fullIndex(harness.db, harness.productDir);

    // corpus-small has: product.md + 2 personas + 2 journeys + 2 specs + 1 decision + 2 domain = 10
    expect(result.total).toBeGreaterThan(0);
    expect(result.indexed).toBe(result.total);
    expect(result.errors).toBeInstanceOf(Array);
  });

  it("reports correct total count", async () => {
    harness = await createTestDB({ copyCorpus: true });
    const result = await fullIndex(harness.db, harness.productDir);

    // Verify total matches the actual number of .md files in the fixture corpus
    const { readdir } = await import("node:fs/promises");
    const { join } = await import("node:path");

    async function countMd(dir: string): Promise<number> {
      let count = 0;
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) count += await countMd(join(dir, e.name));
        else if (e.isFile() && e.name.endsWith(".md")) count++;
      }
      return count;
    }

    const expected = await countMd(harness.productDir);
    expect(result.total).toBe(expected);
  });

  it("on re-run with no changes, indexed count is 0", async () => {
    harness = await createTestDB({ copyCorpus: true });

    // First run — indexes everything
    await fullIndex(harness.db, harness.productDir);

    // Second run — nothing changed, so indexed should be 0
    const second = await fullIndex(harness.db, harness.productDir);
    expect(second.indexed).toBe(0);
    expect(second.total).toBeGreaterThan(0);
  });

  it("calls onProgress with done/total/path", async () => {
    harness = await createTestDB({ copyCorpus: true });
    const progress: Array<{ done: number; total: number; path: string }> = [];

    const result = await fullIndex(harness.db, harness.productDir, (done, total, path) => {
      progress.push({ done, total, path });
    });

    expect(progress).toHaveLength(result.total);

    // done should increment from 1 to total
    for (let i = 0; i < progress.length; i++) {
      expect(progress[i]!.done).toBe(i + 1);
      expect(progress[i]!.total).toBe(result.total);
      expect(typeof progress[i]!.path).toBe("string");
      expect(progress[i]!.path.endsWith(".md")).toBe(true);
    }
  });
});
