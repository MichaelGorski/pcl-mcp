/**
 * Shared test harness — creates isolated DB environments for each test.
 */
import { mkdtemp, cp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDB, closeDB } from "../../src/db.js";
import type Database from "better-sqlite3";
import type { IndexedFile, FileType } from "../../src/types.js";

export const CORPUS_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "benchmarks",
  "fixtures",
  "corpus-small"
);

export interface TestHarness {
  db: Database.Database;
  productDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a fresh test DB environment.
 * - copyCorpus: true → copies corpus-small fixtures into temp dir
 * - copyCorpus: false → creates empty product dir structure
 */
export async function createTestDB(
  opts: { copyCorpus?: boolean } = {}
): Promise<TestHarness> {
  closeDB();

  const tmpDir = await mkdtemp(join(tmpdir(), "pcl-test-"));
  const productDir = join(tmpDir, "product");

  if (opts.copyCorpus) {
    await cp(CORPUS_DIR, productDir, { recursive: true });
  } else {
    await mkdir(productDir, { recursive: true });
    await mkdir(join(productDir, "personas"), { recursive: true });
    await mkdir(join(productDir, "journeys"), { recursive: true });
    await mkdir(join(productDir, "specs"), { recursive: true });
    await mkdir(join(productDir, "decisions"), { recursive: true });
    await mkdir(join(productDir, "domain"), { recursive: true });
  }

  const db = openDB(productDir);

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
 * Factory for creating IndexedFile objects with sensible defaults.
 * Override any field as needed.
 */
export function createTestFile(
  overrides: Partial<IndexedFile> = {}
): IndexedFile {
  return {
    id: "test-file",
    type: "persona" as FileType,
    path: "/tmp/test/personas/test-file.md",
    frontmatter: { id: "test-file", name: "Test", role: "Tester", primary_goal: "Test things" },
    body: "## Test file body\n\nThis is test content for benchmarking and testing.",
    fullText: "---\nid: test-file\nname: Test\n---\n\n## Test file body\n\nThis is test content.",
    mtime: Date.now(),
    hash: "abcdef1234567890",
    embedding: Array.from({ length: 384 }, () => Math.random()),
    embeddingTitle: Array.from({ length: 384 }, () => Math.random()),
    title: "Test",
    summary: "This is test content for benchmarking and testing.",
    critical: false,
    ...overrides,
  };
}

/**
 * Write a markdown file to the product dir with frontmatter + body.
 */
export async function writeTestMarkdown(
  productDir: string,
  relativePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): Promise<string> {
  const fullPath = join(productDir, relativePath);
  const yamlLines = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return `${k}:\n${v.map((item) => `  - "${item}"`).join("\n")}`;
      }
      if (typeof v === "boolean") return `${k}: ${v}`;
      return `${k}: "${v}"`;
    })
    .join("\n");
  const content = `---\n${yamlLines}\n---\n\n${body}`;
  await writeFile(fullPath, content);
  return fullPath;
}
