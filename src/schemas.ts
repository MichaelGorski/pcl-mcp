// src/schemas.ts
// Zod schemas for every file type.
// These are the contracts — agents rely on predictable structure.

import { z } from "zod";
import type { FileType } from "./types.js";

// ─── Shared ───────────────────────────────────────────────────────────────────

const StringList = z.array(z.string()).default([]);
const OptStr = z.string().optional();

// ─── product.md ───────────────────────────────────────────────────────────────

export const ProductSchema = z.object({
  name:             z.string(),
  tagline:          z.string(),
  problem:          z.string(),
  solution:         z.string(),
  primary_persona:  z.string(),
  tech_stack:       StringList,
  stage:            z.enum(["idea", "prototype", "early_revenue", "growth", "mature"]),
  repo:             OptStr,
  url:              OptStr,
});

// ─── personas/*.md ────────────────────────────────────────────────────────────

export const PersonaSchema = z.object({
  id:               z.string(),
  name:             z.string(),
  role:             z.string(),
  age_range:        OptStr,
  tech_level:       z.enum(["low", "medium", "high"]).optional(),
  primary_goal:     z.string(),
  biggest_fear:     OptStr,
  jobs_to_be_done:  StringList,
  anti_patterns:    StringList,
  channels:         StringList,   // where they hang out
});

// ─── journeys/*.md ────────────────────────────────────────────────────────────

export const JourneyStepSchema = z.object({
  id:   z.string(),
  goal: OptStr,
}).passthrough();  // allow extra step-level keys

export const JourneySchema = z.object({
  id:            z.string(),
  name:          z.string().optional(),
  persona:       z.string(),
  trigger:       z.string(),
  success_state: z.string(),
  failure_modes: StringList,
  steps:         z.array(z.string()),   // ordered list of step IDs
});

// ─── specs/*.md ───────────────────────────────────────────────────────────────

export const SpecSchema = z.object({
  id:                  z.string(),
  title:               z.string(),
  persona:             z.string().optional(),
  journey:             z.string().optional(),  // links to journey ID
  status:              z.enum(["draft", "approved", "in-progress", "done", "deprecated"]),
  acceptance_criteria: StringList,
  out_of_scope:        StringList,
  design_ref:          OptStr,  // Figma URL or local path
});

// ─── decisions/*.md ───────────────────────────────────────────────────────────

export const DecisionSchema = z.object({
  id:                  z.string(),
  title:               z.string(),
  status:              z.enum(["proposed", "accepted", "deprecated", "superseded"]),
  date:                z.string(),                    // ISO date string
  context:             z.string(),
  decision:            z.string(),
  consequences:        StringList,
  alternatives_rejected: StringList,
  superseded_by:       OptStr,
});

// ─── domain/*.md ──────────────────────────────────────────────────────────────

export const DomainSchema = z.object({
  id:       z.string(),
  critical: z.boolean().default(false),  // if true, always loaded at session start
  title:    z.string().optional(),
});

// ─── Schema registry ──────────────────────────────────────────────────────────

export const SCHEMAS: Record<FileType, z.ZodObject<z.ZodRawShape>> = {
  product:  ProductSchema,
  persona:  PersonaSchema,
  journey:  JourneySchema,
  spec:     SpecSchema,
  decision: DecisionSchema,
  domain:   DomainSchema,
};

export function validateFrontmatter(
  type: FileType,
  data: unknown
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const schema = SCHEMAS[type];
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data as Record<string, unknown> };
  return {
    success: false,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  };
}

// Derive a display title from frontmatter
export function deriveTitle(type: FileType, fm: Record<string, unknown>): string {
  if (type === "product")  return String(fm.name  ?? "Untitled product");
  if (type === "persona")  return String(fm.name  ?? fm.id ?? "Unnamed persona");
  if (type === "journey")  return String(fm.name  ?? fm.id ?? "Unnamed journey");
  if (type === "spec")     return String(fm.title ?? fm.id ?? "Unnamed spec");
  if (type === "decision") return String(fm.title ?? fm.id ?? "Unnamed decision");
  if (type === "domain")   return String(fm.title ?? fm.id ?? "Domain rules");
  return "Unknown";
}
