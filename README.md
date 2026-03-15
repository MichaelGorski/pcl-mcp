# PCL — Product Context Layer

**Give AI coding agents persistent, structured knowledge of your product.**

Instead of re-explaining your personas, journeys, and architecture decisions every session, PCL serves them via MCP on demand. Any agent (Claude Code, Cursor, Windsurf) queries exactly what it needs, when it needs it.

## Quick Start

```bash
echo '@michaelgorski:registry=https://npm.pkg.github.com' >> .npmrc
npm install @michaelgorski/pcl-mcp
npx pcl init
# add MCP config (see Agent Configuration below), then start a new agent session
```

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

## Stack

| Layer | Technology | Why |
|---|---|---|
| Protocol | MCP (stdio) | Universal — works with every major agent |
| Storage | SQLite + FTS5 | Zero infra, git-friendly, offline |
| Keyword search | BM25 via FTS5 | Best-in-class for exact term matching |
| Semantic search | `all-MiniLM-L6-v2` (local) | 23MB, zero API cost, ~3ms/doc |
| Hybrid fusion | Reciprocal Rank Fusion (k=60) | Better than either alone, no tuning |
| Validation | Zod schemas | Agents rely on predictable frontmatter |
| File watching | Chokidar v4 | Live reindex on save |

## Prerequisites

- **Node.js >= 22** (required — PCL uses modern Node APIs)

## Install

PCL is published as `@michaelgorski/pcl-mcp` on GitHub Packages.

```
@michaelgorski:registry=https://npm.pkg.github.com
```

### 1. Install

```bash
npm install @michaelgorski/pcl-mcp
```

### 2. Scaffold the product folder

```bash
npx pcl init            # creates ./product with templates
```

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

## Agent configuration

### Claude Code — `.claude/mcp.json`
```json
{
  "mcpServers": {
    "pcl": {
      "command": "node",
      "args": ["./node_modules/@michaelgorski/pcl-mcp/dist/src/server.js"]
    }
  }
}
```

### Cursor — `settings.json`
```json
"mcp.servers": {
  "pcl": {
    "command": "npx",
    "args": ["@michaelgorski/pcl-mcp", "serve"]
  }
}
```

### Windsurf — MCP config
```json
{
  "mcpServers": {
    "pcl": {
      "command": "npx",
      "args": ["@michaelgorski/pcl-mcp", "serve"]
    }
  }
}
```

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

## Tools available to agents

| Tool | Params | Description |
|---|---|---|
| `pcl_product_summary` | — | Load the product north-star document. Call at session start. |
| `pcl_get_persona(id)` | `id`: persona ID | Get a user persona by ID. Call before any user-facing feature. |
| `pcl_get_journey(id)` | `id`: journey ID | Get a user journey by ID including step-by-step detail. |
| `pcl_get_spec(id)` | `id`: spec ID | Get a feature spec by ID including acceptance criteria. |
| `pcl_get_decision(id)` | `id`: decision ID | Get an architecture decision record (ADR) by ID. |
| `pcl_get_domain(id)` | `id`: domain ID or `"*critical"` | Get domain rules by ID. Pass `"*critical"` to load all critical rules. |
| `pcl_list({ type })` | `type`: `"personas"` \| `"journeys"` \| `"specs"` \| `"decisions"` \| `"domain"` | List all files of a given type with IDs, titles, and summaries. |
| `pcl_search({ query })` | `query`, `mode?` (`"hybrid"` \| `"semantic"` \| `"keyword"`), `types?`, `top_k?` | Hybrid semantic + keyword search across all product files. |
| `pcl_related(id)` | `id`: source file ID, `top_k?` | Find files semantically related to a given file ID. |

## Prompts & Resources

In addition to tools, PCL exposes MCP prompts and resources:

**Prompt: `session-start`** — Returns a product summary + all critical domain rules. Agents can call this at the start of every coding session to orient themselves without loading every file.

**Resources: `pcl://files/{type}/{id}`** — Each indexed file is available as an MCP resource. Agents can browse and read individual files directly via the resource URI (e.g., `pcl://files/persona/example-user`).

## How hybrid search works

```
query: "what does Max find frustrating about onboarding"

BM25 (FTS5):      [persona-max, journey-onboarding, spec-magic-link, ...]
                   ↓ ranked by term frequency + IDF

Cosine similarity: [journey-onboarding, persona-max, domain-core-rules, ...]
                   ↓ ranked by embedding dot product (MiniLM-L6-v2)

RRF fusion:        score(d) = Σ 1 / (60 + rank(d))
                   ↓ combines both rankings without weight tuning

Result:            1. journey-onboarding (0.94)
                   2. persona-max (0.87)
                   3. spec-onboarding-ux (0.71)
```

## Human workflow

The system is only as good as what you put in. Discipline:

- **Product decision made?** → Write a `decisions/` ADR (5 min)
- **New feature being planned?** → Write a `specs/` file first, then code
- **User research or feedback?** → Update persona `anti_patterns` or `jobs_to_be_done`
- **Business rule change?** → Update `domain/` first, then code
- **New user journey discovered?** → Add to `journeys/`

The agent does the rest.

## Gitignore

```gitignore
product/.pcl.db      # SQLite index — auto-regenerated
```

## License

MIT
