// src/scanner.ts
// Scan repo for existing .md files, classify them by PCL type, and transform into product/ structure.

import { readdir, readFile, stat, writeFile, access, mkdir } from "node:fs/promises";
import { join, relative, basename, dirname, extname } from "node:path";
import { constants } from "node:fs";
import matter from "gray-matter";
import type { FileType } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScannedFile {
  path: string;
  relativePath: string;
}

export interface ClassificationResult {
  type: FileType;
  confidence: number;
}

export interface TransformResult {
  frontmatter: Record<string, unknown>;
  body: string;
  targetPath: string;
}

export interface ScanResult {
  sourcePath: string;
  targetPath: string;
  type: FileType;
  confidence: number;
}

export interface ScanSummary {
  imported: ScanResult[];
  skipped: ScanResult[];
  unclassified: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".git", "product", ".next", ".nuxt",
  ".output", "build", "coverage", "__pycache__", ".cache",
]);

const SKIP_FILES = new Set([
  "CLAUDE.md", "CHANGELOG.md", "LICENSE.md", "LICENSE",
  "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "SECURITY.md",
]);

const TYPE_PLURAL: Record<FileType, string> = {
  product: "",
  persona: "personas",
  journey: "journeys",
  spec: "specs",
  decision: "decisions",
  domain: "domain",
};

// ─── Classification patterns ─────────────────────────────────────────────────

interface ClassificationRule {
  type: FileType;
  dirs: RegExp;
  files: RegExp;
  fmKeys: string[];
  contentPatterns: RegExp[];
}

const RULES: ClassificationRule[] = [
  {
    type: "persona",
    dirs: /^(personas?|users?|user-research)$/i,
    files: /^(persona-.*|.*-persona)\.md$/i,
    fmKeys: ["role", "primary_goal", "jobs_to_be_done", "biggest_fear"],
    contentPatterns: [
      /primary goal/i, /jobs to be done/i, /anti[- ]?patterns?/i, /tech level/i,
    ],
  },
  {
    type: "journey",
    dirs: /^(journeys?|user-journeys?|flows?)$/i,
    files: /^(journey-.*|.*-journey|.*-flow)\.md$/i,
    fmKeys: ["trigger", "success_state", "steps", "failure_modes"],
    contentPatterns: [
      /user journey/i, /\btrigger\b/i, /success state/i, /failure mode/i,
    ],
  },
  {
    type: "spec",
    dirs: /^(specs?|specifications?|features?|requirements?)$/i,
    files: /^(spec-.*|.*-spec|feature-.*|.*-feature|.*-requirement)\.md$/i,
    fmKeys: ["acceptance_criteria", "out_of_scope", "design_ref"],
    contentPatterns: [
      /acceptance criteria/i, /out of scope/i, /\brequirement\b/i,
    ],
  },
  {
    type: "decision",
    dirs: /^(decisions?|adrs?|architecture-decisions?)$/i,
    files: /^(adr-.*|.*-adr|decision-.*)\.md$/i,
    fmKeys: ["context", "decision", "consequences"],
    contentPatterns: [
      /architecture decision/i, /alternatives rejected/i, /\bconsequences?\b/i,
    ],
  },
  {
    type: "domain",
    dirs: /^(domain|rules?|business-rules?|policies?)$/i,
    files: /^(rules-.*|.*-rules|policy-.*)\.md$/i,
    fmKeys: ["critical"],
    contentPatterns: [
      /business rule/i, /\binvariant\b/i, /must never/i, /must always/i,
    ],
  },
  {
    type: "product",
    dirs: /(?!)/,  // never matches on dir alone
    files: /^(product|product-brief.*|product-overview.*)\.md$/i,
    fmKeys: ["tagline", "problem", "solution", "tech_stack", "primary_persona"],
    contentPatterns: [
      /north star/i, /\bvision\b/i, /what this product is/i,
    ],
  },
];

// ─── 1a. scanRepo — find all .md files ───────────────────────────────────────

export async function scanRepo(rootDir: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(fullPath);
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        if (SKIP_FILES.has(entry.name)) continue;
        results.push({
          path: fullPath,
          relativePath: relative(rootDir, fullPath),
        });
      }
    }
  }

  await walk(rootDir);
  return results;
}

// ─── 1b. classifyFile — heuristic classification ─────────────────────────────

export function classifyFile(
  filePath: string,
  fm: Record<string, unknown>,
  body: string,
): ClassificationResult | null {
  const fileName = basename(filePath);
  const dirName = basename(dirname(filePath));
  const fmKeys = Object.keys(fm);

  let bestType: FileType | null = null;
  let bestScore = 0;

  for (const rule of RULES) {
    let score = 0;

    // Directory name match (high weight: 0.4)
    if (rule.dirs.test(dirName)) {
      score += 0.4;
    }

    // Filename match (medium weight: 0.25)
    if (rule.files.test(fileName)) {
      score += 0.25;
    }

    // Frontmatter keys match (high weight: up to 0.4)
    const fmMatches = rule.fmKeys.filter((k) => fmKeys.includes(k)).length;
    if (rule.fmKeys.length > 0 && fmMatches > 0) {
      // Need at least 2 fm key matches for decision type to avoid false positives
      // (many files have a generic "context" or "decision" key)
      const minMatches = rule.type === "decision" ? 2 : 1;
      if (fmMatches >= minMatches) {
        score += 0.4 * (fmMatches / rule.fmKeys.length);
      }
    }

    // Content keyword match (low weight: up to 0.15)
    const contentMatches = rule.contentPatterns.filter((p) => p.test(body)).length;
    if (contentMatches > 0) {
      score += 0.15 * (contentMatches / rule.contentPatterns.length);
    }

    if (score > bestScore) {
      bestScore = score;
      bestType = rule.type;
    }
  }

  // Minimum threshold to classify
  if (bestType === null || bestScore < 0.25) return null;

  return { type: bestType, confidence: Math.min(bestScore, 1) };
}

// ─── 1c. transformFile — generate PCL frontmatter ────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractFirstHeading(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export function transformFile(
  filePath: string,
  fm: Record<string, unknown>,
  body: string,
  type: FileType,
  mtime: Date,
): TransformResult {
  const fileName = basename(filePath, ".md");
  const slug = slugify(fileName);
  const heading = extractFirstHeading(body);

  const newFm: Record<string, unknown> = { ...fm };

  switch (type) {
    case "persona":
      newFm.id ??= slug;
      newFm.name ??= fm.title ?? heading ?? fileName;
      newFm.role ??= "";
      newFm.primary_goal ??= "";
      newFm.jobs_to_be_done ??= [];
      newFm.anti_patterns ??= [];
      newFm.channels ??= [];
      break;

    case "journey":
      newFm.id ??= slug;
      newFm.name ??= fm.title ?? heading ?? fileName;
      newFm.persona ??= "";
      newFm.trigger ??= "";
      newFm.success_state ??= "";
      newFm.failure_modes ??= [];
      newFm.steps ??= [];
      break;

    case "spec":
      newFm.id ??= slug;
      newFm.title ??= fm.name ?? heading ?? fileName;
      newFm.status ??= "draft";
      newFm.acceptance_criteria ??= [];
      newFm.out_of_scope ??= [];
      break;

    case "decision":
      newFm.id ??= slug;
      newFm.title ??= fm.name ?? heading ?? fileName;
      newFm.status ??= "accepted";
      newFm.date ??= mtime.toISOString().slice(0, 10);
      newFm.context ??= "";
      newFm.decision ??= "";
      newFm.consequences ??= [];
      newFm.alternatives_rejected ??= [];
      break;

    case "domain":
      newFm.id ??= slug;
      newFm.critical ??= false;
      newFm.title ??= fm.name ?? heading ?? fileName;
      break;

    case "product":
      newFm.name ??= fm.title ?? heading ?? fileName;
      newFm.tagline ??= "";
      newFm.problem ??= "";
      newFm.solution ??= "";
      newFm.primary_persona ??= "";
      newFm.tech_stack ??= [];
      newFm.stage ??= "prototype";
      break;
  }

  // Determine target path
  const subDir = TYPE_PLURAL[type];
  const targetPath = subDir
    ? join(subDir, `${slug}.md`)
    : "product.md";

  return { frontmatter: newFm, body, targetPath };
}

// ─── 1d. runScan — orchestrate ───────────────────────────────────────────────

export async function runScan(
  rootDir: string,
  productDir: string,
): Promise<ScanSummary> {
  const summary: ScanSummary = {
    imported: [],
    skipped: [],
    unclassified: [],
  };

  console.log(`Scanning ${rootDir}...`);
  const files = await scanRepo(rootDir);
  console.log(`Found ${files.length} markdown file${files.length === 1 ? "" : "s"}\n`);

  if (files.length === 0) return summary;

  console.log("Classified:");

  for (const file of files) {
    const raw = await readFile(file.path, "utf8");
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;

    const classification = classifyFile(file.path, fm, parsed.content);
    if (!classification) {
      summary.unclassified.push(file.relativePath);
      continue;
    }

    const { type, confidence } = classification;
    const fileStat = await stat(file.path);
    const transformed = transformFile(
      file.path, fm, parsed.content, type, fileStat.mtime,
    );

    const destPath = join(productDir, transformed.targetPath);
    const destRelative = relative(rootDir, destPath);

    // Check if target already exists
    try {
      await access(destPath, constants.F_OK);
      console.log(`  ↷ ${destRelative} already exists, skipped`);
      summary.skipped.push({
        sourcePath: file.relativePath,
        targetPath: transformed.targetPath,
        type,
        confidence,
      });
      continue;
    } catch {
      // File doesn't exist — proceed
    }

    // Ensure target directory exists
    await mkdir(dirname(destPath), { recursive: true });

    // Write the transformed file
    const output = matter.stringify(transformed.body, transformed.frontmatter);
    await writeFile(destPath, output, "utf8");

    console.log(
      `  ✓ ${file.relativePath} → ${destRelative} [${type}, confidence: ${confidence.toFixed(2)}]`,
    );
    summary.imported.push({
      sourcePath: file.relativePath,
      targetPath: transformed.targetPath,
      type,
      confidence,
    });
  }

  // Print unclassified
  if (summary.unclassified.length > 0) {
    console.log("\nSkipped (not classifiable):");
    for (const path of summary.unclassified) {
      console.log(`  · ${path}`);
    }
  }

  const skipCount = summary.skipped.length;
  console.log(
    `\nSummary: ${summary.imported.length} imported, ` +
    `${skipCount} skipped (exists), ` +
    `${summary.unclassified.length} unclassified`,
  );

  return summary;
}
