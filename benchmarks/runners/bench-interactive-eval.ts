/**
 * Interactive evaluation — measures context retrieval quality for all tasks
 * and outputs task prompts for manual evaluation. No API key needed.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "../lib/harness.js";
import { search } from "../../src/search.js";
import { renderFile } from "../../src/tools.js";
import {
  getProductFile,
  getCritical,
  listByType,
  getFileById,
} from "../../src/db.js";
import { countTokens, disposeEncoder } from "../evaluators/token-counter.js";
import {
  measureContextRetrieval,
  averageContextMetrics,
} from "../evaluators/context-retrieval-quality.js";
import type { TaskGroundTruth } from "../lib/types.js";
import type { FileType } from "../../src/types.js";

async function main() {
  console.log("=== Interactive AI Quality Evaluation ===\n");

  const harness = await setup("corpus-small");

  try {
    const tasksPath = join(
      import.meta.dirname, "..", "fixtures", "ground-truth", "tasks.json"
    );
    const gt: TaskGroundTruth = JSON.parse(await readFile(tasksPath, "utf8"));

    const allTypes: FileType[] = ["product", "persona", "journey", "spec", "decision", "domain"];

    // Build paste-all context
    let pasteAllContext = "";
    for (const type of allTypes) {
      for (const f of listByType(harness.db, type)) {
        pasteAllContext += renderFile(f) + "\n\n---\n\n";
      }
    }
    const pasteAllTokens = countTokens(pasteAllContext);

    // Measure context retrieval for every task
    const allMetrics = [];
    const taskDetails = [];

    for (const task of gt.tasks) {
      // PCL retrieval: product + critical + search
      const product = getProductFile(harness.db);
      const criticalFiles = getCritical(harness.db);
      const searchResults = await search(harness.db, task.description, {
        mode: "hybrid", topK: 5,
      });

      const allRetrievedIds = [
        ...new Set([
          ...(product ? [product.id] : []),
          ...criticalFiles.map((f) => f.id),
          ...searchResults.map((r) => r.id),
        ]),
      ];

      const metrics = measureContextRetrieval(allRetrievedIds, task.requiredContext);
      allMetrics.push(metrics);

      // Build PCL context
      let pclContext = "";
      if (product) pclContext += renderFile(product) + "\n\n---\n\n";
      for (const c of criticalFiles) {
        pclContext += renderFile(c) + "\n\n---\n\n";
      }
      for (const sr of searchResults) {
        const file = getFileById(harness.db, sr.type, sr.id);
        if (file) pclContext += renderFile(file) + "\n\n---\n\n";
      }

      const pclTokens = countTokens(pclContext);

      taskDetails.push({
        taskId: task.id,
        category: task.category,
        description: task.description,
        requiredContext: task.requiredContext,
        retrievedIds: allRetrievedIds,
        recall: metrics.recall,
        precision: metrics.precision,
        f1: metrics.f1,
        hits: metrics.hits,
        misses: metrics.misses,
        noise: metrics.noise,
        pclTokens,
        criteriaCount: task.evaluationCriteria.length,
        requiredPatterns: task.requiredPatterns,
        forbiddenPatterns: task.forbiddenPatterns,
      });
    }

    // Print context retrieval results
    console.log("=== Context Retrieval Quality (all 20 tasks) ===\n");
    console.log("| Task     | Category           | Recall | Prec.  | F1     | Hits | Misses              | PCL tok |");
    console.log("|----------|--------------------|--------|--------|--------|------|---------------------|---------|");

    for (const t of taskDetails) {
      const missStr = t.misses.length > 0 ? t.misses.join(", ") : "none";
      console.log(
        `| ${t.taskId.padEnd(8)} | ${t.category.padEnd(18)} | ${t.recall.toFixed(2).padStart(6)} | ${t.precision.toFixed(2).padStart(6)} | ${t.f1.toFixed(2).padStart(6)} | ${String(t.hits.length).padStart(4)} | ${missStr.padEnd(19)} | ${String(t.pclTokens).padStart(7)} |`
      );
    }

    const avgCtx = averageContextMetrics(allMetrics);
    console.log(`\nAVERAGE: Recall=${avgCtx.recall.toFixed(3)} | Precision=${avgCtx.precision.toFixed(3)} | F1=${avgCtx.f1.toFixed(3)}`);
    console.log(`\nPaste-all tokens: ${pasteAllTokens}`);
    const avgPclTokens = taskDetails.reduce((s, t) => s + t.pclTokens, 0) / taskDetails.length;
    console.log(`Avg PCL tokens per task: ${Math.round(avgPclTokens)} (${((1 - avgPclTokens / pasteAllTokens) * 100).toFixed(1)}% savings)`);

    // Pick 6 representative tasks for manual evaluation
    const selectedIds = ["task-01", "task-05", "task-06", "task-07", "task-10", "task-12"];
    console.log(`\n=== Selected Tasks for Manual Evaluation ===\n`);

    for (const id of selectedIds) {
      const detail = taskDetails.find((t) => t.taskId === id);
      if (!detail) continue;
      const task = gt.tasks.find((t) => t.id === id)!;

      console.log(`--- ${detail.taskId} (${detail.category}) ---`);
      console.log(`Description: ${detail.description.slice(0, 120)}...`);
      console.log(`Required context: [${detail.requiredContext.join(", ")}]`);
      console.log(`PCL retrieved: [${detail.retrievedIds.join(", ")}]`);
      console.log(`Context recall: ${detail.recall.toFixed(2)} | Misses: [${detail.misses.join(", ") || "none"}]`);
      console.log(`Criteria: ${task.evaluationCriteria.map((c) => c.criterion).join(" | ")}`);
      console.log(`Required patterns: [${detail.requiredPatterns.join(", ")}]`);
      console.log(`Forbidden patterns: [${detail.forbiddenPatterns.join(", ")}]`);
      console.log("");
    }

    // Save results
    await mkdir(join(import.meta.dirname, "..", "results"), { recursive: true });
    await writeFile(
      join(import.meta.dirname, "..", "results", "interactive-eval.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), taskDetails, averageContext: avgCtx, pasteAllTokens }, null, 2)
    );

  } finally {
    disposeEncoder();
    await harness.cleanup();
  }
}

main().catch(console.error);
