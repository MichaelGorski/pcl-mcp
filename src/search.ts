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
//   k is adaptive based on corpus size for better score discrimination.
//
// Multi-hop query decomposition:
//   Queries referencing two distinct concepts are split into sub-queries,
//   run independently, and merged with coverage-weighted scoring.

import type Database from "better-sqlite3";
import type { IndexedFile, SearchResult, RankEntry } from "./types.js";
import { keywordSearch, getAllWithEmbeddings } from "./db.js";
import { embedText, rankBySimilarity } from "./embeddings.js";

// Adaptive RRF_K: small corpora need low K for score spread.
function rrfK(corpusSize: number): number {
  if (corpusSize < 50) return Math.max(1, Math.ceil(corpusSize / 5));
  if (corpusSize < 100) return Math.max(3, Math.floor(corpusSize / 10));
  return 60;
}

const MAX_CROSS_REFS = 2;

// ─── RRF fusion ───────────────────────────────────────────────────────────────

function rrf(
  lists: RankEntry[][],
  allFiles: Map<string, IndexedFile>,
  k: number
): SearchResult[] {
  const scores = new Map<string, number>();

  for (const list of lists) {
    for (const { id, rank } of list) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }

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

// ─── Score gap detection ────────────────────────────────────────────────────

function applyScoreGap(results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;

  const threshold = results[0]!.score * 0.15;
  const kept = results.filter(r => r.score >= threshold);
  return kept.length > 0 ? kept : results.slice(0, 1);
}

// ─── Multi-hop query decomposition ──────────────────────────────────────────
// Detects queries referencing two distinct concepts and splits them for
// independent retrieval, then merges with coverage-weighted scoring.

const MULTI_HOP_PATTERNS = [
  /\bhow\s+does?\s+(.+?)\s+(?:affect|impact|influence|relate\s+to)\s+(.+)/i,
  /\bwhich\s+(.+?)\s+(?:affect|apply\s+to|impact|relate\s+to)\s+(.+)/i,
  /\bwhat\s+(.+?)\s+(?:for|about|regarding|when\s+building|to\s+consider\s+for)\s+(.+)/i,
  /\bhow\s+(?:should|does|do)\s+(.+?)\s+(?:and|with)\s+(.+)/i,
];

function detectMultiHop(query: string): string[] | null {
  for (const pattern of MULTI_HOP_PATTERNS) {
    const match = query.match(pattern);
    if (match && match[1] && match[2]) {
      return [match[1].trim(), match[2].trim()];
    }
  }
  return null;
}

// ─── Main search entry point ────────────────────────────────────────────────

export type SearchMode = "hybrid" | "semantic" | "keyword";

export async function search(
  db: Database.Database,
  query: string,
  opts: {
    mode?:    SearchMode;
    topK?:    number;
    types?:   string[];
  } = {}
): Promise<SearchResult[]> {
  const { mode = "hybrid", topK = 5, types } = opts;

  const allIndexed = getAllWithEmbeddings(db);
  const fileMap = new Map<string, IndexedFile>(
    allIndexed.map(f => [f.id, f])
  );

  const candidates = types && types.length > 0
    ? allIndexed.filter(f => types.includes(f.type))
    : allIndexed;

  const corpusSize = candidates.length;
  const fetchK = Math.min(topK * 2, corpusSize);

  // Multi-hop decomposition is available but disabled by default.
  // Enable via opts if needed for specific use cases.

  return searchSingle(db, query, mode, fileMap, candidates, fetchK, topK);
}

// ─── Single-query search ────────────────────────────────────────────────────

async function searchSingle(
  db: Database.Database,
  query: string,
  mode: SearchMode,
  fileMap: Map<string, IndexedFile>,
  candidates: IndexedFile[],
  fetchK: number,
  topK: number
): Promise<SearchResult[]> {
  const corpusSize = candidates.length;
  const k = rrfK(corpusSize);
  const rrfLists: RankEntry[][] = [];

  if (mode === "hybrid" || mode === "keyword") {
    const kw = keywordSearch(db, query, fetchK);
    rrfLists.push(kw.map((r, i) => ({ id: r.id, rank: i })));
  }

  if (mode === "hybrid" || mode === "semantic") {
    const queryVec = await embedText(query);
    const semResults = rankBySimilarity(
      queryVec,
      candidates.map(f => ({ id: f.id, type: f.type, embedding: f.embedding })),
      fetchK
    );
    rrfLists.push(semResults.map((r, i) => ({ id: r.id, rank: i })));
  }

  if (rrfLists.length === 0) return [];

  const fused = rrf(rrfLists, fileMap, k);
  const topResults = applyScoreGap(fused.slice(0, topK));

  // ── Cross-reference resolution ─────────────────────────────────────────
  const resultIds = new Set(topResults.map(r => r.id));
  const extras: SearchResult[] = [];

  function addRef(refId: string, parentScore: number) {
    if (!refId || resultIds.has(refId)) return;
    if (extras.length >= MAX_CROSS_REFS) return;
    const refFile = fileMap.get(refId);
    if (!refFile) return;
    extras.push({
      id: refFile.id, type: refFile.type, title: refFile.title,
      score: parentScore * 0.6,
      excerpt: refFile.summary, path: refFile.path, frontmatter: refFile.frontmatter,
    });
    resultIds.add(refId);
  }

  for (const result of topResults.slice(0, 2)) {
    const fm = result.frontmatter;
    for (const field of ["persona", "primary_persona", "journey"]) {
      const ref = fm[field];
      if (typeof ref === "string") addRef(ref, result.score);
    }
  }

  return [...topResults, ...extras];
}

// ─── Multi-hop search ───────────────────────────────────────────────────────
// Runs sub-queries independently and merges with coverage bonus.

async function searchMultiHop(
  db: Database.Database,
  subQueries: string[],
  fullQuery: string,
  fileMap: Map<string, IndexedFile>,
  candidates: IndexedFile[],
  fetchK: number,
  topK: number
): Promise<SearchResult[]> {
  // Run each sub-query independently
  const subScores: Map<string, number>[] = [];
  for (const sq of subQueries) {
    const results = await searchSingle(db, sq, "hybrid", fileMap, candidates, fetchK, topK);
    const scores = new Map<string, number>();
    for (const r of results) scores.set(r.id, r.score);
    subScores.push(scores);
  }

  // Also run the full query
  const fullResults = await searchSingle(db, fullQuery, "hybrid", fileMap, candidates, fetchK, topK);
  const fullScores = new Map<string, number>();
  for (const r of fullResults) fullScores.set(r.id, r.score);

  // Merge with coverage-weighted scoring
  const allIds = new Set<string>();
  for (const m of subScores) for (const id of m.keys()) allIds.add(id);
  for (const id of fullScores.keys()) allIds.add(id);

  const merged: Array<{ id: string; score: number }> = [];
  for (const id of allIds) {
    let maxScore = fullScores.get(id) ?? 0;
    let coverage = 0;
    for (const m of subScores) {
      const s = m.get(id) ?? 0;
      if (s > 0) coverage++;
      maxScore = Math.max(maxScore, s);
    }
    // Docs matching multiple sub-queries get a coverage bonus
    const coverageBonus = coverage >= 2 ? 1.5 : 1.0;
    merged.push({ id, score: maxScore * coverageBonus });
  }

  merged.sort((a, b) => b.score - a.score);
  const maxScore = Math.max(...merged.map(m => m.score), 1e-9);

  return merged.slice(0, topK).map(({ id, score }) => {
    const file = fileMap.get(id);
    if (!file) return null;
    return {
      id: file.id, type: file.type, title: file.title,
      score: score / maxScore,
      excerpt: file.summary, path: file.path, frontmatter: file.frontmatter,
    } satisfies SearchResult;
  }).filter((r): r is SearchResult => r !== null);
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
        id: f.id, type: f.type, title: f.title, score: r.score,
        excerpt: f.summary, path: f.path, frontmatter: f.frontmatter,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}
