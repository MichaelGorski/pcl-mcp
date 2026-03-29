import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setup } from "../lib/harness.js";
import { countTokens, disposeEncoder } from "../evaluators/token-counter.js";
import { renderFile } from "../../src/tools.js";
import { getProductFile, getCritical, listByType } from "../../src/db.js";
import { search } from "../../src/search.js";
import type { FileType } from "../../src/types.js";
import { writeFile, mkdir } from "node:fs/promises";

async function main(): Promise<void> {
  console.log("=== Layer 3: Token Efficiency Benchmark ===\n");

  const harness = await setup("corpus-small");
  const results: Array<{
    corpusSize: number;
    pclSessionStartTokens: number;
    pasteAllTokens: number;
    savingsPercent: number;
    ratio: number;
  }> = [];

  try {
    // --- Measure PCL session start tokens ---
    const product = getProductFile(harness.db);
    const critical = getCritical(harness.db);

    let pclSessionStart = "";
    if (product) pclSessionStart += renderFile(product);
    for (const c of critical) {
      pclSessionStart += "\n\n---\n\n" + renderFile(c);
    }
    const pclSessionStartTokens = countTokens(pclSessionStart);

    // --- Measure paste-all tokens ---
    // Read all markdown files from corpus directory
    const allTypes: FileType[] = ["product", "persona", "journey", "spec", "decision", "domain"];
    let allContent = "";

    // Get all files from DB and render them
    for (const type of allTypes) {
      const files = listByType(harness.db, type);
      for (const f of files) {
        allContent += renderFile(f) + "\n\n---\n\n";
      }
    }
    const pasteAllTokens = countTokens(allContent);

    const savingsPercent = (1 - pclSessionStartTokens / pasteAllTokens) * 100;
    const ratio = pasteAllTokens / pclSessionStartTokens;

    results.push({
      corpusSize: 10,
      pclSessionStartTokens,
      pasteAllTokens,
      savingsPercent,
      ratio,
    });

    // --- Print results ---
    console.log("Token Efficiency Results:");
    console.log("\u2500".repeat(70));
    console.log(
      "| Corpus Size | PCL Start  | Paste All  | Savings | Ratio |",
    );
    console.log(
      "|-------------|------------|------------|---------|-------|",
    );
    for (const r of results) {
      console.log(
        `| ${String(r.corpusSize).padStart(11)} | ${String(r.pclSessionStartTokens).padStart(10)} | ${String(r.pasteAllTokens).padStart(10)} | ${r.savingsPercent.toFixed(1).padStart(6)}% | ${r.ratio.toFixed(1).padStart(5)}x |`,
      );
    }
    console.log("");

    // --- Per-task token analysis ---
    console.log("Per-Task Token Analysis (PCL search vs paste-all):");
    console.log("\u2500".repeat(70));

    const sampleQueries = [
      { name: "Dashboard implementation", query: "dashboard page active projects" },
      { name: "Billing discount feature", query: "discount coupon billing payment" },
      { name: "Onboarding flow", query: "onboarding signup verification" },
      { name: "Account deletion", query: "account deletion data governance" },
    ];

    console.log("| Task                     | PCL Tokens | All Tokens | Precision |");
    console.log("|--------------------------|------------|------------|-----------|");

    for (const sq of sampleQueries) {
      const searchResults = await search(harness.db, sq.query, { mode: "hybrid", topK: 3 });
      let pclContent = "";
      for (const r of searchResults) {
        // Re-fetch full file to render it
        const files = listByType(harness.db, r.type);
        const file = files.find((f) => f.id === r.id);
        if (file) pclContent += renderFile(file) + "\n\n";
      }
      const pclTokens = countTokens(pclContent);
      const precision = searchResults.length > 0 ? ((pclTokens / pasteAllTokens) * 100).toFixed(1) : "0.0";

      console.log(
        `| ${sq.name.padEnd(24)} | ${String(pclTokens).padStart(10)} | ${String(pasteAllTokens).padStart(10)} | ${String(precision).padStart(8)}% |`,
      );
    }

    // --- Save results ---
    await mkdir(join(import.meta.dirname, "..", "results"), { recursive: true });
    await writeFile(
      join(import.meta.dirname, "..", "results", "token-efficiency.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2),
    );
    console.log("\nResults saved to benchmarks/results/token-efficiency.json");
  } finally {
    disposeEncoder();
    await harness.cleanup();
  }
}

main().catch(console.error);
