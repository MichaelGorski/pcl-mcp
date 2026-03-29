import type { FileType } from "../../src/types.js";

// --- Ground truth types ---

export interface RelevanceJudgment {
  query: string;
  queryType: "exact_term" | "conceptual" | "multi_hop";
  judgments: Array<{
    docId: string;
    relevance: 0 | 1 | 2 | 3; // 0=irrelevant, 1=marginal, 2=relevant, 3=highly relevant
  }>;
}

export interface RelevanceGroundTruth {
  queries: RelevanceJudgment[];
}

export interface EvaluationCriterion {
  criterion: string;
  weight: number; // 0-1
  type: "regex" | "llm_judge";
  pattern?: string; // for regex type
  prompt?: string;  // for llm_judge type
}

export interface CodingTask {
  id: string;
  category: "spec_compliance" | "business_rule" | "persona_alignment" | "architecture" | "journey_correctness";
  description: string; // The prompt given to the AI
  requiredContext: string[]; // docIds that SHOULD be consulted
  forbiddenPatterns: string[]; // regex patterns that indicate violation
  requiredPatterns: string[]; // regex patterns that must appear
  evaluationCriteria: EvaluationCriterion[];
}

export interface TaskGroundTruth {
  tasks: CodingTask[];
}

// --- Result types ---

export interface PerformanceResult {
  name: string;
  mean: number;  // ms
  median: number;
  p95: number;
  iterations: number;
}

export interface SearchQualityResult {
  mode: "hybrid" | "semantic" | "keyword";
  queryType?: string;
  precisionAt1: number;
  precisionAt3: number;
  precisionAt5: number;
  recallAt5: number;
  mrr: number;
  ndcgAt5: number;
}

export interface TokenEfficiencyResult {
  corpusSize: number;
  pclSessionStartTokens: number;
  pasteAllTokens: number;
  savingsPercent: number;
  ratio: number;
}

export interface AIQualityResult {
  taskId: string;
  category: string;
  noContextScore: number;
  pasteAllScore: number;
  pclScore: number;
  noContextTokens: number;
  pasteAllTokens: number;
  pclTokens: number;
}

export interface AblationResult {
  configuration: string;
  searchQuality: SearchQualityResult;
}

export interface BenchmarkReport {
  timestamp: string;
  version: string;
  commit: string;
  performance?: PerformanceResult[];
  searchQuality?: SearchQualityResult[];
  tokenEfficiency?: TokenEfficiencyResult[];
  aiQuality?: AIQualityResult[];
  ablation?: AblationResult[];
}
