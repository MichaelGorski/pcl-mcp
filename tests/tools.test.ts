import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDB, createTestFile, type TestHarness } from "./helpers/test-harness.js";
import { fullIndex } from "../src/indexer.js";
import { handleTool, renderFile, type ToolName } from "../src/tools.js";

// Single populated harness — corpus indexed with embeddings
// NOTE: DB is a singleton, so we can only have one open at a time.
// "Empty DB" tests create/destroy their own harness inline.
let populated: TestHarness;

beforeAll(async () => {
  populated = await createTestDB({ copyCorpus: true });
  await fullIndex(populated.db, populated.productDir);
}, 120_000);

afterAll(async () => {
  await populated?.cleanup();
});

// ─── renderFile ────────────────────────────────────────────────────────────────

describe("renderFile", () => {
  const file = createTestFile({
    id: "test-render",
    type: "persona",
    title: "Render Test",
    path: "/tmp/test/personas/test-render.md",
    frontmatter: { id: "test-render", name: "Render Test", role: "QA" },
    body: "  \nBody content here.\n  ",
  });

  it("includes type in uppercase header", () => {
    const output = renderFile(file);
    expect(output).toContain("[PERSONA]");
  });

  it("includes title and id in header", () => {
    const output = renderFile(file);
    expect(output).toContain("Render Test");
    expect(output).toContain("(id: test-render)");
  });

  it("includes path as HTML comment", () => {
    const output = renderFile(file);
    expect(output).toContain("<!-- path: /tmp/test/personas/test-render.md -->");
  });

  it("includes frontmatter as JSON in yaml code fence", () => {
    const output = renderFile(file);
    expect(output).toContain("```yaml");
    expect(output).toContain("```");
    expect(output).toContain('"role": "QA"');
  });

  it("includes trimmed body", () => {
    const output = renderFile(file);
    expect(output).toContain("Body content here.");
    // Body should be trimmed — no leading/trailing whitespace
    const bodyLine = output.split("\n").at(-1);
    expect(bodyLine).toBe("Body content here.");
  });
});

// ─── handleTool ────────────────────────────────────────────────────────────────

describe("handleTool", () => {
  // ── pcl_product_summary ──────────────────────────────────────────────────

  describe("pcl_product_summary", () => {
    it("returns rendered product when indexed", async () => {
      const result = await handleTool("pcl_product_summary", {}, populated.db);
      expect(result).toContain("[PRODUCT]");
      expect(result).toContain("TaskPilot");
    });

    it("returns warning when no product.md exists", async () => {
      // Create a temporary empty DB for this test
      const emptyHarness = await createTestDB();
      try {
        const result = await handleTool("pcl_product_summary", {}, emptyHarness.db);
        expect(result).toMatch(/^⚠/);
      } finally {
        await emptyHarness.cleanup();
        // Reopen the populated DB since cleanup closed the singleton
        populated = await createTestDB({ copyCorpus: true });
        await fullIndex(populated.db, populated.productDir);
      }
    });
  });

  // ── pcl_get_persona ──────────────────────────────────────────────────────

  describe("pcl_get_persona", () => {
    it("returns persona for valid id", async () => {
      const result = await handleTool("pcl_get_persona", { id: "sarah-pm" }, populated.db);
      expect(result).toContain("[PERSONA]");
      expect(result).toContain("Sarah Chen");
    });

    it("returns warning for invalid id", async () => {
      const result = await handleTool("pcl_get_persona", { id: "no-such-persona" }, populated.db);
      expect(result).toMatch(/^⚠/);
    });

    it("guidance suggests pcl_list", async () => {
      const result = await handleTool("pcl_get_persona", { id: "no-such-persona" }, populated.db);
      expect(result).toContain("pcl_list");
    });
  });

  // ── pcl_get_journey ──────────────────────────────────────────────────────

  describe("pcl_get_journey", () => {
    it("returns journey for valid id", async () => {
      const result = await handleTool("pcl_get_journey", { id: "onboarding" }, populated.db);
      expect(result).toContain("[JOURNEY]");
      expect(result).toContain("Onboarding");
    });

    it("returns warning for invalid id", async () => {
      const result = await handleTool("pcl_get_journey", { id: "no-such-journey" }, populated.db);
      expect(result).toMatch(/^⚠/);
    });
  });

  // ── pcl_get_spec ─────────────────────────────────────────────────────────

  describe("pcl_get_spec", () => {
    it("returns spec for valid id", async () => {
      const result = await handleTool("pcl_get_spec", { id: "dashboard" }, populated.db);
      expect(result).toContain("[SPEC]");
      expect(result).toContain("Dashboard");
    });

    it("returns warning for invalid id", async () => {
      const result = await handleTool("pcl_get_spec", { id: "no-such-spec" }, populated.db);
      expect(result).toMatch(/^⚠/);
    });
  });

  // ── pcl_get_decision ─────────────────────────────────────────────────────

  describe("pcl_get_decision", () => {
    it("returns decision for valid id", async () => {
      const result = await handleTool("pcl_get_decision", { id: "adr-001-nextjs" }, populated.db);
      expect(result).toContain("[DECISION]");
      expect(result).toContain("Next.js");
    });

    it("returns warning for invalid id", async () => {
      const result = await handleTool("pcl_get_decision", { id: "no-such-decision" }, populated.db);
      expect(result).toMatch(/^⚠/);
    });
  });

  // ── pcl_get_domain ───────────────────────────────────────────────────────

  describe("pcl_get_domain", () => {
    it("returns domain file for valid id", async () => {
      const result = await handleTool("pcl_get_domain", { id: "billing-rules" }, populated.db);
      expect(result).toContain("[DOMAIN]");
      expect(result).toContain("Billing");
    });

    it("returns all critical files for '*critical'", async () => {
      const result = await handleTool("pcl_get_domain", { id: "*critical" }, populated.db);
      expect(result).toContain("billing-rules");
      expect(result).toContain("data-governance");
    });

    it("critical response contains separators between files", async () => {
      const result = await handleTool("pcl_get_domain", { id: "*critical" }, populated.db);
      expect(result).toContain("---");
    });

    it("returns warning for invalid domain id", async () => {
      const result = await handleTool("pcl_get_domain", { id: "no-such-domain" }, populated.db);
      expect(result).toMatch(/^⚠/);
    });
  });

  // ── pcl_list ─────────────────────────────────────────────────────────────

  describe("pcl_list", () => {
    it("returns list of personas with count", async () => {
      const result = await handleTool("pcl_list", { type: "personas" }, populated.db);
      expect(result).toContain("personas");
      expect(result).toMatch(/\d+ total/);
      expect(result).toContain("sarah-pm");
    });

    it("returns list of specs with status badges", async () => {
      const result = await handleTool("pcl_list", { type: "specs" }, populated.db);
      // Specs have status in frontmatter, rendered as badges like [approved]
      expect(result).toMatch(/\[.+\]/);
    });

    it("maps plural 'personas' to singular 'persona'", async () => {
      // If mapping works, it should return persona files, not an error
      const result = await handleTool("pcl_list", { type: "personas" }, populated.db);
      expect(result).not.toMatch(/^⚠/);
      expect(result).toContain("sarah-pm");
    });

    it("returns 'no files' for empty type", async () => {
      const emptyHarness = await createTestDB();
      try {
        const result = await handleTool("pcl_list", { type: "personas" }, emptyHarness.db);
        expect(result).toContain("No personas defined yet");
      } finally {
        await emptyHarness.cleanup();
        populated = await createTestDB({ copyCorpus: true });
        await fullIndex(populated.db, populated.productDir);
      }
    });

    it("returns warning for unknown type", async () => {
      const result = await handleTool("pcl_list", { type: "widgets" }, populated.db);
      expect(result).toMatch(/^⚠/);
    });

    it("includes [CRITICAL] flag on critical domain files", async () => {
      const result = await handleTool("pcl_list", { type: "domain" }, populated.db);
      expect(result).toContain("[CRITICAL]");
    });
  });

  // ── pcl_search ───────────────────────────────────────────────────────────

  describe("pcl_search", () => {
    it("returns scored results for valid query", async () => {
      const result = await handleTool("pcl_search", { query: "project management" }, populated.db);
      expect(result).toContain("Search results");
      expect(result).toMatch(/score: \d+\.\d+/);
    });

    it("returns 'no results' for unmatched query", async () => {
      const result = await handleTool(
        "pcl_search",
        { query: "xyzzyplughnotaword", mode: "keyword" },
        populated.db,
      );
      expect(result).toContain("No results found");
    });

    it("respects mode parameter", async () => {
      // Keyword mode should work without error
      const result = await handleTool(
        "pcl_search",
        { query: "billing", mode: "keyword" },
        populated.db,
      );
      expect(result).toContain("Search results");
    });

    it("respects top_k parameter", async () => {
      const result = await handleTool(
        "pcl_search",
        { query: "project", top_k: 1 },
        populated.db,
      );
      // Should contain at least 1 result (cross-reference resolution may add extras)
      expect(result).toContain("1.");
    });
  });

  // ── pcl_related ──────────────────────────────────────────────────────────

  describe("pcl_related", () => {
    it("returns related files for valid id", async () => {
      const result = await handleTool("pcl_related", { id: "sarah-pm" }, populated.db);
      expect(result).toContain("Files related to");
      expect(result).toMatch(/similarity: \d+\.\d+/);
    });

    it("returns guidance for unknown id", async () => {
      const result = await handleTool("pcl_related", { id: "does-not-exist" }, populated.db);
      expect(result).toContain("No related files found");
    });
  });

  // ── unknown tool ─────────────────────────────────────────────────────────

  describe("unknown tool", () => {
    it("returns warning for unrecognized tool name", async () => {
      const result = await handleTool("pcl_not_a_tool" as ToolName, {}, populated.db);
      expect(result).toMatch(/^⚠/);
    });
  });
});
