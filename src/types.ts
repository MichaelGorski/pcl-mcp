// src/types.ts

export type FileType =
  | "product"
  | "persona"
  | "journey"
  | "spec"
  | "decision"
  | "domain";

export interface PCLFile {
  id: string;
  type: FileType;
  path: string;                        // absolute path on disk
  frontmatter: Record<string, unknown>;
  body: string;                        // markdown body (no frontmatter)
  fullText: string;                    // frontmatter yaml + body, for embedding
  mtime: number;                       // file modification time (ms)
  hash: string;                        // sha256 of fullText, for change detection
}

export interface IndexedFile extends PCLFile {
  embedding: number[];                 // 384-dim float vector (MiniLM-L6-v2)
  title: string;                       // derived: frontmatter.name || frontmatter.title || id
  summary: string;                     // first 300 chars of body, for excerpts
  critical: boolean;                   // domain files with critical: true
}

export interface SearchResult {
  id: string;
  type: FileType;
  title: string;
  score: number;                       // 0..1 normalised RRF score
  excerpt: string;
  path: string;
  frontmatter: Record<string, unknown>;
}

export interface RankEntry {
  id: string;
  rank: number;                        // position in one result list (0-indexed)
}
