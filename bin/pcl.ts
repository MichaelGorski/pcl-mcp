#!/usr/bin/env node
// bin/pcl.ts
// CLI: pcl init | pcl serve | pcl status

import { mkdir, writeFile, readFile, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { constants, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const cmd = process.argv[2];
const args = process.argv.slice(3);
const hasFlag = (flag: string) => args.includes(flag);

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES = {
  "product.md": `---
name: "My Product"
tagline: "One-line description of what it does"
problem: "The problem this product solves"
solution: "How it solves that problem"
primary_persona: "change-this-to-your-persona-id"
tech_stack:
  - Next.js
  - Supabase
  - TypeScript
stage: prototype
repo: ""
url: ""
---

## Vision

Write your product vision here. What does success look like in 3 years?

## North star metric

The one number that proves this product is working.

## What this product is NOT

(Helps agents avoid scope creep — be explicit about what you're not building)
`,

  "personas/001-example.md": `---
id: example-user
name: "Alex"
role: "Freelance designer"
age_range: "25-35"
tech_level: medium
primary_goal: "Ship client projects faster without sacrificing quality"
biggest_fear: "Losing a client because a project ran over time or budget"
jobs_to_be_done:
  - Track project time without friction
  - Communicate progress to clients proactively
  - Avoid scope creep
anti_patterns:
  - Won't fill out forms longer than 2 minutes
  - Ignores marketing emails, responds to Slack/WhatsApp
  - Doesn't read documentation, prefers watching a 60-second demo
channels:
  - Twitter/X
  - Dribbble
  - Designer Slack communities
---

## Context

Write 2-3 sentences about Alex's day-to-day life. What does their work look like?
What tools do they already use? What's the emotional context behind their problem?

## Design implications

Write specific rules the agent must follow when building anything for this persona:
- Maximum X steps to complete core action
- Must work on mobile
- etc.
`,

  "journeys/001-onboarding.md": `---
id: onboarding
name: "First-time onboarding"
persona: example-user
trigger: "User clicks 'Get started free' on landing page"
success_state: "User completes their first core action within 10 minutes of signup"
failure_modes:
  - "Drops off at email verification step"
  - "Completes signup but never reaches core feature"
  - "Starts core feature but abandons before saving"
steps:
  - landing
  - signup
  - verify-email
  - first-action
  - aha-moment
---

## Step detail

### landing
Goal: Communicate value prop in under 10 seconds.
Critical: Show social proof above the fold.
Do not: Ask for credit card on landing page.

### signup
Email + password or magic link only.
Do NOT ask for name, company, or phone at this step — capture later.

### verify-email
Keep this step as frictionless as possible.
Provide a "resend" link immediately visible.
Auto-redirect on verification — don't make user click a button.

### first-action
This is where users must reach immediately after signup.
Pre-fill as much as possible from their signup email/domain.
Show a progress indicator: "Step 1 of 3".

### aha-moment
Define what the "aha moment" is for your product.
Everything before this step is setup — this is where retention begins.
`,

  "specs/001-example-feature.md": `---
id: magic-link-auth
title: "Magic link authentication"
persona: example-user
journey: onboarding
status: draft
acceptance_criteria:
  - "User enters email and receives a link within 30 seconds"
  - "Link expires after 15 minutes"
  - "Link works only once (single-use token)"
  - "After clicking, user is redirected to /dashboard"
  - "If link is expired, user sees a clear error with a 'Request new link' button"
out_of_scope:
  - "Social login (OAuth) — deferred to v2"
  - "SMS-based verification"
design_ref: ""
---

## Overview

Write a short description of the feature from the user's perspective.

## Technical notes

Any implementation constraints the agent needs to know:
- Which library to use
- Which existing patterns to follow
- Security requirements

## Edge cases

List edge cases that are NOT covered by acceptance criteria above.
`,

  "decisions/001-example-adr.md": `---
id: adr-001
title: "Use Next.js App Router + Supabase"
status: accepted
date: "2025-01-01"
context: "Need a full-stack framework with good DX, easy auth, and minimal ops overhead for a solo developer."
decision: "Use Next.js App Router for the frontend/API layer and Supabase for auth, database, and storage."
consequences:
  - "Edge functions for webhook handling"
  - "Row Level Security (RLS) policies enforce data isolation — agents must always include RLS on new tables"
  - "No separate backend service needed"
alternatives_rejected:
  - "Remix — less Claude Code tooling support as of Q1 2025"
  - "PlanetScale — cost at scale vs Supabase free tier"
---

## Detail

Write more context here if needed. What trade-offs were made?
What would make this decision worth revisiting?
`,

  "domain/core-rules.md": `---
id: core-business-rules
critical: true
title: "Core business rules"
---

## Rules that must NEVER be violated

These are business invariants. No agent should ever write code that contradicts these rules.
If in doubt, call pcl_get_domain('*critical') before touching the relevant code.

### Data ownership
1. User data is NEVER deleted on account downgrade — only access is restricted
2. Export must always be available regardless of plan

### Billing
1. Cancellation takes effect immediately — no grace period unless explicitly specified
2. Downgrade happens at end of billing period, never mid-period
3. Stripe is the source of truth for subscription status — never trust local DB alone

### Authentication
1. Sessions expire after 30 days of inactivity
2. Password reset tokens expire after 1 hour
3. Never log or store plaintext passwords, tokens, or secrets anywhere

### Add your own rules below...
`,
};

// ─── Commands ─────────────────────────────────────────────────────────────────

async function init() {
  const scanMode = hasFlag("--scan");
  const scanOnly = hasFlag("--scan-only");

  // First positional arg that doesn't start with -- is the dir
  const dirArg = args.find((a) => !a.startsWith("--"));
  const productDir = resolve(dirArg ?? "./product");
  console.log(`\nInitialising PCL product folder at: ${productDir}\n`);

  // Track which type categories were covered by scan imports
  const coveredTypes = new Set<string>();

  // ── Scan phase ──
  if (scanMode || scanOnly) {
    const { runScan } = await import("../src/scanner.js");
    const rootDir = process.cwd();
    const summary = await runScan(rootDir, productDir);

    if (scanOnly) {
      console.log("\nDone (scan-only mode).\n");
      return;
    }

    for (const r of summary.imported) coveredTypes.add(r.type);
    console.log(""); // blank line before template scaffolding
  }

  // ── Template scaffolding ──
  // Map template relative paths to the PCL type category they belong to
  const templateTypeMap: Record<string, string> = {
    "product.md": "product",
    "personas/001-example.md": "persona",
    "journeys/001-onboarding.md": "journey",
    "specs/001-example-feature.md": "spec",
    "decisions/001-example-adr.md": "decision",
    "domain/core-rules.md": "domain",
  };

  const dirs = ["", "personas", "journeys", "specs", "decisions", "domain"];
  for (const dir of dirs) {
    await mkdir(join(productDir, dir), { recursive: true });
  }

  let created = 0;
  let skipped = 0;
  for (const [rel, content] of Object.entries(TEMPLATES)) {
    // Skip templates for categories already covered by scan imports
    const category = templateTypeMap[rel];
    if (category && coveredTypes.has(category)) {
      console.log(`  ↷  ${rel} (category covered by scan, skipped)`);
      skipped++;
      continue;
    }

    const dest = join(productDir, rel);
    try {
      await access(dest, constants.F_OK);
      console.log(`  ↷  ${rel} (exists, skipped)`);
      skipped++;
    } catch {
      await writeFile(dest, content, "utf8");
      console.log(`  ✓  ${rel}`);
      created++;
    }
  }

  // Write CLAUDE.md bridge
  const claudeMd = join(process.cwd(), "CLAUDE.md");
  const bridge = `
## Product Context Layer (PCL)

This project uses PCL for product knowledge. An MCP server is running (see mcp config).

**IMPORTANT:** PCL contains ALL product knowledge — personas, journeys, specs, decisions, and domain rules.
Read ALL categories thoroughly. Do not skip any folder or assume content is irrelevant.

### At the start of every coding session:
1. Call \`pcl_product_summary\` — orient yourself with the product north star
2. Call \`pcl_get_domain("*critical")\` — load non-violable business rules
3. Call \`pcl_list({ type: "decisions" })\` — review architecture decisions
4. Call \`pcl_list({ type: "personas" })\` — know who you are building for
5. Call \`pcl_list({ type: "specs" })\` — see what features are defined

### Before working on any user-facing feature:
- Call \`pcl_get_persona(id)\` for EVERY relevant persona — read full detail
- Call \`pcl_get_journey(id)\` for the relevant user journey — follow every step
- Call \`pcl_get_spec(id)\` for the feature spec — check all acceptance criteria
- Call \`pcl_get_decision(id)\` for any architecture decision that affects the feature

### Before making any architectural or technical choice:
- Call \`pcl_list({ type: "decisions" })\` then \`pcl_get_decision(id)\` for relevant ADRs
- Call \`pcl_get_domain("*critical")\` if the change touches billing, auth, or data models
- Call \`pcl_search({ query: "your topic" })\` to find related product knowledge

### When exploring or unsure:
- Call \`pcl_search({ query: "your question" })\` — hybrid semantic + keyword search
- Call \`pcl_related(id)\` — discover connected context
- Call \`pcl_list({ type: "domain" })\` then \`pcl_get_domain(id)\` — read ALL domain rules

### NEVER:
- Make assumptions about who the user is — always load the persona
- Skip loading decisions before making architectural choices
- Violate any rule in domain rules (critical or otherwise)
- Build features not covered by an accepted spec without asking first
- Assume you know the product context — always query PCL first
`;

  try {
    await access(claudeMd, constants.F_OK);
    const existing = await readFile(claudeMd, "utf8");
    if (existing.includes("## Product Context Layer (PCL)")) {
      console.log(`\n  ↷  CLAUDE.md already contains PCL instructions, skipped`);
      skipped++;
    } else {
      await writeFile(claudeMd, existing.trimEnd() + "\n\n" + bridge, "utf8");
      console.log(`  ✓  CLAUDE.md (appended PCL instructions)`);
      created++;
    }
  } catch {
    await writeFile(claudeMd, bridge, "utf8");
    console.log(`  ✓  CLAUDE.md`);
    created++;
  }

  console.log(`\nDone! Created: ${created}, skipped: ${skipped}`);
  console.log("\nNext steps:");
  console.log("  1. Edit product/product.md with your actual product details");
  console.log("  2. Rename and fill in the example persona, journey, and spec files");
  console.log("  3. Add your MCP server config (see README)");
  console.log("  4. Start a new agent session — PCL loads automatically\n");
}

// ─── Status ──────────────────────────────────────────────────────────────────

/** Count .md files on disk per subdirectory (no DB needed) */
async function countDiskFiles(productDir: string): Promise<{ product: boolean; counts: Record<string, number> }> {
  const counts: Record<string, number> = {
    personas: 0, journeys: 0, specs: 0, decisions: 0, domain: 0,
  };
  const hasProduct = existsSync(join(productDir, "product.md"));

  for (const dir of Object.keys(counts)) {
    const dirPath = join(productDir, dir);
    if (!existsSync(dirPath)) continue;
    try {
      const entries = await readdir(dirPath);
      counts[dir] = entries.filter((e) => e.endsWith(".md") && !e.startsWith(".")).length;
    } catch { /* dir unreadable */ }
  }

  return { product: hasProduct, counts };
}

function resolveStatusDir(): string {
  // Support --product-dir flag (same as serve)
  const dirFlagIdx = args.indexOf("--product-dir");
  if (dirFlagIdx !== -1 && args[dirFlagIdx + 1]) {
    return resolve(args[dirFlagIdx + 1]!);
  }
  const candidates = [
    join(process.cwd(), "product"),
    join(process.cwd(), ".product"),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

async function status() {
  const productDir = resolveStatusDir();

  if (!existsSync(productDir)) {
    console.log(`\nNo product directory found at ${productDir}`);
    console.log(`Run 'pcl init' to scaffold the product folder.\n`);
    return;
  }

  // Always show disk file counts (works without server having run)
  const disk = await countDiskFiles(productDir);

  console.log("\nPCL Status");
  console.log(`  Product dir:  ${productDir}`);

  if (disk.product) {
    console.log(`  Product file: ✓ product.md`);
  } else {
    console.log(`  Product file: ✗ product.md not found`);
  }

  const typeMap: Record<string, string> = {
    personas: "persona", journeys: "journey", specs: "spec",
    decisions: "decision", domain: "domain",
  };

  // Check if DB exists (server has been run at least once)
  const dbPath = join(productDir, ".pcl.db");
  const hasDB = existsSync(dbPath);

  let totalDisk = disk.product ? 1 : 0;
  let totalIndexed = 0;
  let totalEmbedded = 0;

  // If DB exists, also show indexed/embedded counts
  let dbData: Record<string, { indexed: number; embedded: number }> | null = null;
  if (hasDB) {
    const { openDB, closeDB, getProductFile, listByType } = await import("../src/db.js");
    const db = openDB(productDir);
    dbData = {};

    const product = getProductFile(db);
    if (product) {
      totalIndexed++;
      if (product.embedding.length > 0) totalEmbedded++;
    }

    for (const [plural, type] of Object.entries(typeMap)) {
      const files = listByType(db, type as import("../src/types.js").FileType);
      const embedded = files.filter((f) => f.embedding.length > 0).length;
      dbData[plural] = { indexed: files.length, embedded };
      totalIndexed += files.length;
      totalEmbedded += embedded;
    }

    closeDB();
  }

  console.log("\n  Files by type:");

  for (const dir of Object.keys(disk.counts)) {
    const onDisk = disk.counts[dir]!;
    totalDisk += onDisk;
    const label = dir.padEnd(12);

    if (dbData && dbData[dir]) {
      const { indexed, embedded } = dbData[dir];
      console.log(`    ${label} ${onDisk} on disk, ${indexed} indexed, ${embedded} embedded`);
    } else {
      console.log(`    ${label} ${onDisk} on disk`);
    }
  }

  if (dbData) {
    console.log(`\n  Total: ${totalDisk} on disk, ${totalIndexed} indexed, ${totalEmbedded} embedded`);
  } else {
    console.log(`\n  Total: ${totalDisk} on disk`);
    console.log(`\n  Note: No index found. Start the MCP server to index files and generate embeddings.`);
  }
}

// ─── Help text ───────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
pcl — Product Context Layer CLI (v${version})

Commands:
  init [dir]              Scaffold /product folder with templates (default: ./product)
  init --scan [dir]       Scan repo for existing .md files, import, then scaffold remaining templates
  init --scan-only [dir]  Scan and import only, don't scaffold templates
  serve                   Start the MCP server (reads --product-dir flag)
  status                  Show file counts and embedding coverage (reads --product-dir flag)

Options:
  --help, -h              Show this help text
  --version, -v           Show version number

Examples:
  npx pcl-mcp init
  npx pcl-mcp init --scan
  npx pcl-mcp init --scan-only
  npx pcl-mcp init ./my-product-docs
  npx pcl-mcp serve --product-dir ./product
  npx pcl-mcp status
`);
}

// ─── Router ───────────────────────────────────────────────────────────────────

switch (cmd) {
  case "init":
    init().catch(console.error);
    break;
  case "serve":
    // Delegate to the server module
    import("../src/server.js").catch(console.error);
    break;
  case "status":
    status().catch(console.error);
    break;
  case "--version":
  case "-v":
    console.log(version);
    break;
  case "--help":
  case "-h":
  default:
    printHelp();
}
