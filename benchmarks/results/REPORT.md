# PCL MCP Benchmark Report

Generated: 2026-03-25T09:28:50.810Z

## Layer 3: Token Efficiency

| Corpus Size | PCL Start | Paste All | Savings | Ratio |
|-------------|-----------|-----------|---------|-------|
| 10 files | 3023 tok | 12886 tok | 76.5% | 4.3x |

## Layer 2: Search Quality

| Mode | P@1 | P@3 | P@5 | R@5 | MRR | NDCG@5 |
|------|-----|-----|-----|-----|-----|--------|
| hybrid | 0.867 | 0.589 | 0.460 | 0.872 | 0.928 | 0.867 |
| semantic | 0.867 | 0.578 | 0.453 | 0.853 | 0.919 | 0.855 |
| keyword | 0.333 | 0.267 | 0.267 | 0.219 | 0.333 | 0.287 |

## Layer 5: Ablation Study

| Configuration | P@1 | P@3 | P@5 | R@5 | MRR | NDCG@5 |
|---------------|-----|-----|-----|-----|-----|--------|
| Full PCL (hybrid) | 0.867 | 0.589 | 0.460 | 0.872 | 0.928 | 0.867 |
| Keyword only (no embeddings) | 0.333 | 0.267 | 0.267 | 0.219 | 0.333 | 0.287 |
| Semantic only (no BM25) | 0.867 | 0.578 | 0.453 | 0.853 | 0.919 | 0.855 |
