import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "../lib/harness.js";
import { search, type SearchMode } from "../../src/search.js";
import { computeMetrics, averageMetrics } from "../evaluators/ir-metrics.js";
import type { RelevanceGroundTruth } from "../lib/types.js";

async function main(): Promise<void> {
  console.log("=== Layer 2: Search Quality Benchmark ===\n");

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

    const modes: SearchMode[] = ["hybrid", "semantic", "keyword"];
    const allResults: Record<string, ReturnType<typeof computeMetrics>[]> = {};
    const byQueryType: Record<
      string,
      Record<string, ReturnType<typeof computeMetrics>[]>
    > = {};

    for (const mode of modes) {
      allResults[mode] = [];
      byQueryType[mode] = {};

      for (const q of gt.queries) {
        const results = await search(harness.db, q.query, {
          mode,
          topK: 5,
        });
        const retrieved = results.map((r) => r.id);
        const relevanceScores = new Map(
          q.judgments.map((j) => [j.docId, j.relevance]),
        );
        const metrics = computeMetrics(retrieved, relevanceScores);
        allResults[mode]!.push(metrics);

        if (!byQueryType[mode]![q.queryType]) {
          byQueryType[mode]![q.queryType] = [];
        }
        byQueryType[mode]![q.queryType]!.push(metrics);
      }
    }

    // Print aggregate results
    console.log("Aggregate Results:");
    console.log("\u2500".repeat(80));
    console.log(
      "| Mode     | P@1   | P@3   | P@5   | R@5   | MRR   | NDCG@5 |",
    );
    console.log(
      "|----------|-------|-------|-------|-------|-------|--------|",
    );

    const jsonResults: Record<string, unknown> = {};

    for (const mode of modes) {
      const avg = averageMetrics(allResults[mode]!);
      jsonResults[mode] = avg;
      console.log(
        `| ${mode.padEnd(8)} | ${avg.precisionAt1.toFixed(3)} | ${avg.precisionAt3.toFixed(3)} | ${avg.precisionAt5.toFixed(3)} | ${avg.recallAt5.toFixed(3)} | ${avg.mrr.toFixed(3)} | ${avg.ndcgAt5.toFixed(3)}  |`,
      );
    }

    // Print by query type
    for (const mode of modes) {
      console.log(`\n${mode} \u2014 by query type:`);
      console.log(
        "| Type        | P@1   | P@3   | P@5   | R@5   | MRR   | NDCG@5 |",
      );
      console.log(
        "|-------------|-------|-------|-------|-------|-------|--------|",
      );
      for (const [qType, metrics] of Object.entries(byQueryType[mode]!)) {
        const avg = averageMetrics(metrics);
        console.log(
          `| ${qType.padEnd(11)} | ${avg.precisionAt1.toFixed(3)} | ${avg.precisionAt3.toFixed(3)} | ${avg.precisionAt5.toFixed(3)} | ${avg.recallAt5.toFixed(3)} | ${avg.mrr.toFixed(3)} | ${avg.ndcgAt5.toFixed(3)}  |`,
        );
      }
    }

    // Save results
    await mkdir(join(import.meta.dirname, "..", "results"), {
      recursive: true,
    });
    await writeFile(
      join(import.meta.dirname, "..", "results", "search-quality.json"),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          aggregate: jsonResults,
          byQueryType,
        },
        null,
        2,
      ),
    );
    console.log("\nResults saved to benchmarks/results/search-quality.json");
  } finally {
    await harness.cleanup();
  }
}

main().catch(console.error);
