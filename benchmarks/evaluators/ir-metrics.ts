/**
 * Precision@K: fraction of top-K results that are relevant.
 */
export function precisionAtK(
  retrieved: string[],
  relevant: Set<string>,
  k: number
): number {
  const topK = retrieved.slice(0, k);
  if (topK.length === 0) return 0;
  const hits = topK.filter(id => relevant.has(id)).length;
  return hits / topK.length;
}

/**
 * Recall@K: fraction of relevant docs found in top-K.
 */
export function recallAtK(
  retrieved: string[],
  relevant: Set<string>,
  k: number
): number {
  if (relevant.size === 0) return 1; // no relevant docs = perfect recall vacuously
  const topK = retrieved.slice(0, k);
  const hits = topK.filter(id => relevant.has(id)).length;
  return hits / relevant.size;
}

/**
 * MRR (Mean Reciprocal Rank): 1 / rank of first relevant result.
 */
export function reciprocalRank(
  retrieved: string[],
  relevant: Set<string>
): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i]!)) return 1 / (i + 1);
  }
  return 0;
}

/**
 * DCG@K with graded relevance (relevance scores 0-3).
 */
function dcgAtK(
  retrieved: string[],
  relevanceScores: Map<string, number>,
  k: number
): number {
  let dcg = 0;
  const topK = retrieved.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    const rel = relevanceScores.get(topK[i]!) ?? 0;
    dcg += (Math.pow(2, rel) - 1) / Math.log2(i + 2); // i+2 because log2(1)=0
  }
  return dcg;
}

/**
 * NDCG@K: normalized DCG using ideal ranking.
 */
export function ndcgAtK(
  retrieved: string[],
  relevanceScores: Map<string, number>,
  k: number
): number {
  const dcg = dcgAtK(retrieved, relevanceScores, k);
  // Ideal ranking: sort all docs by relevance descending
  const idealOrder = [...relevanceScores.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);
  const idcg = dcgAtK(idealOrder, relevanceScores, k);
  if (idcg === 0) return 0;
  return dcg / idcg;
}

/**
 * Compute all metrics for a single query.
 */
export function computeMetrics(
  retrieved: string[],
  relevanceScores: Map<string, number>,
  relevantThreshold = 1
): {
  precisionAt1: number;
  precisionAt3: number;
  precisionAt5: number;
  recallAt5: number;
  mrr: number;
  ndcgAt5: number;
} {
  const relevant = new Set(
    [...relevanceScores.entries()]
      .filter(([, score]) => score >= relevantThreshold)
      .map(([id]) => id)
  );

  return {
    precisionAt1: precisionAtK(retrieved, relevant, 1),
    precisionAt3: precisionAtK(retrieved, relevant, 3),
    precisionAt5: precisionAtK(retrieved, relevant, 5),
    recallAt5: recallAtK(retrieved, relevant, 5),
    mrr: reciprocalRank(retrieved, relevant),
    ndcgAt5: ndcgAtK(retrieved, relevanceScores, 5),
  };
}

/**
 * Average metrics across multiple queries.
 */
export function averageMetrics(
  results: Array<ReturnType<typeof computeMetrics>>
): ReturnType<typeof computeMetrics> {
  const n = results.length;
  if (n === 0) {
    return { precisionAt1: 0, precisionAt3: 0, precisionAt5: 0, recallAt5: 0, mrr: 0, ndcgAt5: 0 };
  }

  const sum = results.reduce(
    (acc, r) => ({
      precisionAt1: acc.precisionAt1 + r.precisionAt1,
      precisionAt3: acc.precisionAt3 + r.precisionAt3,
      precisionAt5: acc.precisionAt5 + r.precisionAt5,
      recallAt5: acc.recallAt5 + r.recallAt5,
      mrr: acc.mrr + r.mrr,
      ndcgAt5: acc.ndcgAt5 + r.ndcgAt5,
    }),
    { precisionAt1: 0, precisionAt3: 0, precisionAt5: 0, recallAt5: 0, mrr: 0, ndcgAt5: 0 }
  );

  return {
    precisionAt1: sum.precisionAt1 / n,
    precisionAt3: sum.precisionAt3 / n,
    precisionAt5: sum.precisionAt5 / n,
    recallAt5: sum.recallAt5 / n,
    mrr: sum.mrr / n,
    ndcgAt5: sum.ndcgAt5 / n,
  };
}
