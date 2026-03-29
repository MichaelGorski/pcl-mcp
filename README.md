<div align="center">

# PCL — Product Context Layer

**Give AI coding agents persistent, structured knowledge of your product.**

[![npm version](https://img.shields.io/npm/v/pcl-mcp?color=brightgreen)](https://www.npmjs.com/package/pcl-mcp)
[![npm downloads](https://img.shields.io/npm/dm/pcl-mcp)](https://www.npmjs.com/package/pcl-mcp)
[![Node >=22](https://img.shields.io/badge/node-%3E%3D22-blue)](https://nodejs.org)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

```bash
npx pcl-mcp init
```

</div>

Instead of re-explaining your personas, journeys, and architecture decisions every session, PCL serves them via MCP on demand. Any agent (Claude Code, Cursor, Windsurf) queries exactly what it needs, when it needs it.

---

## Why PCL?

**Without PCL**, every coding session starts from scratch:
- Agents can't find your product docs unless you paste them into the prompt
- Context windows get bloated with irrelevant information
- You re-explain personas, business rules, and specs every single time
- No guardrails — agents make assumptions that violate your business rules

**With PCL**, agents load product knowledge on demand:
- Progressive disclosure — session start costs ~600 tokens (product summary + critical rules)
- Hybrid search (BM25 + semantic) finds the right context without you guiding it
- Live reindex on file save — edit a spec, agent sees it immediately
- Structured Zod schemas — agents get predictable, parseable frontmatter every time

### Concrete use case

You ask your agent: *"Build the checkout flow"*

**Without PCL:** You paste your billing rules doc, the persona file, the journey map, and the spec into the chat. 4,000 tokens before the agent writes a line of code. Next session, you do it again.

**With PCL:** The agent auto-loads critical billing rules at session start (~200 tokens). When it starts the checkout feature, it pulls the relevant persona, fetches the journey steps, and checks the spec's acceptance criteria — all on-demand, only what's needed. Every session, automatically.

---

## Quick Start

```bash
npm install pcl-mcp
npx pcl init            # prompts before adding example files, sets up CLAUDE.md
# add MCP config (see Agent Configuration below), then start a new agent session
```

---

## Stack

| Layer | Technology | Why |
|---|---|---|
| Protocol | MCP (stdio) | Universal — works with every major agent |
| Storage | SQLite + FTS5 | Zero infra, git-friendly, offline |
| Keyword search | BM25 via FTS5 (title-weighted 10×) | Best-in-class for exact terms, IDs, proper nouns |
| Semantic search | `all-mpnet-base-v2` (local, 768d) | Higher quality than MiniLM, zero API cost, ~3ms/doc |
| Embedding strategy | Split body + title embeddings | Separate semantic channels for body and title matching |
| Hybrid fusion | Adaptive RRF (corpus-size-aware k) | Better recall on both small and large corpora |
| Score filtering | 15% gap threshold | Prevents low-quality tail results from surfacing |
| Cross-references | Auto frontmatter link resolution | Pulls related files into results automatically |
| Validation | Zod schemas | Agents get predictable, parseable frontmatter |
| File watching | Chokidar v4 | Live reindex on save |

---

## Prerequisites

**Node.js >= 22** (required — PCL uses modern Node APIs)

---

## Install

```bash
npm install pcl-mcp
npx pcl init            # creates ./product with templates
```

Also available on GitHub Packages as `@michaelgorski/pcl-mcp`.

---

## Import existing docs

If you already have markdown documentation in your repo, PCL can scan, classify, and import it automatically:

```bash
npx pcl init --scan         # scan + import existing docs, then scaffold remaining templates
npx pcl init --scan-only    # scan + import only, skip template scaffolding
```

The scanner:
- Walks your repo for `.md` files (skips `node_modules`, `dist`, `.git`, etc.)
- Classifies each file by directory name, filename, frontmatter keys, and content patterns
- Transforms matching files into PCL format with proper frontmatter
- Copies them into the `product/` folder under the correct category
- Skips categories that already have imported files (no duplicate templates)

Supported classifications: **persona**, **journey**, **spec**, **decision**, **domain**, **product**

---

## Agent configuration

Works with any MCP-compatible agent. Configuration examples below.

### Claude Code — `.claude/mcp.json`
```json
{
  "mcpServers": {
    "pcl": {
      "command": "node",
      "args": ["./node_modules/pcl-mcp/dist/src/server.js"]
    }
  }
}
```

### Cursor — `settings.json`
```json
"mcp.servers": {
  "pcl": {
    "command": "npx",
    "args": ["pcl-mcp", "serve"]
  }
}
```

### Windsurf — MCP config
```json
{
  "mcpServers": {
    "pcl": {
      "command": "npx",
      "args": ["pcl-mcp", "serve"]
    }
  }
}
```

---

## File structure

```
/product
  product.md              ← north star doc (required)
  personas/
    001-max.md            ← one persona per file
  journeys/
    001-onboarding.md     ← one user journey per file
  specs/
    001-auth-flow.md      ← feature specs with acceptance criteria
  decisions/
    001-use-nextjs.md     ← architecture decision records (ADRs)
  domain/
    core-rules.md         ← business rules agents must never violate
  .pcl.db                 ← SQLite index (auto-generated, gitignore this)
```

---

## Tools available to agents

| Tool | Params | Description |
|---|---|---|
| `pcl_product_summary` | — | Load the product north-star document. Call at session start. |
| `pcl_get_persona` | `id` | Get a user persona by ID. Call before any user-facing feature. |
| `pcl_get_journey` | `id` | Get a user journey by ID including step-by-step detail. |
| `pcl_get_spec` | `id` | Get a feature spec by ID including acceptance criteria. |
| `pcl_get_decision` | `id` | Get an architecture decision record (ADR) by ID. |
| `pcl_get_domain` | `id` or `"*critical"` | Get domain rules by ID. Pass `"*critical"` to load all critical rules. |
| `pcl_list` | `type`: `"personas"` \| `"journeys"` \| `"specs"` \| `"decisions"` \| `"domain"` | List all files of a given type with IDs, titles, and summaries. |
| `pcl_search` | `query`, `mode?` (`"hybrid"` \| `"semantic"` \| `"keyword"`), `types?`, `top_k?` | Hybrid semantic + keyword search across all product files. |
| `pcl_related` | `id`, `top_k?` | Find files semantically related to a given file ID. |

---

## Prompts & Resources

In addition to tools, PCL exposes MCP prompts and resources:

**Prompt: `session-start`** — Returns a product summary + all critical domain rules. Agents can call this at the start of every coding session to orient themselves without loading every file.

**Resources: `pcl://files/{type}/{id}`** — Each indexed file is available as an MCP resource. Agents can browse and read individual files directly via the resource URI (e.g., `pcl://files/persona/example-user`).

---

## How hybrid search works

PCL runs three parallel retrieval signals and fuses them with Reciprocal Rank Fusion:

```
query: "what does Max find frustrating about onboarding"

BM25 (FTS5, title-weighted 10×):
  → persona-max, journey-onboarding, spec-magic-link
  ↓ ranked by bm25(title=10×, body=1×) — exact terms, IDs, proper nouns

Semantic — body embedding (all-mpnet-base-v2, 768d):
  → journey-onboarding, persona-max, domain-core-rules
  ↓ cosine similarity on full-text embedding

Semantic — title embedding (all-mpnet-base-v2, 768d):
  → persona-max, journey-onboarding, spec-onboarding-ux
  ↓ cosine similarity on title + summary embedding

Adaptive RRF (k = corpus_size / 10):
  score(d) = Σ 1 / (k + rank(d))   fused across all three lists

Score gap filter (15% threshold):
  Drops results below 0.15 × top_score — removes noise

Cross-reference resolution:
  journey-onboarding.frontmatter.persona = "max"
  → auto-includes persona-max even if it ranked outside top-k

Result:  1. journey-onboarding  (0.94)
         2. persona-max         (0.87)
         3. spec-onboarding-ux  (0.71)
```

**Why split embeddings?** Body and title carry different semantic signals. A query like *"checkout persona"* should match a persona file by title even if its body content is mostly demographic data. Indexing them separately gives the fusion step two distinct semantic channels rather than one diluted one.

**Why adaptive RRF k?** Fixed k=60 over-smooths rankings on small corpora (10–20 files). Corpus-aware k scales down on small collections to let strong matches separate from weak ones.

---

## Testing & Benchmarks

PCL ships with a full test suite and a multi-dimensional benchmark framework.

### Tests

```bash
npm test            # run all tests (vitest)
npm run test:watch  # watch mode
```

Six test suites cover the full stack:

| Suite | Coverage |
|---|---|
| `db.test.ts` | SQLite operations, FTS5 queries, embedding storage |
| `embeddings.test.ts` | Embedding generation, cache hits, dimension checks |
| `indexer.test.ts` | File discovery, schema extraction, change detection |
| `schemas.test.ts` | Zod frontmatter validation for all file types |
| `search.test.ts` | Hybrid search, RRF, multi-hop decomposition, cross-refs |
| `tools.test.ts` | MCP tool handlers, response formatting, error paths |

### Benchmarks

```bash
npm run bench           # all benchmarks
npm run bench:perf      # latency benchmarks (search + embedding speed)
npm run bench:quality   # search quality: Precision@k, Recall@k, NDCG, MRR
npm run bench:tokens    # token efficiency across search modes
npm run bench:ablation  # hybrid vs keyword-only vs semantic-only comparison
npm run bench:ai        # Claude-judged result quality (requires ANTHROPIC_API_KEY)
npm run bench:report    # generate markdown report from results
```

| Suite | Measures |
|---|---|
| Performance | Search + embedding latency (p50/p95) |
| Search quality | Precision@k, Recall@k, NDCG, MRR on labeled corpus |
| Token efficiency | Tokens consumed per query across search modes |
| Ablation | Quality delta: hybrid vs keyword-only vs semantic-only |
| AI quality | Claude-judged relevance score for top-k results |

---

## Human workflow

The system is only as good as what you put in. Discipline:

- **Product decision made?** → Write a `decisions/` ADR (5 min)
- **New feature being planned?** → Write a `specs/` file first, then code
- **User research or feedback?** → Update persona `anti_patterns` or `jobs_to_be_done`
- **Business rule change?** → Update `domain/` first, then code
- **New user journey discovered?** → Add to `journeys/`

The agent does the rest.

---

## Gitignore

```gitignore
product/.pcl.db      # SQLite index — auto-regenerated
```

---

## License

MIT
