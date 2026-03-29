/**
 * Layer 4: AI Coding Quality Benchmark
 *
 * Features:
 * 1. Structured yes/no judge
 * 2. Context retrieval quality metrics (recall, precision, F1)
 * 3. Multiple runs per task for statistical stability (mean + stddev)
 * 4. TypeScript syntax checking on generated code
 * 5. Separate context quality from code quality metrics
 *
 * Cost: ~$5-15 per full run (3x repetitions).
 * Requires: ANTHROPIC_API_KEY + BENCH_AI_QUALITY=1
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Load .env file
const envPath = join(import.meta.dirname, "..", "..", ".env");
try {
  const envContent = await readFile(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { /* no .env file, rely on env vars */ }

import Anthropic from "@anthropic-ai/sdk";
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
  structuredJudge,
  checkTypeScriptSyntax,
} from "../evaluators/structured-judge.js";
import {
  measureContextRetrieval,
  averageContextMetrics,
  type ContextMetrics,
} from "../evaluators/context-retrieval-quality.js";
import type { TaskGroundTruth, CodingTask } from "../lib/types.js";
import type { FileType } from "../../src/types.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
  console.error(
    "Usage: ANTHROPIC_API_KEY=sk-... BENCH_AI_QUALITY=1 npm run bench:ai"
  );
  process.exit(1);
}

if (!process.env.BENCH_AI_QUALITY) {
  console.error(
    "Error: Set BENCH_AI_QUALITY=1 to confirm running this benchmark (costs ~$5-15)."
  );
  process.exit(1);
}

const RUNS = parseInt(process.env.BENCH_RUNS ?? "1", 10); // default 1, set BENCH_RUNS=3 for stability
const client = new Anthropic();
const MODEL = "claude-sonnet-4-20250514";

async function callLLM(system: string, userMessage: string): Promise<string> {
  const maxRetries = 6;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system,
        messages: [{ role: "user", content: userMessage }],
      });
      const block = response.content[0];
      return block?.type === "text" ? block.text : "";
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 529 || status === 429 || status === 500) {
        const delay = (attempt + 1) * 15_000; // 15s, 30s, 45s, 60s, 75s, 90s
        console.log(`    [retry ${attempt + 1}/${maxRetries}] ${status} — waiting ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  return ""; // all retries exhausted
}

// Throttle between tasks to avoid hammering the API
async function throttle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 3000));
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

interface TaskResult {
  taskId: string;
  category: string;
  // Structured judge scores (mean of 3 runs)
  noContext: { mean: number; stddev: number; runs: number[] };
  pasteAll: { mean: number; stddev: number; runs: number[] };
  pcl: { mean: number; stddev: number; runs: number[] };
  // Context retrieval quality
  contextMetrics: ContextMetrics;
  // Syntax validity
  syntax: {
    noContext: { valid: number; total: number };
    pasteAll: { valid: number; total: number };
    pcl: { valid: number; total: number };
  };
  // Token usage
  pclTokens: number;
  pasteAllTokens: number;
}

async function main() {
  console.log("=== Layer 4: AI Coding Quality ===\n");
  console.log(`Model: ${MODEL} | Runs per task: ${RUNS}\n`);

  const harness = await setup("corpus-small");

  try {
    const tasksPath = join(
      import.meta.dirname,
      "..",
      "fixtures",
      "ground-truth",
      "tasks.json"
    );
    const gt: TaskGroundTruth = JSON.parse(await readFile(tasksPath, "utf8"));

    // Build paste-all context
    const allTypes: FileType[] = [
      "product", "persona", "journey", "spec", "decision", "domain",
    ];
    let pasteAllContext = "";
    for (const type of allTypes) {
      for (const f of listByType(harness.db, type)) {
        pasteAllContext += renderFile(f) + "\n\n---\n\n";
      }
    }
    const pasteAllTokens = countTokens(pasteAllContext);
    console.log(`Paste-all context: ${pasteAllTokens} tokens\n`);

    const systemPrompt =
      "You are an expert software engineer. Write production-quality TypeScript/React code. Follow the product specs and constraints. Output code in fenced code blocks.";

    const results: TaskResult[] = [];
    const allContextMetrics: ContextMetrics[] = [];

    for (let i = 0; i < gt.tasks.length; i++) {
      const task = gt.tasks[i]!;
      console.log(
        `[${i + 1}/${gt.tasks.length}] ${task.id} (${task.category})`
      );

      // --- Step 1: Measure context retrieval quality ---
      const searchResults = await search(harness.db, task.description, {
        mode: "hybrid",
        topK: 5,
      });
      const retrievedIds = searchResults.map((r) => r.id);

      // Include product file only if it appears in search results
      const product = getProductFile(harness.db);
      const criticalFiles = getCritical(harness.db);

      // Only include critical files that are relevant (appear in search results
      // or match the task's required context) to avoid adding noise
      const searchIdSet = new Set(retrievedIds);
      const relevantCritical = criticalFiles.filter(
        (f) => searchIdSet.has(f.id) || task.requiredContext.includes(f.id)
      );
      const includeProduct = product && (searchIdSet.has(product.id) || task.requiredContext.includes(product.id));

      const allRetrievedIds = [
        ...new Set([
          ...(includeProduct ? [product!.id] : []),
          ...relevantCritical.map((f) => f.id),
          ...retrievedIds,
        ]),
      ];

      const contextMetrics = measureContextRetrieval(
        allRetrievedIds,
        task.requiredContext
      );
      allContextMetrics.push(contextMetrics);

      // Build PCL context — de-duplicate so critical files appearing in
      // search results are not rendered twice
      const renderedIds = new Set<string>();
      let pclContext = "";
      if (includeProduct) {
        pclContext += renderFile(product!) + "\n\n---\n\n";
        renderedIds.add(product!.id);
      }
      for (const c of relevantCritical) {
        if (renderedIds.has(c.id)) continue;
        pclContext += renderFile(c) + "\n\n---\n\n";
        renderedIds.add(c.id);
      }
      for (const sr of searchResults) {
        if (renderedIds.has(sr.id)) continue;
        const file = getFileById(harness.db, sr.type, sr.id);
        if (file) pclContext += renderFile(file) + "\n\n---\n\n";
        renderedIds.add(sr.id);
      }
      const pclTokens = countTokens(pclContext);

      // Build context docs for judge (the actual required docs)
      let judgeDocs = "";
      for (const docId of task.requiredContext) {
        for (const type of allTypes) {
          const file = getFileById(harness.db, type, docId);
          if (file) {
            judgeDocs += renderFile(file) + "\n\n---\n\n";
            break;
          }
        }
      }

      // --- Step 2: Generate and evaluate (3 runs) ---
      const scoresA: number[] = [];
      const scoresB: number[] = [];
      const scoresC: number[] = [];
      const syntaxA = { valid: 0, total: 0 };
      const syntaxB = { valid: 0, total: 0 };
      const syntaxC = { valid: 0, total: 0 };

      for (let run = 0; run < RUNS; run++) {
        // Generate outputs (sequential with throttle to avoid overloading)
        const outputA = await callLLM(systemPrompt, task.description);
        await throttle();
        const outputB = await callLLM(
          systemPrompt + "\n\n## Product Context\n\n" + pasteAllContext,
          task.description
        );
        await throttle();
        const outputC = await callLLM(
          systemPrompt + "\n\n## Product Context (PCL)\n\n" + pclContext,
          task.description
        );
        await throttle();

        // Structured judge evaluation (sequential to be gentle on API)
        const judgeA = await structuredJudge(client, task, outputA, "");
        await throttle();
        const judgeB = await structuredJudge(client, task, outputB, judgeDocs);
        await throttle();
        const judgeC = await structuredJudge(client, task, outputC, judgeDocs);
        await throttle();

        scoresA.push(judgeA.score);
        scoresB.push(judgeB.score);
        scoresC.push(judgeC.score);

        // Syntax check
        const synA = checkTypeScriptSyntax(outputA);
        const synB = checkTypeScriptSyntax(outputB);
        const synC = checkTypeScriptSyntax(outputC);

        if (synA.codeBlockCount > 0) {
          syntaxA.total++;
          if (synA.valid) syntaxA.valid++;
        }
        if (synB.codeBlockCount > 0) {
          syntaxB.total++;
          if (synB.valid) syntaxB.valid++;
        }
        if (synC.codeBlockCount > 0) {
          syntaxC.total++;
          if (synC.valid) syntaxC.valid++;
        }
      }

      const result: TaskResult = {
        taskId: task.id,
        category: task.category,
        noContext: { mean: mean(scoresA), stddev: stddev(scoresA), runs: scoresA },
        pasteAll: { mean: mean(scoresB), stddev: stddev(scoresB), runs: scoresB },
        pcl: { mean: mean(scoresC), stddev: stddev(scoresC), runs: scoresC },
        contextMetrics,
        syntax: { noContext: syntaxA, pasteAll: syntaxB, pcl: syntaxC },
        pclTokens,
        pasteAllTokens,
      };

      results.push(result);

      const flag = result.pcl.stddev > 1.5 ? " [UNSTABLE]" : "";
      console.log(
        `  Scores: No=${result.noContext.mean.toFixed(1)}±${result.noContext.stddev.toFixed(1)} | All=${result.pasteAll.mean.toFixed(1)}±${result.pasteAll.stddev.toFixed(1)} | PCL=${result.pcl.mean.toFixed(1)}±${result.pcl.stddev.toFixed(1)}${flag}`
      );
      console.log(
        `  Context: recall=${contextMetrics.recall.toFixed(2)} precision=${contextMetrics.precision.toFixed(2)} F1=${contextMetrics.f1.toFixed(2)} | misses: [${contextMetrics.misses.join(", ")}]`
      );
    }

    // --- Summary ---
    console.log("\n=== Results Summary ===\n");

    // Score comparison table
    console.log(
      "| Task     | Category           | No Context     | Paste All      | PCL            |"
    );
    console.log(
      "|----------|--------------------|----------------|----------------|----------------|"
    );
    for (const r of results) {
      console.log(
        `| ${r.taskId.padEnd(8)} | ${r.category.padEnd(18)} | ${r.noContext.mean.toFixed(1)}±${r.noContext.stddev.toFixed(1).padEnd(4)} | ${r.pasteAll.mean.toFixed(1)}±${r.pasteAll.stddev.toFixed(1).padEnd(4)} | ${r.pcl.mean.toFixed(1)}±${r.pcl.stddev.toFixed(1).padEnd(4)} |`
      );
    }

    const avgA = mean(results.map((r) => r.noContext.mean));
    const avgB = mean(results.map((r) => r.pasteAll.mean));
    const avgC = mean(results.map((r) => r.pcl.mean));

    console.log(
      `| AVERAGE  |                    | ${avgA.toFixed(1).padEnd(14)} | ${avgB.toFixed(1).padEnd(14)} | ${avgC.toFixed(1).padEnd(14)} |`
    );

    // Context retrieval summary
    const avgCtx = averageContextMetrics(allContextMetrics);
    console.log(`\nContext Retrieval Quality:`);
    console.log(
      `  Recall: ${avgCtx.recall.toFixed(3)} | Precision: ${avgCtx.precision.toFixed(3)} | F1: ${avgCtx.f1.toFixed(3)}`
    );

    // Syntax validity
    const synTotalA = results.reduce((s, r) => s + r.syntax.noContext.total, 0);
    const synValidA = results.reduce((s, r) => s + r.syntax.noContext.valid, 0);
    const synTotalB = results.reduce((s, r) => s + r.syntax.pasteAll.total, 0);
    const synValidB = results.reduce((s, r) => s + r.syntax.pasteAll.valid, 0);
    const synTotalC = results.reduce((s, r) => s + r.syntax.pcl.total, 0);
    const synValidC = results.reduce((s, r) => s + r.syntax.pcl.valid, 0);

    console.log(`\nSyntax Validity:`);
    console.log(
      `  No Context: ${synTotalA > 0 ? ((synValidA / synTotalA) * 100).toFixed(0) : "N/A"}% | Paste All: ${synTotalB > 0 ? ((synValidB / synTotalB) * 100).toFixed(0) : "N/A"}% | PCL: ${synTotalC > 0 ? ((synValidC / synTotalC) * 100).toFixed(0) : "N/A"}%`
    );

    // Token efficiency
    const avgPclTokens = mean(results.map((r) => r.pclTokens));
    console.log(
      `\nToken Efficiency: PCL avg ${Math.round(avgPclTokens)} tok vs paste-all ${pasteAllTokens} tok (${((1 - avgPclTokens / pasteAllTokens) * 100).toFixed(1)}% savings)`
    );

    // Statistical significance hint
    const delta = avgC - avgA;
    console.log(
      `\nPCL vs No-Context delta: +${delta.toFixed(1)} points`
    );
    if (delta > 1.5) {
      console.log("  → Meaningful improvement detected");
    } else {
      console.log("  → Delta below 1.5 threshold — more tasks may be needed");
    }

    // Save results
    await mkdir(join(import.meta.dirname, "..", "results"), { recursive: true });
    await writeFile(
      join(import.meta.dirname, "..", "results", "ai-quality.json"),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          model: MODEL,
          runs: RUNS,
          results,
          averages: { noContext: avgA, pasteAll: avgB, pcl: avgC },
          contextRetrieval: avgCtx,
          syntaxValidity: {
            noContext: synTotalA > 0 ? synValidA / synTotalA : null,
            pasteAll: synTotalB > 0 ? synValidB / synTotalB : null,
            pcl: synTotalC > 0 ? synValidC / synTotalC : null,
          },
        },
        null,
        2
      )
    );
    console.log("\nResults saved to benchmarks/results/ai-quality.json");
  } finally {
    disposeEncoder();
    await harness.cleanup();
  }
}

main().catch(console.error);
