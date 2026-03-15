#!/usr/bin/env node
// src/server.ts
// PCL MCP Server — stdio transport, compatible with Claude Code, Cursor, Windsurf.
//
// Usage:
//   Direct:     node dist/src/server.js --product-dir ./product
//   Via npx:    npx pcl-mcp serve
//
// Claude Code (.claude/mcp.json):
//   { "pcl": { "command": "node", "args": ["./node_modules/pcl-mcp/dist/src/server.js"] } }
//
// Cursor (settings.json):
//   "mcp.servers": { "pcl": { "command": "npx", "args": ["pcl-mcp", "serve"] } }

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { openDB, closeDB, getProductFile, getCritical, getFileById, listByType } from "./db.js";
import { fullIndex, startWatcher, backfillEmbeddings } from "./indexer.js";
import { handleTool, TOOL_SCHEMAS, renderFile, type ToolName } from "./tools.js";

import type { FileType } from "./types.js";

const require = createRequire(import.meta.url);
const { version } = (() => {
  try { return require("../package.json") as { version: string }; }
  catch { return require("../../package.json") as { version: string }; }
})();

// ─── Resolve product dir ───────────────────────────────────────────────────────

function resolveProductDir(): string {
  const argIdx = process.argv.indexOf("--product-dir");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return resolve(process.argv[argIdx + 1]!);
  }
  // Default: look for /product relative to CWD
  const candidates = [
    join(process.cwd(), "product"),
    join(process.cwd(), ".product"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to CWD/product even if it doesn't exist yet
  return join(process.cwd(), "product");
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main() {
  const productDir = resolveProductDir();
  const db = openDB(productDir);

  // Log to stderr only (stdout is reserved for MCP protocol)
  const log = (...args: unknown[]) => process.stderr.write(`[pcl] ${args.join(" ")}\n`);

  log(`Starting PCL MCP server`);
  log(`Product dir: ${productDir}`);

  // ─── Initial index (blocking — ensures data is ready before agents call tools)
  const result = await fullIndex(db, productDir, (done, total, _path) => {
    if (done % 5 === 0 || done === total) log(`Indexed ${done}/${total}`);
  });
  log(`Index complete: ${result.total} files, ${result.indexed} new/changed`);
  if (result.errors.length > 0) {
    log(`Schema errors:\n  ${result.errors.join("\n  ")}`);
  }
  if (result.total === 0) {
    log(`⚠ No product files found. Run 'pcl init' to scaffold the product folder.`);
  }

  // Backfill embeddings for files that failed embedding previously
  const backfilled = await backfillEmbeddings(db);
  if (backfilled > 0) log(`Backfilled ${backfilled} embeddings`);

  // Start file watcher for live updates
  const stopWatcher = await startWatcher(db, productDir, (event, path) => {
    log(`${event}: ${path}`);
  });

  // ─── MCP server ─────────────────────────────────────────────────────────────

  const server = new McpServer({
    name:    "pcl-mcp",
    version,
  });

  // ─── Tools ──────────────────────────────────────────────────────────────────

  for (const [name, def] of Object.entries(TOOL_SCHEMAS)) {
    const toolName = name as ToolName;

    server.tool(
      toolName,
      def.description,
      def.input.shape,
      async (input: Record<string, unknown>) => {
        try {
          const text = await handleTool(toolName, input as Record<string, unknown>, db);
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `PCL error: ${msg}` }],
            isError: true,
          };
        }
      }
    );
  }

  // ─── Resources ──────────────────────────────────────────────────────────────

  const fileTypes: FileType[] = ["product", "persona", "journey", "spec", "decision", "domain"];

  server.resource(
    "pcl-file",
    new ResourceTemplate("pcl://files/{type}/{id}", {
      list: async () => {
        const resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> = [];
        for (const ft of fileTypes) {
          const files = listByType(db, ft);
          for (const f of files) {
            resources.push({
              uri: `pcl://files/${f.type}/${f.id}`,
              name: f.title,
              description: f.summary.slice(0, 150),
              mimeType: "text/markdown",
            });
          }
        }
        return { resources };
      },
    }),
    { description: "Product context file by type and ID", mimeType: "text/markdown" },
    async (_uri, variables) => {
      const type = String(variables.type) as FileType;
      const id = String(variables.id);
      const file = getFileById(db, type, id);
      if (!file) {
        return { contents: [{ uri: `pcl://files/${type}/${id}`, text: `File not found: ${type}/${id}` }] };
      }
      return {
        contents: [{ uri: `pcl://files/${type}/${id}`, text: renderFile(file), mimeType: "text/markdown" }],
      };
    }
  );

  // ─── Prompts ────────────────────────────────────────────────────────────────

  server.prompt(
    "session-start",
    "Product summary + critical domain rules. Call at the start of every coding session to orient the agent.",
    async () => {
      const parts: string[] = [];

      const product = getProductFile(db);
      if (product) {
        parts.push("# Product Summary\n\n" + renderFile(product));
      } else {
        parts.push("# Product Summary\n\nNo product.md found. Run `pcl init` to scaffold the product folder.");
      }

      const critical = getCritical(db);
      if (critical.length > 0) {
        parts.push("\n\n---\n\n# Critical Domain Rules\n\n" + critical.map(renderFile).join("\n\n---\n\n"));
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: parts.join(""),
            },
          },
        ],
      };
    }
  );

  // ─── Connect ────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server connected and ready");

  // ─── Graceful shutdown ──────────────────────────────────────────────────────

  const shutdown = async () => {
    log("Shutting down...");
    await stopWatcher();
    await server.close();
    closeDB();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[pcl] Fatal: ${err}\n`);
  process.exit(1);
});
