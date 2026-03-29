/**
 * Markdown reporter — reads JSON results from benchmarks/results/ and generates REPORT.md
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RESULTS_DIR = join(import.meta.dirname, "..", "results");

async function loadJSON<T>(filename: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(RESULTS_DIR, filename), "utf8")) as T;
  } catch {
    return null;
  }
}

async function main() {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push("# PCL MCP Benchmark Report");
  push("");
  push(`Generated: ${new Date().toISOString()}`);
  push("");

  // --- Token Efficiency ---
  const tokenData = await loadJSON<{
    results: Array<{
      corpusSize: number;
      pclSessionStartTokens: number;
      pasteAllTokens: number;
      savingsPercent: number;
      ratio: number;
    }>;
  }>("token-efficiency.json");

  if (tokenData) {
    push("## Layer 3: Token Efficiency");
    push("");
    push("| Corpus Size | PCL Start | Paste All | Savings | Ratio |");
    push("|-------------|-----------|-----------|---------|-------|");
    for (const r of tokenData.results) {
      push(`| ${r.corpusSize} files | ${r.pclSessionStartTokens} tok | ${r.pasteAllTokens} tok | ${r.savingsPercent.toFixed(1)}% | ${r.ratio.toFixed(1)}x |`);
    }
    push("");
  }

  // --- Search Quality ---
  const searchData = await loadJSON<{
    aggregate: Record<string, {
      precisionAt1: number;
      precisionAt3: number;
      precisionAt5: number;
      recallAt5: number;
      mrr: number;
      ndcgAt5: number;
    }>;
  }>("search-quality.json");

  if (searchData) {
    push("## Layer 2: Search Quality");
    push("");
    push("| Mode | P@1 | P@3 | P@5 | R@5 | MRR | NDCG@5 |");
    push("|------|-----|-----|-----|-----|-----|--------|");
    for (const [mode, m] of Object.entries(searchData.aggregate)) {
      push(`| ${mode} | ${m.precisionAt1.toFixed(3)} | ${m.precisionAt3.toFixed(3)} | ${m.precisionAt5.toFixed(3)} | ${m.recallAt5.toFixed(3)} | ${m.mrr.toFixed(3)} | ${m.ndcgAt5.toFixed(3)} |`);
    }
    push("");
  }

  // --- Ablation ---
  const ablationData = await loadJSON<{
    results: Array<{
      config: string;
      metrics: {
        precisionAt1: number;
        precisionAt3: number;
        precisionAt5: number;
        recallAt5: number;
        mrr: number;
        ndcgAt5: number;
      };
    }>;
  }>("ablation.json");

  if (ablationData) {
    push("## Layer 5: Ablation Study");
    push("");
    push("| Configuration | P@1 | P@3 | P@5 | R@5 | MRR | NDCG@5 |");
    push("|---------------|-----|-----|-----|-----|-----|--------|");
    for (const r of ablationData.results) {
      const m = r.metrics;
      push(`| ${r.config} | ${m.precisionAt1.toFixed(3)} | ${m.precisionAt3.toFixed(3)} | ${m.precisionAt5.toFixed(3)} | ${m.recallAt5.toFixed(3)} | ${m.mrr.toFixed(3)} | ${m.ndcgAt5.toFixed(3)} |`);
    }
    push("");
  }

  // --- AI Quality ---
  const aiData = await loadJSON<{
    model: string;
    judgeModel: string;
    results: Array<{
      taskId: string;
      category: string;
      noContext: number;
      pasteAll: number;
      pcl: number;
    }>;
    averages: { noContext: number; pasteAll: number; pcl: number };
  }>("ai-quality.json");

  if (aiData) {
    push("## Layer 4: AI Coding Quality");
    push("");
    push(`Model: \`${aiData.model}\` | Judge: \`${aiData.judgeModel}\``);
    push("");
    push("| Task ID | Category | No Context | Paste All | PCL |");
    push("|---------|----------|------------|-----------|-----|");
    for (const r of aiData.results) {
      push(`| ${r.taskId} | ${r.category} | ${r.noContext.toFixed(1)} | ${r.pasteAll.toFixed(1)} | ${r.pcl.toFixed(1)} |`);
    }
    push(`| **AVERAGE** | | **${aiData.averages.noContext.toFixed(1)}** | **${aiData.averages.pasteAll.toFixed(1)}** | **${aiData.averages.pcl.toFixed(1)}** |`);
    push("");
  }

  const report = lines.join("\n");
  await writeFile(join(RESULTS_DIR, "REPORT.md"), report);
  console.log("Report generated: benchmarks/results/REPORT.md");
  console.log(report);
}

main().catch(console.error);
