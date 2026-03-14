// src/search.ts
// Hybrid search: BM25 (SQLite FTS5) + semantic (cosine similarity) fused via RRF.
//
// Why hybrid?
//   BM25   = exact keyword match, great for IDs, proper nouns, tech terms
//   Cosine = semantic similarity, great for "what does Max find frustrating"
//   RRF    = fuses both rankings without needing to tune weights
//
// Reciprocal Rank Fusion (Cormack et al., 2009):
//   score(d) = Σ 1 / (k + rank(d))   for each result list
//   k=60 is the standard constant — dampens the dominance of rank-1 results.

import type Database from "better-sqlite3";
import type { IndexedFile, SearchResult, RankEntry } from "./types.js";
import { keywordSearch, getAllWithEmbeddings } from "./db.js";
import { embedText, rankBySimilarity } from "./embeddings.js";

const RRF_K = 60;

// ─── RRF fusion ───────────────────────────────────────────────────────────────

function rrf(
  lists: RankEntry[][],  // each list is an ordered array of {id, rank}
  allFiles: Map<string, IndexedFile>
): SearchResult[] {
  const scores = new Map<string, number>();

  for (const list of lists) {
    for (const { id, rank } of list) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    }
  }

  // Normalise scores to [0, 1]
  const maxScore = Math.max(...scores.values(), 1e-9);

  return [...scores.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([id, score]) => {
      const file = allFiles.get(id);
      if (!file) return null;
      return {
        id:          file.id,
        type:        file.type,
        title:       file.title,
        score:       score / maxScore,
        excerpt:     file.summary,
        path:        file.path,
        frontmatter: file.frontmatter,
      } satisfies SearchResult;
    })
    .filter((r): r is SearchResult => r !== null);
}

// ─── Main search entry point ───────────────────────────────────────────────────

export type SearchMode = "hybrid" | "semantic" | "keyword";

export async function search(
  db: Database.Database,
  query: string,
  opts: {
    mode?:    SearchMode;
    topK?:    number;
    types?:   string[];   // filter by file type
  } = {}
): Promise<SearchResult[]> {
  const { mode = "hybrid", topK = 8, types } = opts;

  // Build a fast lookup map for all indexed files
  const allIndexed = getAllWithEmbeddings(db);
  const fileMap = new Map<string, IndexedFile>(
    allIndexed.map(f => [f.id, f])
  );

  // Apply type filter if requested
  const candidates = types && types.length > 0
    ? allIndexed.filter(f => types.includes(f.type))
    : allIndexed;

  const rrfLists: RankEntry[][] = [];

  // ── BM25 (keyword) ──────────────────────────────────────────────────────────
  if (mode === "hybrid" || mode === "keyword") {
    const kw = keywordSearch(db, query, topK * 2);
    const kwFiltered = types && types.length > 0
      ? kw.filter(r => types.includes(r.type))
      : kw;
    rrfLists.push(kwFiltered.map((r, i) => ({ id: r.id, rank: i })));
  }

  // ── Semantic (cosine) ────────────────────────────────────────────────────────
  if (mode === "hybrid" || mode === "semantic") {
    const queryVec = await embedText(query);
    const semResults = rankBySimilarity(
      queryVec,
      candidates.map(f => ({ id: f.id, type: f.type, embedding: f.embedding })),
      topK * 2
    );
    rrfLists.push(semResults.map((r, i) => ({ id: r.id, rank: i })));
  }

  if (rrfLists.length === 0) return [];

  const fused = rrf(rrfLists, fileMap);
  return fused.slice(0, topK);
}

// ─── Related files (semantic only, excluding self) ────────────────────────────

export async function findRelated(
  db: Database.Database,
  sourceId: string,
  topK = 5
): Promise<SearchResult[]> {
  const allIndexed = getAllWithEmbeddings(db);
  const source = allIndexed.find(f => f.id === sourceId);
  if (!source || source.embedding.length === 0) return [];

  const others = allIndexed.filter(f => f.id !== sourceId);
  const ranked = rankBySimilarity(
    source.embedding,
    others.map(f => ({ id: f.id, type: f.type, embedding: f.embedding })),
    topK
  );

  const fileMap = new Map(allIndexed.map(f => [f.id, f]));
  return ranked
    .map(r => {
      const f = fileMap.get(r.id);
      if (!f) return null;
      return {
        id:          f.id,
        type:        f.type,
        title:       f.title,
        score:       r.score,
        excerpt:     f.summary,
        path:        f.path,
        frontmatter: f.frontmatter,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}
