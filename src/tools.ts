// src/tools.ts
// All 9 MCP tools with input validation, response formatting, and progressive disclosure.
//
// Design principle:
//   - pcl_product_summary + pcl_get_domain("*critical") are loaded at session start (~600 tokens)
//   - Everything else is on-demand — agents pull what they need
//   - Responses are formatted for maximum agent utility, not human readability

import { z } from "zod";
import type Database from "better-sqlite3";
import type { FileType } from "./types.js";
import {
  getProductFile, getFileById, listByType, getCritical,
} from "./db.js";
import { search, findRelated } from "./search.js";

// ─── Serialise a file to a string block for the agent ─────────────────────────

export function renderFile(file: {
  id: string; type: string; title: string; frontmatter: Record<string, unknown>;
  body: string; path: string;
}): string {
  const fm = JSON.stringify(file.frontmatter, null, 2);
  return [
    `# [${file.type.toUpperCase()}] ${file.title} (id: ${file.id})`,
    `<!-- path: ${file.path} -->`,
    "```yaml",
    fm,
    "```",
    "",
    file.body.trim(),
  ].join("\n");
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export type ToolName =
  | "pcl_product_summary"
  | "pcl_get_persona"
  | "pcl_get_journey"
  | "pcl_get_spec"
  | "pcl_get_decision"
  | "pcl_get_domain"
  | "pcl_list"
  | "pcl_search"
  | "pcl_related";

export const TOOL_SCHEMAS = {
  pcl_product_summary: {
    description: "Load the product north-star document. Call this at the start of every coding session.",
    input: z.object({}),
  },
  pcl_get_persona: {
    description: "Get a user persona by ID. Call before working on any user-facing feature.",
    input: z.object({
      id: z.string().describe("Persona ID (e.g. 'max')"),
    }),
  },
  pcl_get_journey: {
    description: "Get a user journey by ID including step-by-step detail.",
    input: z.object({
      id: z.string().describe("Journey ID (e.g. 'onboarding')"),
    }),
  },
  pcl_get_spec: {
    description: "Get a feature specification by ID including acceptance criteria.",
    input: z.object({
      id: z.string().describe("Spec ID"),
    }),
  },
  pcl_get_decision: {
    description: "Get an architecture decision record (ADR) by ID.",
    input: z.object({
      id: z.string().describe("Decision ID (e.g. 'adr-001')"),
    }),
  },
  pcl_get_domain: {
    description: [
      "Get domain/business rules by ID.",
      "Pass '*critical' to load ALL files marked critical: true.",
      "IMPORTANT: call pcl_get_domain('*critical') before touching any billing, auth, or data model code.",
    ].join(" "),
    input: z.object({
      id: z.string().describe("Domain file ID, or '*critical' for all critical rules"),
    }),
  },
  pcl_list: {
    description: "List all files of a given type with their IDs, titles, and a one-line summary.",
    input: z.object({
      type: z.enum(["personas", "journeys", "specs", "decisions", "domain"])
        .describe("File category to list"),
    }),
  },
  pcl_search: {
    description: [
      "Hybrid semantic + keyword search across all product files.",
      "Use when you don't know the exact ID but know the topic.",
      "Modes: 'hybrid' (default, best), 'semantic' (concept match), 'keyword' (exact terms).",
    ].join(" "),
    input: z.object({
      query: z.string().describe("Natural language or keyword query"),
      mode:  z.enum(["hybrid", "semantic", "keyword"]).default("hybrid").optional(),
      types: z.array(z.string()).optional()
        .describe("Filter to specific types: personas, journeys, specs, decisions, domain"),
      top_k: z.number().int().min(1).max(20).default(5).optional(),
    }),
  },
  pcl_related: {
    description: "Find files semantically related to a given file ID. Useful for discovering connections.",
    input: z.object({
      id:    z.string().describe("Source file ID"),
      top_k: z.number().int().min(1).max(10).default(5).optional(),
    }),
  },
} as const;

// ─── Tool handlers ────────────────────────────────────────────────────────────

export async function handleTool(
  name: ToolName,
  input: Record<string, unknown>,
  db: Database.Database
): Promise<string> {
  switch (name) {

    case "pcl_product_summary": {
      const file = getProductFile(db);
      if (!file) return "⚠ No product.md found. Run `pcl init` to scaffold the product folder.";
      return renderFile(file);
    }

    case "pcl_get_persona": {
      const { id } = input as { id: string };
      const file = getFileById(db, "persona", id);
      if (!file) return `⚠ Persona '${id}' not found. Use pcl_list({ type: 'personas' }) to see available personas.`;
      return renderFile(file);
    }

    case "pcl_get_journey": {
      const { id } = input as { id: string };
      const file = getFileById(db, "journey", id);
      if (!file) return `⚠ Journey '${id}' not found. Use pcl_list({ type: 'journeys' }) to see available journeys.`;
      return renderFile(file);
    }

    case "pcl_get_spec": {
      const { id } = input as { id: string };
      const file = getFileById(db, "spec", id);
      if (!file) return `⚠ Spec '${id}' not found. Use pcl_list({ type: 'specs' }) to see available specs.`;
      return renderFile(file);
    }

    case "pcl_get_decision": {
      const { id } = input as { id: string };
      const file = getFileById(db, "decision", id);
      if (!file) return `⚠ Decision '${id}' not found. Use pcl_list({ type: 'decisions' }) to see available decisions.`;
      return renderFile(file);
    }

    case "pcl_get_domain": {
      const { id } = input as { id: string };
      if (id === "*critical") {
        const files = getCritical(db);
        if (files.length === 0) return "No critical domain rules defined yet.";
        return files.map(renderFile).join("\n\n---\n\n");
      }
      const file = getFileById(db, "domain", id);
      if (!file) return `⚠ Domain file '${id}' not found. Use pcl_list({ type: 'domain' }) to see available domain files.`;
      return renderFile(file);
    }

    case "pcl_list": {
      const { type } = input as { type: string };
      // Map plural to singular type
      const typeMap: Record<string, FileType> = {
        personas:  "persona",
        journeys:  "journey",
        specs:     "spec",
        decisions: "decision",
        domain:    "domain",
      };
      const fileType = typeMap[type];
      if (!fileType) return `⚠ Unknown type '${type}'`;

      const files = listByType(db, fileType);
      if (files.length === 0) return `No ${type} defined yet. Add .md files to /product/${type}/.`;

      const lines = files.map(f => {
        const criticalFlag = f.critical ? " [CRITICAL]" : "";
        const status = (f.frontmatter.status as string | undefined) ?? "";
        const statusBadge = status ? ` [${status}]` : "";
        return `• **${f.id}**${criticalFlag}${statusBadge} — ${f.title}\n  ${f.summary.slice(0, 120)}`;
      });

      return `## ${type} (${files.length} total)\n\n${lines.join("\n\n")}`;
    }

    case "pcl_search": {
      const { query, mode, types, top_k } = input as {
        query: string; mode?: "hybrid" | "semantic" | "keyword";
        types?: string[]; top_k?: number;
      };

      const results = await search(db, query, {
        mode:  mode ?? "hybrid",
        topK:  top_k ?? 5,
        types: types ?? [],
      });

      if (results.length === 0) return `No results found for: "${query}"`;

      const lines = results.map((r, i) =>
        `${i + 1}. [${r.type.toUpperCase()}] **${r.title}** (id: \`${r.id}\`, score: ${r.score.toFixed(3)})\n   ${r.excerpt.slice(0, 150)}`
      );

      return `## Search results for: "${query}"\n\n${lines.join("\n\n")}`;
    }

    case "pcl_related": {
      const { id, top_k } = input as { id: string; top_k?: number };
      const results = await findRelated(db, id, top_k ?? 5);

      if (results.length === 0) return `No related files found for '${id}'. Make sure the file is indexed with embeddings.`;

      const lines = results.map((r, i) =>
        `${i + 1}. [${r.type.toUpperCase()}] **${r.title}** (id: \`${r.id}\`, similarity: ${r.score.toFixed(3)})\n   ${r.excerpt.slice(0, 150)}`
      );

      return `## Files related to '${id}'\n\n${lines.join("\n\n")}`;
    }

    default:
      return `⚠ Unknown tool: ${name}`;
  }
}
