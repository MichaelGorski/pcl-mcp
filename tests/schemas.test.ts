import { describe, it, expect } from "vitest";
import {
  validateFrontmatter,
  deriveTitle,
  ProductSchema,
  PersonaSchema,
  JourneySchema,
  SpecSchema,
  DecisionSchema,
  DomainSchema,
} from "../src/schemas.js";
import type { FileType } from "../src/types.js";

// ─── Minimal valid frontmatter fixtures ─────────────────────────────────────

function validProduct(overrides: Record<string, unknown> = {}) {
  return {
    name: "Acme Widget",
    tagline: "Widgets for everyone",
    problem: "No good widgets exist",
    solution: "Build great widgets",
    primary_persona: "dev-dan",
    tech_stack: ["TypeScript", "Node.js"],
    stage: "prototype",
    ...overrides,
  };
}

function validPersona(overrides: Record<string, unknown> = {}) {
  return {
    id: "dev-dan",
    name: "Developer Dan",
    role: "Full-stack developer",
    primary_goal: "Ship features fast",
    jobs_to_be_done: ["Write code", "Review PRs"],
    ...overrides,
  };
}

function validJourney(overrides: Record<string, unknown> = {}) {
  return {
    id: "onboarding",
    name: "First-time onboarding",
    persona: "dev-dan",
    trigger: "Signs up for the first time",
    success_state: "Completes onboarding wizard",
    failure_modes: ["Abandons at step 2"],
    steps: ["sign-up", "configure", "deploy"],
    ...overrides,
  };
}

function validSpec(overrides: Record<string, unknown> = {}) {
  return {
    id: "spec-001",
    title: "Widget creation flow",
    persona: "dev-dan",
    journey: "onboarding",
    status: "draft",
    acceptance_criteria: ["User can create widget"],
    out_of_scope: ["Admin panel"],
    ...overrides,
  };
}

function validDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: "adr-001",
    title: "Use SQLite for local storage",
    status: "accepted",
    date: "2026-01-15",
    context: "Need local persistence without external DB",
    decision: "Use better-sqlite3 with WAL mode",
    consequences: ["Fast reads", "Single-writer limitation"],
    alternatives_rejected: ["PostgreSQL", "LevelDB"],
    ...overrides,
  };
}

function validDomain(overrides: Record<string, unknown> = {}) {
  return {
    id: "naming-conventions",
    critical: false,
    title: "Naming conventions",
    ...overrides,
  };
}

// ─── validateFrontmatter ────────────────────────────────────────────────────

describe("validateFrontmatter", () => {
  describe("ProductSchema", () => {
    it("accepts valid product with all required fields", () => {
      const result = validateFrontmatter("product", validProduct());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Acme Widget");
        expect(result.data.stage).toBe("prototype");
      }
    });

    it("rejects missing name field", () => {
      const { name, ...rest } = validProduct();
      const result = validateFrontmatter("product", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("name");
      }
    });

    it("rejects invalid stage enum", () => {
      const result = validateFrontmatter("product", validProduct({ stage: "beta" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("stage");
      }
    });

    it("defaults tech_stack to empty array when missing", () => {
      const { tech_stack, ...rest } = validProduct();
      const result = validateFrontmatter("product", rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tech_stack).toEqual([]);
      }
    });

    it("accepts optional repo and url fields", () => {
      const result = validateFrontmatter(
        "product",
        validProduct({ repo: "https://github.com/example/repo", url: "https://example.com" }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repo).toBe("https://github.com/example/repo");
        expect(result.data.url).toBe("https://example.com");
      }
    });
  });

  describe("PersonaSchema", () => {
    it("accepts valid persona with required fields", () => {
      const result = validateFrontmatter("persona", validPersona());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("dev-dan");
        expect(result.data.name).toBe("Developer Dan");
      }
    });

    it("rejects missing id", () => {
      const { id, ...rest } = validPersona();
      const result = validateFrontmatter("persona", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("id");
      }
    });

    it("rejects missing primary_goal", () => {
      const { primary_goal, ...rest } = validPersona();
      const result = validateFrontmatter("persona", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("primary_goal");
      }
    });

    it("defaults jobs_to_be_done to empty array", () => {
      const { jobs_to_be_done, ...rest } = validPersona();
      const result = validateFrontmatter("persona", rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.jobs_to_be_done).toEqual([]);
      }
    });

    it("accepts optional tech_level with valid enum", () => {
      const result = validateFrontmatter("persona", validPersona({ tech_level: "high" }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tech_level).toBe("high");
      }
    });

    it("rejects invalid tech_level enum", () => {
      const result = validateFrontmatter("persona", validPersona({ tech_level: "expert" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("tech_level");
      }
    });
  });

  describe("JourneySchema", () => {
    it("accepts valid journey", () => {
      const result = validateFrontmatter("journey", validJourney());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("onboarding");
        expect(result.data.persona).toBe("dev-dan");
      }
    });

    it("rejects missing persona field", () => {
      const { persona, ...rest } = validJourney();
      const result = validateFrontmatter("journey", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("persona");
      }
    });

    it("rejects missing trigger", () => {
      const { trigger, ...rest } = validJourney();
      const result = validateFrontmatter("journey", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("trigger");
      }
    });

    it("defaults failure_modes to empty array", () => {
      const { failure_modes, ...rest } = validJourney();
      const result = validateFrontmatter("journey", rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.failure_modes).toEqual([]);
      }
    });

    it("accepts steps as array of strings", () => {
      const result = validateFrontmatter("journey", validJourney());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.steps).toEqual(["sign-up", "configure", "deploy"]);
      }
    });
  });

  describe("SpecSchema", () => {
    it("accepts valid spec", () => {
      const result = validateFrontmatter("spec", validSpec());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Widget creation flow");
        expect(result.data.status).toBe("draft");
      }
    });

    it("rejects missing title", () => {
      const { title, ...rest } = validSpec();
      const result = validateFrontmatter("spec", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("title");
      }
    });

    it("validates status enum", () => {
      for (const status of ["draft", "approved", "in-progress", "done", "deprecated"]) {
        const result = validateFrontmatter("spec", validSpec({ status }));
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid status", () => {
      const result = validateFrontmatter("spec", validSpec({ status: "cancelled" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("status");
      }
    });

    it("defaults acceptance_criteria to empty array", () => {
      const { acceptance_criteria, ...rest } = validSpec();
      const result = validateFrontmatter("spec", rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.acceptance_criteria).toEqual([]);
      }
    });
  });

  describe("DecisionSchema", () => {
    it("accepts valid decision", () => {
      const result = validateFrontmatter("decision", validDecision());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Use SQLite for local storage");
        expect(result.data.date).toBe("2026-01-15");
      }
    });

    it("rejects missing date", () => {
      const { date, ...rest } = validDecision();
      const result = validateFrontmatter("decision", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("date");
      }
    });

    it("rejects missing context", () => {
      const { context, ...rest } = validDecision();
      const result = validateFrontmatter("decision", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("context");
      }
    });

    it("rejects missing decision field", () => {
      const { decision, ...rest } = validDecision();
      const result = validateFrontmatter("decision", rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("decision");
      }
    });

    it("defaults consequences to empty array", () => {
      const { consequences, ...rest } = validDecision();
      const result = validateFrontmatter("decision", rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.consequences).toEqual([]);
      }
    });
  });

  describe("DomainSchema", () => {
    it("accepts valid domain", () => {
      const result = validateFrontmatter("domain", validDomain());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("naming-conventions");
      }
    });

    it("defaults critical to false", () => {
      const { critical, ...rest } = validDomain();
      const result = validateFrontmatter("domain", rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.critical).toBe(false);
      }
    });

    it("accepts critical: true", () => {
      const result = validateFrontmatter("domain", validDomain({ critical: true }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.critical).toBe(true);
      }
    });

    it("accepts optional title", () => {
      const { title, ...rest } = validDomain();
      const result = validateFrontmatter("domain", rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBeUndefined();
      }
    });
  });

  describe("error format", () => {
    it("error string includes field path", () => {
      const result = validateFrontmatter("product", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("name");
      }
    });

    it("error string includes validation message", () => {
      const result = validateFrontmatter("product", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod messages like "Required" appear after the field path
        expect(result.error).toMatch(/:\s*.+/);
      }
    });

    it("multiple errors are joined with semicolon", () => {
      // Missing all required fields should produce multiple errors joined by "; "
      const result = validateFrontmatter("product", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("; ");
      }
    });
  });
});

// ─── deriveTitle ─────────────────────────────────────────────────────────────

describe("deriveTitle", () => {
  it("returns fm.name for product type", () => {
    expect(deriveTitle("product", { name: "Acme Widget" })).toBe("Acme Widget");
  });

  it("returns 'Untitled product' when product has no name", () => {
    expect(deriveTitle("product", {})).toBe("Untitled product");
  });

  it("returns fm.name for persona", () => {
    expect(deriveTitle("persona", { name: "Dev Dan", id: "dev-dan" })).toBe("Dev Dan");
  });

  it("falls back to fm.id when persona has no name", () => {
    expect(deriveTitle("persona", { id: "dev-dan" })).toBe("dev-dan");
  });

  it("returns 'Unnamed persona' when no name or id", () => {
    expect(deriveTitle("persona", {})).toBe("Unnamed persona");
  });

  it("returns fm.title for spec", () => {
    expect(deriveTitle("spec", { title: "Widget spec" })).toBe("Widget spec");
  });

  it("returns fm.title for decision", () => {
    expect(deriveTitle("decision", { title: "Use SQLite" })).toBe("Use SQLite");
  });

  it("returns fm.title for domain", () => {
    expect(deriveTitle("domain", { title: "Naming rules" })).toBe("Naming rules");
  });

  it("falls back to fm.id for domain without title", () => {
    expect(deriveTitle("domain", { id: "naming-conventions" })).toBe("naming-conventions");
  });

  it("returns 'Domain rules' when domain has no title or id", () => {
    expect(deriveTitle("domain", {})).toBe("Domain rules");
  });

  it("returns 'Unknown' for unrecognized type", () => {
    expect(deriveTitle("widget" as FileType, {})).toBe("Unknown");
  });
});
