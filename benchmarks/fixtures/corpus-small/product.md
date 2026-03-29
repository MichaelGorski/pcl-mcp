---
name: "TaskPilot"
tagline: "Project management that works the way freelancers think"
problem: "Freelancers juggle multiple clients, inconsistent workflows, and scattered tools — leading to missed deadlines, unbilled hours, and burnout"
solution: "A unified workspace that combines project tracking, time logging, and client communication in one opinionated tool built for solo operators and small teams"
primary_persona: "sarah-pm"
tech_stack:
  - "Next.js 14 (App Router)"
  - "Supabase (Auth + Postgres + Realtime)"
  - "TypeScript"
  - "Tailwind CSS"
  - "Vercel"
  - "Stripe"
stage: "prototype"
repo: "https://github.com/taskpilot/taskpilot-app"
url: "https://taskpilot.dev"
---

# TaskPilot

TaskPilot is a project management platform designed specifically for freelancers and small agency teams who need to stay on top of multiple client engagements without drowning in administrative overhead. Unlike enterprise tools such as Jira or Monday.com, TaskPilot assumes you are the one doing the work — not managing layers of people doing the work. Every feature is built around the question: "Does this save a freelancer at least five minutes per day?"

## The Problem

Freelancers currently cobble together a patchwork of tools: Trello for task tracking, Toggl for time logging, Slack or email for client communication, Google Sheets for invoicing, and Notion for project notes. This fragmentation leads to several concrete pain points. First, context switching between tools wastes an estimated 40 minutes per day according to internal user research. Second, time tracking is almost always retroactive and inaccurate because it requires switching to a separate app. Third, client visibility is poor — freelancers either over-communicate (wasting time) or under-communicate (eroding trust). Fourth, billing disputes arise because there is no single source of truth linking time entries to deliverables.

## The Solution

TaskPilot consolidates project tracking, automatic time capture, and a client-facing portal into one application. The core workflow is simple: create a project, add tasks, start a timer, and ship. Clients get a read-only portal showing progress without requiring the freelancer to write status updates. Time entries are automatically linked to tasks, making invoicing a one-click operation at the end of each billing cycle.

## Technical Foundation

The application is built on Next.js 14 using the App Router for server-side rendering, which provides strong SEO for the marketing site and fast initial page loads for the authenticated app. Supabase provides the entire backend layer: authentication with magic links and OAuth, a PostgreSQL database for structured data, row-level security for multi-tenant isolation, and Realtime subscriptions for live collaboration features. The frontend uses Tailwind CSS for styling and deploys to Vercel for zero-configuration CI/CD. Stripe handles all payment processing and subscription management.

## Current Stage

TaskPilot is in the prototype stage with a working MVP deployed to a staging environment. Core features (project CRUD, task management, basic time tracking) are functional. The team is currently focused on the onboarding flow and the client portal before opening a private beta. Key metrics being tracked include time-to-first-project (target: under 10 minutes), daily active usage rate, and timer adoption rate (percentage of tasks with associated time entries).

## Strategic Direction

The immediate roadmap prioritizes three areas: (1) completing the notification system to support email and in-app channels, (2) building the dashboard analytics view so freelancers can see utilization rates and revenue trends, and (3) integrating with GitHub for developer-focused users who want their commits linked to tasks. Longer-term, TaskPilot aims to offer AI-powered scope estimation based on historical task data — turning past project data into accurate future quotes.
