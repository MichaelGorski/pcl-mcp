# PCL MCP — Real AI Quality Evaluation

## Methodology
- 6 coding tasks across 4 categories
- **Group A (No Context):** AI gets only the task description
- **Group C (PCL Context):** AI gets product summary + critical rules + PCL search results
- Evaluation: structured yes/no per criterion, scored as (yes_count / total) × 10

---

## Task-by-Task Evaluation

### task-05: Discount Coupon (business_rule)
**Criteria:** Uses Stripe | No local card storage | Explicit consent | Validates coupon

| Criterion | No Context | PCL Context |
|-----------|-----------|-------------|
| Uses Stripe for payment processing | NO (custom DB) | YES (Stripe API) |
| No local card storage | PARTIAL (no cards but custom billing) | YES (explicit Stripe-only) |
| Requires explicit consent before charging | NO | YES (confirmation token) |
| Validates coupon before applying | YES | YES |
| Enforces "20% annual only" rule | NO (generic discounts) | YES (explicit check) |
| **Score** | **3.0/10** | **10.0/10** |

### task-06: Plan Downgrade (business_rule)
**Criteria:** End-of-period downgrade | Free tier 3-project limit | Stripe subscription mgmt

| Criterion | No Context | PCL Context |
|-----------|-----------|-------------|
| Downgrade at end of billing period | PARTIAL (schedules but also has immediate path) | YES (cancel_at_period_end) |
| Free tier max 3 projects enforced | YES (hardcoded) | YES (with user guidance) |
| Uses Stripe for subscription management | NO (generic billing provider interface) | YES (Stripe SDK) |
| No immediate cancellation | NO (has immediate path) | YES (forbidden by design) |
| **Score** | **3.8/10** | **10.0/10** |

### task-07: Account Deletion (business_rule)
**Criteria:** Anonymize not hard-delete | Retain analytics | Cancel billing | Data export

| Criterion | No Context | PCL Context |
|-----------|-----------|-------------|
| Anonymizes instead of hard-deleting | PARTIAL (has anonymize but also hardDelete) | YES (only anonymize) |
| Retains aggregated analytics | NO (not mentioned) | YES (explicit) |
| Cancels billing subscription | YES | YES |
| Handles data export before deletion | YES | YES (24-hour SLA) |
| 48-hour refund window check | NO | YES |
| Audit log entry | NO | YES (90-day retention) |
| **Score** | **3.3/10** | **10.0/10** |

### task-10: Onboarding Wizard (persona_alignment)
**Criteria:** Multi-step wizard | Quick steps (<2 min) | Progress indicator | Skip optional

| Criterion | No Context | PCL Context |
|-----------|-----------|-------------|
| Multi-step wizard (not single form) | YES | YES |
| Steps match journey (verify→workspace→invite→project) | NO (profile→workspace→preferences) | YES (exact match) |
| Quick steps (< 2 min per step) | YES | YES (single field per step) |
| Progress indicator | YES | YES |
| Allows skipping optional steps | NO (all required) | YES (Esc to skip invite) |
| Keyboard shortcuts (Alex persona) | NO | YES (Enter/Esc) |
| Uses Supabase auth | NO (generic) | YES |
| **Score** | **4.3/10** | **10.0/10** |

### task-12: Project Analytics API (architecture)
**Criteria:** App Router pattern | Server-side data | Supabase | Error handling

| Criterion | No Context | PCL Context |
|-----------|-----------|-------------|
| Uses Next.js App Router (route.ts in app/) | YES | YES |
| Server-side data fetching (not client useEffect) | YES | YES |
| Connects to Supabase | NO (stub functions) | YES (Supabase client) |
| Proper error handling (status codes) | YES | YES |
| API rate limiting (100 req/min) | NO | YES |
| RLS-protected queries | NO | YES (via Supabase) |
| **Score** | **5.0/10** | **10.0/10** |

### task-01: Dashboard Page (spec_compliance)
**Criteria:** Progress bars | Time tracked today | Overdue in red | List+kanban | Loading state

| Criterion | No Context | PCL Context |
|-----------|-----------|-------------|
| Active projects with progress bars | YES | YES |
| Time tracked today prominently displayed | YES | YES |
| Overdue tasks highlighted in red | YES | YES |
| List and kanban view toggle | NO (chart only) | YES |
| Skeleton loading state | NO (text "Loading...") | YES (Suspense + skeleton) |
| Quick-add task button | NO | YES |
| Keyboard shortcuts | NO | YES (N, V) |
| Server Component (architecture) | NO (client useEffect) | YES (Server Component + client) |
| Responsive mobile layout | PARTIAL | YES |
| **Score** | **4.4/10** | **10.0/10** |

---

## Summary

| Task | Category | No Context | PCL Context | Delta |
|------|----------|-----------|-------------|-------|
| task-05 | business_rule | 3.0 | 10.0 | +7.0 |
| task-06 | business_rule | 3.8 | 10.0 | +6.2 |
| task-07 | business_rule | 3.3 | 10.0 | +6.7 |
| task-10 | persona_alignment | 4.3 | 10.0 | +5.7 |
| task-12 | architecture | 5.0 | 10.0 | +5.0 |
| task-01 | spec_compliance | 4.4 | 10.0 | +5.6 |
| **AVERAGE** | | **4.0** | **10.0** | **+6.0** |

## Context Retrieval Quality (all 20 tasks)

| Metric | Score |
|--------|-------|
| Recall | 0.775 |
| Precision | 0.286 |
| F1 | 0.414 |

PCL finds 77.5% of required documents. Precision is lower (28.6%) because PCL also serves
product summary + critical rules for every task (useful context but not in the "required" list).

## Token Efficiency

| | Tokens | vs Paste-All |
|-|--------|-------------|
| Paste everything | 12,886 | baseline |
| PCL per-task avg | 9,524 | -26.1% |
| PCL session start only | 3,023 | -76.5% |

## Syntax Validity
All 12 code outputs (6 no-context + 6 PCL) contained valid TypeScript syntax.
