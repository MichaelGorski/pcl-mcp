import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "../lib/harness.js";
import { search, type SearchMode } from "../../src/search.js";
import { computeMetrics, averageMetrics } from "../evaluators/ir-metrics.js";
import type { RelevanceGroundTruth } from "../lib/types.js";

interface AblationConfig {
  name: string;
  mode: SearchMode;
}

async function main(): Promise<void> {
  console.log("=== Layer 5: Ablation Study ===\n");

  const harness = await setup("corpus-small");

  try {
    const gtPath = join(
      import.meta.dirname,
      "..",
      "fixtures",
      "ground-truth",
      "relevance-judgments.json",
    );
    const gt: RelevanceGroundTruth = JSON.parse(
      await readFile(gtPath, "utf8"),
    );

    const configs: AblationConfig[] = [
      { name: "Full PCL (hybrid)", mode: "hybrid" },
      { name: "Keyword only (no embeddings)", mode: "keyword" },
      { name: "Semantic only (no BM25)", mode: "semantic" },
    ];

    console.log("Ablation Results:");
    console.log("\u2500".repeat(85));
    console.log(
      "| Configuration                | P@1   | P@3   | P@5   | R@5   | MRR   | NDCG@5 |",
    );
    console.log(
      "|------------------------------|-------|-------|-------|-------|-------|--------|",
    );

    const jsonResults: Array<{
      config: string;
      metrics: ReturnType<typeof averageMetrics>;
    }> = [];

    for (const config of configs) {
      const metrics: ReturnType<typeof computeMetrics>[] = [];

      for (const q of gt.queries) {
        const results = await search(harness.db, q.query, {
          mode: config.mode,
          topK: 10,
        });
        const retrieved = results.map((r) => r.id);
        const relevanceScores = new Map(
          q.judgments.map((j) => [j.docId, j.relevance]),
        );
        metrics.push(computeMetrics(retrieved, relevanceScores));
      }

      const avg = averageMetrics(metrics);
      jsonResults.push({ config: config.name, metrics: avg });

      console.log(
        `| ${config.name.padEnd(28)} | ${avg.precisionAt1.toFixed(3)} | ${avg.precisionAt3.toFixed(3)} | ${avg.precisionAt5.toFixed(3)} | ${avg.recallAt5.toFixed(3)} | ${avg.mrr.toFixed(3)} | ${avg.ndcgAt5.toFixed(3)}  |`,
      );
    }

    // Save results
    await mkdir(join(import.meta.dirname, "..", "results"), {
      recursive: true,
    });
    await writeFile(
      join(import.meta.dirname, "..", "results", "ablation.json"),
      JSON.stringify(
        { timestamp: new Date().toISOString(), results: jsonResults },
        null,
        2,
      ),
    );
    console.log("\nResults saved to benchmarks/results/ablation.json");
  } finally {
    await harness.cleanup();
  }
}

main().catch(console.error);
