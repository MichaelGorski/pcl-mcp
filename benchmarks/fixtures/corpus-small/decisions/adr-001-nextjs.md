---
id: adr-001-nextjs
title: "Use Next.js App Router with Supabase for Full-Stack Architecture"
status: accepted
date: "2025-01-15"
context: "TaskPilot needs server-side rendering for SEO on marketing pages, real-time capabilities for collaboration features, and a managed auth/database layer to minimize infrastructure overhead for a small team."
decision: "Adopt Next.js 14+ App Router as the full-stack framework with Supabase as the backend-as-a-service for authentication, database (PostgreSQL), real-time subscriptions, and file storage."
consequences:
  - Server Components are the default — use 'use client' directive only for interactive components
  - All data fetching happens in Server Components or Server Actions, never in client-side useEffect
  - Database access goes through Supabase client libraries, not direct PostgreSQL connections
  - Row Level Security (RLS) policies are mandatory for every table to enforce multi-tenant data isolation
  - Authentication uses Supabase Auth with PKCE flow, session managed via middleware
  - Real-time features use Supabase Realtime channels, not custom WebSocket infrastructure
  - Edge Functions (Deno runtime) for webhook handlers and background jobs
  - File uploads go through Supabase Storage with signed URLs
alternatives_rejected:
  - "Remix + PlanetScale: Better nested routing but weaker real-time story and smaller ecosystem"
  - "SvelteKit + Firebase: Faster initial renders but team has no Svelte experience"
  - "Express + React SPA: Maximum flexibility but requires managing more infrastructure"
---

## Decision Details

### Why Next.js App Router

We chose Next.js App Router (not Pages Router) because:

1. **Server Components by default** reduce client-side JavaScript bundle size. Most of TaskPilot's pages (dashboard, project list, settings) are read-heavy and benefit from server rendering.

2. **Server Actions** provide a type-safe RPC layer between client and server without building a separate API. Form submissions, data mutations, and revalidation are handled through a single abstraction.

3. **Streaming and Suspense** enable progressive page loading. The dashboard can show the project list immediately while the time tracker widget loads asynchronously.

4. **Built-in image optimization, font optimization, and metadata API** reduce the number of third-party dependencies needed.

5. **Vercel deployment** (optional) provides zero-config deploys with edge functions, but we are not locked in — the app can deploy to any Node.js host.

### Why Supabase

We chose Supabase over building a custom backend because:

1. **PostgreSQL with Row Level Security (RLS)** gives us enterprise-grade multi-tenant data isolation without application-level authorization checks in every query. Each table has policies that filter rows based on `auth.uid()`.

2. **Supabase Auth** handles signup, login, OAuth (GitHub, Google), email verification, password reset, and session management out of the box. The PKCE flow is secure for SPAs and SSR.

3. **Realtime subscriptions** via PostgreSQL LISTEN/NOTIFY give us instant notification delivery and live collaboration features without managing WebSocket infrastructure.

4. **Supabase Storage** with signed URLs provides secure file uploads (project attachments, avatars) without building a file service.

5. **Edge Functions** (Deno runtime) handle webhook processing (GitHub, Stripe) and scheduled jobs (digest emails, trial expiration) at the edge.

### Architectural Patterns

#### Component Architecture
```
app/
  layout.tsx              ← Root layout (Server Component)
  page.tsx                ← Landing page (Server Component)
  (auth)/
    login/page.tsx        ← Login (Server Component + Client form)
    signup/page.tsx       ← Signup (Server Component + Client form)
  (dashboard)/
    layout.tsx            ← Dashboard layout with sidebar (Server Component)
    page.tsx              ← Main dashboard (Server Component)
    projects/
      [id]/page.tsx       ← Project detail (Server Component)
  api/
    webhooks/
      github/route.ts     ← GitHub webhook handler
      stripe/route.ts     ← Stripe webhook handler
```

#### Data Fetching Pattern
```typescript
// CORRECT: Data fetching in Server Components
async function ProjectList() {
  const supabase = createServerClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("deadline", { ascending: true });
  return <ProjectGrid projects={projects} />;
}

// INCORRECT: Do NOT fetch in client components
"use client"
function ProjectList() {
  useEffect(() => { fetch("/api/projects") }, []); // ❌ Wrong pattern
}
```

#### RLS Policy Pattern
```sql
-- Every table MUST have RLS enabled and policies defined
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects"
  ON projects FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() IN (
    SELECT user_id FROM project_members WHERE project_id = projects.id
  ));

CREATE POLICY "Users can insert their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
```

#### GitHub Webhook Handler Pattern
```typescript
// app/api/webhooks/github/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export async function POST(request: NextRequest) {
  // 1. Verify webhook signature (HMAC-SHA256)
  const signature = request.headers.get("x-hub-signature-256");
  const body = await request.text();
  const expected = `sha256=${crypto
    .createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex")}`;

  if (!signature || signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Route by event type
  const event = request.headers.get("x-github-event");
  const payload = JSON.parse(body);

  switch (event) {
    case "push":
      // Link commits to tasks via branch name or commit message
      break;
    case "pull_request":
      // Update task status based on PR state (opened, merged, closed)
      break;
    case "issues":
      // Sync GitHub issues with TaskPilot tasks
      break;
    default:
      return NextResponse.json({ ignored: true }, { status: 200 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

### Constraints and Guardrails

1. **No `pages/` directory** — all routes must use the App Router (`app/` directory)
2. **No `getServerSideProps` or `getStaticProps`** — use async Server Components instead
3. **No direct database connections** — always use Supabase client libraries
4. **No client-side auth checks only** — always validate session in middleware or Server Components
5. **No tables without RLS** — every migration must include RLS policies
6. **Prefer Server Actions over API routes** — use `app/api/` only for webhooks and external integrations
