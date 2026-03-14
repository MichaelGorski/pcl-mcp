// src/db.ts
// SQLite layer using better-sqlite3 (synchronous — perfect for MCP tools).
// Two tables:
//   files   — all metadata + body + embedding BLOB
//   fts     — virtual FTS5 table for BM25 keyword search

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { FileType, IndexedFile } from "./types.js";

// ─── Schema ───────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 2;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA cache_size   = -32000;   -- 32 MB page cache

CREATE TABLE IF NOT EXISTS files (
  path        TEXT NOT NULL PRIMARY KEY,
  id          TEXT NOT NULL,
  type        TEXT NOT NULL,
  frontmatter TEXT NOT NULL,   -- JSON
  body        TEXT NOT NULL,
  full_text   TEXT NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  critical    INTEGER NOT NULL DEFAULT 0,
  mtime       INTEGER NOT NULL,
  hash        TEXT NOT NULL,
  embedding   BLOB,            -- packed float32 array, nullable until embedded
  UNIQUE(id, type)
);

CREATE INDEX IF NOT EXISTS idx_files_type     ON files(type);
CREATE INDEX IF NOT EXISTS idx_files_critical ON files(critical) WHERE critical = 1;

CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
  id         UNINDEXED,
  type       UNINDEXED,
  title,
  body,
  content    = 'files',
  content_rowid = 'rowid',
  tokenize   = 'porter unicode61 remove_diacritics 1'
);

-- Keep FTS in sync with files table
CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
  INSERT INTO fts(rowid, id, type, title, body)
  VALUES (new.rowid, new.id, new.type, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
  INSERT INTO fts(fts, rowid, id, type, title, body)
  VALUES ('delete', old.rowid, old.id, old.type, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
  INSERT INTO fts(fts, rowid, id, type, title, body)
  VALUES ('delete', old.rowid, old.id, old.type, old.title, old.body);
  INSERT INTO fts(rowid, id, type, title, body)
  VALUES (new.rowid, new.id, new.type, new.title, new.body);
END;
`;

// ─── Embedding serialisation (TypedArray — ~10x faster than manual loop) ─────

export function packEmbedding(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

export function unpackEmbedding(buf: Buffer): number[] {
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
}

// ─── Hash ─────────────────────────────────────────────────────────────────────

export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;
let _stmts: ReturnType<typeof prepareStatements> | null = null;
let _embeddingCache: IndexedFile[] | null = null;

export function openDB(productDir: string): Database.Database {
  if (_db) return _db;
  const dbPath = join(productDir, ".pcl.db");
  _db = new Database(dbPath);

  // Schema versioning — drop and recreate on version mismatch
  // (all data is rebuilt from markdown source files, so this is safe)
  const currentVersion = _db.pragma("user_version", { simple: true }) as number;
  if (currentVersion !== SCHEMA_VERSION) {
    _db.exec("DROP TRIGGER IF EXISTS files_ai");
    _db.exec("DROP TRIGGER IF EXISTS files_ad");
    _db.exec("DROP TRIGGER IF EXISTS files_au");
    _db.exec("DROP TABLE IF EXISTS fts");
    _db.exec("DROP TABLE IF EXISTS files");
  }

  _db.exec(SCHEMA);
  _db.pragma(`user_version = ${SCHEMA_VERSION}`);

  return _db;
}

export function closeDB(): void {
  if (_db) {
    _db.close();
    _db = null;
    _stmts = null;
    _embeddingCache = null;
  }
}

// ─── Prepared statement cache ────────────────────────────────────────────────

function prepareStatements(db: Database.Database) {
  return {
    upsert: db.prepare(`
      INSERT INTO files (id, type, path, frontmatter, body, full_text, title, summary, critical, mtime, hash, embedding)
      VALUES (@id, @type, @path, @frontmatter, @body, @full_text, @title, @summary, @critical, @mtime, @hash, @embedding)
      ON CONFLICT(path) DO UPDATE SET
        id          = excluded.id,
        type        = excluded.type,
        frontmatter = excluded.frontmatter,
        body        = excluded.body,
        full_text   = excluded.full_text,
        title       = excluded.title,
        summary     = excluded.summary,
        critical    = excluded.critical,
        mtime       = excluded.mtime,
        hash        = excluded.hash,
        embedding   = excluded.embedding
    `),
    updateEmbedding: db.prepare("UPDATE files SET embedding = ? WHERE path = ?"),
    deleteFile: db.prepare("DELETE FROM files WHERE path = ?"),
    getByPath: db.prepare("SELECT * FROM files WHERE path = ?"),
    getById: db.prepare("SELECT * FROM files WHERE type = ? AND id = ?"),
    getProduct: db.prepare("SELECT * FROM files WHERE type = 'product' LIMIT 1"),
    listByType: db.prepare("SELECT * FROM files WHERE type = ? ORDER BY id"),
    getCritical: db.prepare("SELECT * FROM files WHERE critical = 1"),
    getAllWithEmbeddings: db.prepare("SELECT * FROM files WHERE embedding IS NOT NULL"),
    getAllWithoutEmbeddings: db.prepare("SELECT * FROM files WHERE embedding IS NULL"),
    ftsSearch: db.prepare("SELECT id, type, rank FROM fts WHERE fts MATCH ? ORDER BY rank LIMIT ?"),
  };
}

function getStmts(db: Database.Database) {
  if (!_stmts) _stmts = prepareStatements(db);
  return _stmts;
}

// ─── Embedding cache ─────────────────────────────────────────────────────────
// Avoids re-loading + unpacking all embeddings on every search call.
// Invalidated surgically by upsertFile, updateEmbedding, deleteFile.

function invalidateEmbeddingCache(): void {
  _embeddingCache = null;
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

export interface DBRow {
  id: string;
  type: FileType;
  path: string;
  frontmatter: string;  // JSON string
  body: string;
  full_text: string;
  title: string;
  summary: string;
  critical: number;
  mtime: number;
  hash: string;
  embedding: Buffer | null;
}

function toIndexedFile(row: DBRow): IndexedFile {
  return {
    id:          row.id,
    type:        row.type as FileType,
    path:        row.path,
    frontmatter: JSON.parse(row.frontmatter),
    body:        row.body,
    fullText:    row.full_text,
    title:       row.title,
    summary:     row.summary,
    critical:    row.critical === 1,
    mtime:       row.mtime,
    hash:        row.hash,
    embedding:   row.embedding ? unpackEmbedding(row.embedding) : [],
  };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function upsertFile(db: Database.Database, file: IndexedFile): void {
  getStmts(db).upsert.run({
    id:          file.id,
    type:        file.type,
    path:        file.path,
    frontmatter: JSON.stringify(file.frontmatter),
    body:        file.body,
    full_text:   file.fullText,
    title:       file.title,
    summary:     file.summary,
    critical:    file.critical ? 1 : 0,
    mtime:       file.mtime,
    hash:        file.hash,
    embedding:   file.embedding.length > 0 ? packEmbedding(file.embedding) : null,
  });
  invalidateEmbeddingCache();
}

export function updateEmbedding(
  db: Database.Database,
  path: string,
  embedding: number[]
): void {
  getStmts(db).updateEmbedding.run(packEmbedding(embedding), path);
  invalidateEmbeddingCache();
}

export function deleteFile(db: Database.Database, path: string): void {
  getStmts(db).deleteFile.run(path);
  invalidateEmbeddingCache();
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getFileByPath(db: Database.Database, path: string): IndexedFile | null {
  const row = getStmts(db).getByPath.get(path) as DBRow | undefined;
  return row ? toIndexedFile(row) : null;
}

export function getFileById(db: Database.Database, type: FileType, id: string): IndexedFile | null {
  const row = getStmts(db).getById.get(type, id) as DBRow | undefined;
  return row ? toIndexedFile(row) : null;
}

export function getProductFile(db: Database.Database): IndexedFile | null {
  const row = getStmts(db).getProduct.get() as DBRow | undefined;
  return row ? toIndexedFile(row) : null;
}

export function listByType(db: Database.Database, type: FileType): IndexedFile[] {
  const rows = getStmts(db).listByType.all(type) as DBRow[];
  return rows.map(toIndexedFile);
}

export function getCritical(db: Database.Database): IndexedFile[] {
  const rows = getStmts(db).getCritical.all() as DBRow[];
  return rows.map(toIndexedFile);
}

export function getAllWithEmbeddings(db: Database.Database): IndexedFile[] {
  if (_embeddingCache) return _embeddingCache;
  const rows = getStmts(db).getAllWithEmbeddings.all() as DBRow[];
  _embeddingCache = rows.map(toIndexedFile);
  return _embeddingCache;
}

export function getAllWithoutEmbeddings(db: Database.Database): IndexedFile[] {
  const rows = getStmts(db).getAllWithoutEmbeddings.all() as DBRow[];
  return rows.map(toIndexedFile);
}

// BM25 keyword search via FTS5
// FTS5 rank is negative BM25 — ORDER BY rank ASC = best first
export interface FTSResult { id: string; type: string; rank: number }

export function keywordSearch(
  db: Database.Database,
  query: string,
  limit = 10
): FTSResult[] {
  // Sanitise query: escape special FTS5 characters, wrap in quotes for phrase boost
  const safe = query.replace(/['"*^]/g, " ").trim();
  if (!safe) return [];
  try {
    return getStmts(db).ftsSearch.all(safe, limit) as FTSResult[];
  } catch {
    // FTS5 query syntax error — fall back to simple term search
    const terms = safe.split(/\s+/).map(t => t + "*").join(" ");
    try {
      return getStmts(db).ftsSearch.all(terms, limit) as FTSResult[];
    } catch {
      return [];
    }
  }
}
