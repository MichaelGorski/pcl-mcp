# PCL — Product Context Layer

**Give AI coding agents persistent, structured knowledge of your product.**

Instead of re-explaining your personas, journeys, and architecture decisions every session, PCL serves them via MCP on demand. Any agent (Claude Code, Cursor, Windsurf) queries exactly what it needs, when it needs it.

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

## Install

```bash
npm install pcl-mcp
npx pcl init            # scaffold /product folder
npm run serve           # start MCP server
```

## Agent configuration

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

| Tool | When to use |
|---|---|
| `pcl_product_summary` | Always — call at session start |
| `pcl_get_domain("*critical")` | Always — load hard business rules |
| `pcl_get_persona(id)` | Before any user-facing feature |
| `pcl_get_journey(id)` | Before any user flow code |
| `pcl_get_spec(id)` | Before implementing a feature |
| `pcl_get_decision(id)` | Before architectural decisions |
| `pcl_list(type)` | Discover what exists |
| `pcl_search(query)` | When you don't know the ID |
| `pcl_related(id)` | Discover connected context |

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
