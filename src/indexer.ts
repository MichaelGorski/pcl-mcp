// src/indexer.ts
// Watches /product folder, parses files, validates schemas,
// computes embeddings, writes to SQLite.
//
// Change detection: only re-embed when file content hash changes
// (mtime alone is unreliable; content hash is the contract).

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, extname, basename } from "node:path";
import matter from "gray-matter";
import type Database from "better-sqlite3";
import type { FileType, IndexedFile } from "./types.js";
import { validateFrontmatter, deriveTitle } from "./schemas.js";
import { hashContent } from "./db.js";
import { upsertFile, updateEmbedding, deleteFile, getFileByPath, getAllWithoutEmbeddings } from "./db.js";
import { embedText } from "./embeddings.js";

// ─── File type detection ───────────────────────────────────────────────────────

function detectType(path: string, productDir: string): FileType | null {
  const rel = path.replace(productDir, "").replace(/\\/g, "/");
  if (/^\/product\.md$/.test(rel))    return "product";
  if (/^\/personas\//.test(rel))      return "persona";
  if (/^\/journeys\//.test(rel))      return "journey";
  if (/^\/specs\//.test(rel))         return "spec";
  if (/^\/decisions\//.test(rel))     return "decision";
  if (/^\/domain\//.test(rel))        return "domain";
  return null;
}

// ─── Parse one file ───────────────────────────────────────────────────────────

export async function parseFile(
  path: string,
  productDir: string
): Promise<{ file: Omit<IndexedFile, "embedding" | "embeddingTitle">; error?: string } | null> {
  const type = detectType(path, productDir);
  if (!type) return null;

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }

  const { data: frontmatter, content: body } = matter(raw);
  const validation = validateFrontmatter(type, frontmatter);

  const st = await stat(path);
  const hash = hashContent(raw);
  const fullText = raw;

  // Use validated/defaulted frontmatter if valid, raw if not
  const fm = validation.success ? validation.data : (frontmatter as Record<string, unknown>);
  const title = deriveTitle(type, fm);
  const summary = body.trim().replace(/\n+/g, " ").slice(0, 300);

  // ID: from frontmatter.id || filename without extension
  const id = String(fm.id ?? basename(path, extname(path)));
  const critical = type === "domain" && fm.critical === true;

  const file: Omit<IndexedFile, "embedding" | "embeddingTitle"> = {
    id,
    type,
    path,
    frontmatter: fm,
    body,
    fullText,
    title,
    summary,
    critical,
    mtime: st.mtimeMs,
    hash,
  };

  return {
    file,
    error: validation.success ? undefined : validation.error,
  };
}

// ─── Index one file (parse + embed if changed) ────────────────────────────────

export async function indexFile(
  db: Database.Database,
  path: string,
  productDir: string,
  embed = true
): Promise<{ indexed: boolean; embedded: boolean; error?: string }> {
  const parsed = await parseFile(path, productDir);
  if (!parsed) return { indexed: false, embedded: false };

  const { file, error } = parsed;
  const existing = getFileByPath(db, path);

  const contentChanged = !existing || existing.hash !== file.hash;

  // Compute embeddings first, then single upsert — avoids race where search
  // sees the file with an empty embedding between two DB writes.
  // Title and body are embedded separately for split semantic scoring.
  let embedding: number[] = [];
  let embeddingTitle: number[] = [];
  let embedded = false;
  if (embed && contentChanged) {
    try {
      // Embed body for semantic search; title+summary for supplementary matching
      embedding = await embedText(file.fullText);
      embeddingTitle = await embedText(file.title + " — " + file.summary);
      embedded = true;
    } catch (e) {
      // Embedding failure is non-fatal — keyword search still works
      process.stderr.write(`[pcl] embedding failed for ${path}: ${e}\n`);
    }
  }

  if (contentChanged) {
    upsertFile(db, { ...file, embedding, embeddingTitle });
  }

  return { indexed: contentChanged, embedded, error };
}

// ─── Full initial scan ─────────────────────────────────────────────────────────

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await collectMarkdownFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
        files.push(full);
      }
    }
  } catch { /* dir doesn't exist yet */ }
  return files;
}

export async function fullIndex(
  db: Database.Database,
  productDir: string,
  onProgress?: (done: number, total: number, path: string) => void
): Promise<{ total: number; indexed: number; errors: string[] }> {
  const files = await collectMarkdownFiles(productDir);
  const errors: string[] = [];
  let indexed = 0;

  for (let i = 0; i < files.length; i++) {
    const path = files[i]!;
    const result = await indexFile(db, path, productDir, true);
    if (result.indexed) indexed++;
    if (result.error) errors.push(`${path}: ${result.error}`);
    onProgress?.(i + 1, files.length, path);
  }

  return { total: files.length, indexed, errors };
}

// ─── Backfill embeddings for files that failed embedding ─────────────────────

export async function backfillEmbeddings(
  db: Database.Database,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const pending = getAllWithoutEmbeddings(db);
  let done = 0;
  for (const file of pending) {
    try {
      const vec = await embedText(file.fullText);
      updateEmbedding(db, file.path, vec);
      done++;
    } catch { /* skip */ }
    onProgress?.(done, pending.length);
  }
  return done;
}

// ─── Chokidar watcher ─────────────────────────────────────────────────────────

export async function startWatcher(
  db: Database.Database,
  productDir: string,
  onEvent?: (event: string, path: string) => void
): Promise<() => void> {
  const { watch } = await import("chokidar");

  const watcher = watch(productDir, {
    ignored:    /(^|[/\\])\../,   // ignore dotfiles
    persistent: true,
    ignoreInitial: true,          // initial scan done by fullIndex
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  const handle = async (event: "add" | "change" | "unlink", path: string) => {
    if (!path.endsWith(".md")) return;
    if (event === "unlink") {
      deleteFile(db, resolve(path));
      onEvent?.("deleted", path);
    } else {
      await indexFile(db, resolve(path), productDir, true);
      onEvent?.(event, path);
    }
  };

  watcher.on("add",    p => handle("add",    p));
  watcher.on("change", p => handle("change", p));
  watcher.on("unlink", p => handle("unlink", p));

  return () => watcher.close();
}
