/**
 * Context Retrieval Quality — measures if PCL retrieves the RIGHT documents.
 * Disentangles "did PCL find the right docs" from "did the LLM use them well."
 */

export interface ContextMetrics {
  recall: number;     // What % of required docs were retrieved?
  precision: number;  // What % of retrieved docs were actually needed?
  f1: number;         // Harmonic mean of recall and precision
  retrieved: string[];
  required: string[];
  hits: string[];     // Intersection
  misses: string[];   // Required but not retrieved
  noise: string[];    // Retrieved but not required
}

/**
 * Compute context retrieval quality metrics.
 *
 * @param retrievedIds - Document IDs returned by PCL search
 * @param requiredIds - Document IDs that the task actually needs
 */
export function measureContextRetrieval(
  retrievedIds: string[],
  requiredIds: string[]
): ContextMetrics {
  const retrievedSet = new Set(retrievedIds);
  const requiredSet = new Set(requiredIds);

  const hits = requiredIds.filter((id) => retrievedSet.has(id));
  const misses = requiredIds.filter((id) => !retrievedSet.has(id));
  const noise = retrievedIds.filter((id) => !requiredSet.has(id));

  const recall = requiredIds.length > 0 ? hits.length / requiredIds.length : 1;
  const precision =
    retrievedIds.length > 0 ? hits.length / retrievedIds.length : 1;
  const f1 =
    recall + precision > 0
      ? (2 * recall * precision) / (recall + precision)
      : 0;

  return {
    recall,
    precision,
    f1,
    retrieved: retrievedIds,
    required: requiredIds,
    hits,
    misses,
    noise,
  };
}

/**
 * Aggregate context metrics across multiple tasks.
 */
export function averageContextMetrics(
  metrics: ContextMetrics[]
): { recall: number; precision: number; f1: number } {
  if (metrics.length === 0) return { recall: 0, precision: 0, f1: 0 };
  const sum = metrics.reduce(
    (acc, m) => ({
      recall: acc.recall + m.recall,
      precision: acc.precision + m.precision,
      f1: acc.f1 + m.f1,
    }),
    { recall: 0, precision: 0, f1: 0 }
  );
  return {
    recall: sum.recall / metrics.length,
    precision: sum.precision / metrics.length,
    f1: sum.f1 / metrics.length,
  };
}
