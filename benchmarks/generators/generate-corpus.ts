/**
 * Corpus generator — expands corpus-small into medium (50), large (100), xlarge (500).
 * Uses deterministic seeding for reproducibility.
 */
import { mkdir, writeFile, cp } from "node:fs/promises";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

// Simple seeded PRNG (mulberry32)
function createRNG(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERSONA_NAMES = [
  { name: "Maya", role: "UX Researcher", goal: "Validate designs with real users" },
  { name: "Jordan", role: "DevOps Engineer", goal: "Keep infrastructure reliable" },
  { name: "Priya", role: "Product Owner", goal: "Maximize business value per sprint" },
  { name: "Marcus", role: "QA Lead", goal: "Catch bugs before they reach production" },
  { name: "Elena", role: "Data Analyst", goal: "Turn data into actionable insights" },
  { name: "Tomás", role: "Frontend Developer", goal: "Build pixel-perfect responsive UIs" },
  { name: "Kenji", role: "Backend Architect", goal: "Design scalable API systems" },
  { name: "Fatima", role: "Scrum Master", goal: "Remove blockers for the team" },
  { name: "Oscar", role: "Security Engineer", goal: "Protect user data and prevent breaches" },
  { name: "Li Wei", role: "Mobile Developer", goal: "Deliver smooth native app experiences" },
];

const SPEC_TOPICS = [
  "Time Tracking Widget", "Invoice Generator", "Client Portal", "File Attachments",
  "Task Dependencies", "Gantt Chart View", "Resource Allocation", "Budget Tracker",
  "Custom Fields", "Recurring Tasks", "Email Integration", "Calendar Sync",
  "Milestone Tracking", "Approval Workflows", "Template Library", "API Webhooks",
  "Bulk Operations", "Dark Mode", "Offline Support", "Export to PDF",
  "Team Chat", "Activity Feed", "Custom Reports", "Sprint Planning",
  "Workload View", "Time Zone Support", "Multi-language", "Search & Filter",
];

const DECISION_TOPICS = [
  "Use Tailwind CSS for styling",
  "Adopt Zod for runtime validation",
  "Choose PostgreSQL over MongoDB",
  "Use React Server Components",
  "Implement RBAC with Supabase RLS",
  "Deploy on Vercel Edge",
  "Use Resend for transactional emails",
  "Adopt pnpm over npm",
  "Use Vitest for testing",
  "Implement feature flags with PostHog",
];

const DOMAIN_RULES = [
  { title: "Password Policy", critical: false },
  { title: "File Upload Limits", critical: false },
  { title: "Workspace Naming Rules", critical: false },
  { title: "API Versioning Policy", critical: false },
  { title: "Accessibility Requirements", critical: true },
  { title: "Internationalization Rules", critical: false },
  { title: "Error Handling Standards", critical: false },
  { title: "Logging and Monitoring Policy", critical: true },
  { title: "Third-Party Integration Rules", critical: false },
  { title: "Performance Budgets", critical: false },
];

function generatePersona(index: number, rng: () => number): string {
  const p = PERSONA_NAMES[index % PERSONA_NAMES.length]!;
  const id = p.name.toLowerCase().replace(/\s+/g, "-");
  const techLevel = ["beginner", "intermediate", "advanced"][Math.floor(rng() * 3)];

  return `---
id: "${id}"
name: "${p.name}"
role: "${p.role}"
tech_level: "${techLevel}"
primary_goal: "${p.goal}"
jobs_to_be_done:
  - "Complete daily work efficiently"
  - "Collaborate with team members"
  - "Track progress on deliverables"
anti_patterns:
  - "Avoids tools that require excessive configuration"
  - "Ignores features hidden behind multiple clicks"
channels:
  - "desktop"
  - "email"
---

## Background

${p.name} is a ${p.role} with ${Math.floor(rng() * 10 + 2)} years of experience. Their primary focus is to ${p.goal.toLowerCase()}. They work in a fast-paced environment where context switching is common and tools need to be intuitive and fast.

## Key Behaviors

${p.name} typically starts the day by reviewing their task list and prioritizing based on urgency and impact. They prefer tools that surface the most important information first without requiring manual sorting or filtering. Keyboard shortcuts are appreciated but not required.

## Pain Points

The biggest frustration for ${p.name} is when tools slow down their workflow rather than accelerating it. They have abandoned previous tools that required too much upfront configuration or that cluttered the interface with features they did not use. Simplicity and speed are more important than feature completeness.
`;
}

function generateSpec(index: number, rng: () => number): string {
  const topic = SPEC_TOPICS[index % SPEC_TOPICS.length]!;
  const id = topic.toLowerCase().replace(/\s+/g, "-");
  const statuses = ["draft", "in-progress", "approved", "implemented"];
  const status = statuses[Math.floor(rng() * statuses.length)]!;

  return `---
id: "${id}"
title: "${topic}"
status: "${status}"
acceptance_criteria:
  - "Feature must be fully functional on desktop and mobile viewports"
  - "Loading time must not exceed 2 seconds on a standard connection"
  - "All user inputs must be validated both client-side and server-side"
  - "Feature must include proper error states and empty states"
out_of_scope:
  - "Offline support for this feature"
  - "Integration with third-party services"
---

## Overview

The ${topic} feature enables users to manage their ${topic.toLowerCase()} workflow directly within TaskPilot. This reduces context switching and keeps all project-related information in one place.

## Requirements

The feature must integrate seamlessly with the existing dashboard and project views. Users should be able to access it from the project navigation sidebar. The interface must follow existing design patterns including the card-based layout, consistent button styles, and the standard form validation approach.

## Technical Considerations

Implementation should use Next.js Server Components for initial data loading and Client Components only for interactive elements. Data should be stored in the existing Supabase PostgreSQL database with appropriate RLS policies. All database queries should be optimized with proper indexes to maintain the 2-second loading time requirement.

## User Stories

As a project manager, I want to use ${topic.toLowerCase()} so that I can track progress more effectively. As a developer, I want the ${topic.toLowerCase()} interface to be keyboard-navigable so that I can work efficiently without switching to the mouse.
`;
}

function generateDecision(index: number, _rng: () => number): string {
  const topic = DECISION_TOPICS[index % DECISION_TOPICS.length]!;
  const id = `adr-${String(index + 2).padStart(3, "0")}`;

  return `---
id: "${id}"
title: "${topic}"
status: "accepted"
date: "2025-0${Math.min(index + 1, 9)}-15"
context: "The team needed to decide on the approach for ${topic.toLowerCase()} to ensure consistency and maintainability across the codebase."
decision: "We decided to ${topic.toLowerCase()} based on team expertise, ecosystem maturity, and alignment with our existing architecture."
consequences:
  - "All new code must follow this decision"
  - "Existing code should be migrated incrementally"
  - "Documentation must be updated to reflect this choice"
alternatives_rejected:
  - "The alternative approach was considered but rejected due to higher complexity"
---

## Context

The team evaluated multiple options for ${topic.toLowerCase()}. The primary factors in the decision were developer experience, performance characteristics, and long-term maintainability.

## Decision Details

After evaluating the options, we chose to ${topic.toLowerCase()}. This aligns with our existing technology choices and reduces the learning curve for new team members. The decision was made based on a proof-of-concept implementation that demonstrated the viability of this approach.

## Migration Plan

Existing code that does not follow this decision will be migrated as part of regular maintenance work. There is no urgent timeline for migration, but all new code must adhere to this decision immediately.
`;
}

function generateDomainRule(index: number, _rng: () => number): string {
  const rule = DOMAIN_RULES[index % DOMAIN_RULES.length]!;
  const id = rule.title.toLowerCase().replace(/\s+/g, "-");

  return `---
id: "${id}"
critical: ${rule.critical}
title: "${rule.title}"
---

## ${rule.title}

These rules define the standards for ${rule.title.toLowerCase()} in TaskPilot. All engineers must follow these rules when working on related features.

### Requirements

1. All implementations must be reviewed against these standards before merging
2. Automated checks should be added where feasible to enforce compliance
3. Exceptions require documented justification and team lead approval

### Rationale

These rules exist to ensure consistency, maintainability, and quality across the product. They were established based on industry best practices and lessons learned from previous projects.
`;
}

async function generateCorpus(targetSize: number, outputDir: string) {
  const rng = createRNG(42); // deterministic seed

  // Start by copying corpus-small as the base
  await cp(join(FIXTURES_DIR, "corpus-small"), outputDir, { recursive: true });

  // Calculate how many of each type to generate
  // Base: 1 product + 2 personas + 2 journeys + 2 specs + 1 decision + 2 domain = 10
  const remaining = targetSize - 10;
  if (remaining <= 0) return;

  // Distribution: 20% personas, 15% journeys, 30% specs, 20% decisions, 15% domain
  const personaCount = Math.floor(remaining * 0.2);
  const specCount = Math.floor(remaining * 0.3);
  const decisionCount = Math.floor(remaining * 0.2);
  const domainCount = remaining - personaCount - specCount - decisionCount;

  // Generate personas
  for (let i = 0; i < personaCount; i++) {
    const content = generatePersona(i, rng);
    const name = PERSONA_NAMES[i % PERSONA_NAMES.length]!.name.toLowerCase().replace(/\s+/g, "-");
    await writeFile(join(outputDir, "personas", `${name}.md`), content);
  }

  // Generate specs
  for (let i = 0; i < specCount; i++) {
    const content = generateSpec(i, rng);
    const name = SPEC_TOPICS[i % SPEC_TOPICS.length]!.toLowerCase().replace(/\s+/g, "-");
    await writeFile(join(outputDir, "specs", `${name}.md`), content);
  }

  // Generate decisions
  for (let i = 0; i < decisionCount; i++) {
    const content = generateDecision(i, rng);
    await writeFile(join(outputDir, "decisions", `adr-${String(i + 2).padStart(3, "0")}.md`), content);
  }

  // Generate domain rules
  for (let i = 0; i < domainCount; i++) {
    const content = generateDomainRule(i, rng);
    const name = DOMAIN_RULES[i % DOMAIN_RULES.length]!.title.toLowerCase().replace(/\s+/g, "-");
    await writeFile(join(outputDir, "domain", `${name}.md`), content);
  }
}

async function main() {
  const sizes = [
    { name: "corpus-medium", size: 50 },
    { name: "corpus-large", size: 100 },
    { name: "corpus-xlarge", size: 500 },
  ];

  for (const { name, size } of sizes) {
    const outputDir = join(FIXTURES_DIR, name);
    console.log(`Generating ${name} (${size} files)...`);
    await mkdir(outputDir, { recursive: true });
    await generateCorpus(size, outputDir);
    console.log(`  → ${name} created at ${outputDir}`);
  }

  console.log("\nDone! Generated corpora for benchmarking.");
}

main().catch(console.error);
