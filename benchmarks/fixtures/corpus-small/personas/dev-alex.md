---
id: "dev-alex"
name: "Alex Rivera"
role: "Freelance full-stack developer"
age_range: "25-35"
tech_level: "high"
primary_goal: "Minimize administrative overhead so they can spend 80% or more of their working hours writing code"
biggest_fear: "Losing track of billable hours and undercharging for a project, effectively working for free"
jobs_to_be_done:
  - "Track time automatically while working on tasks without context-switching to a separate app"
  - "Link GitHub commits and pull requests to project tasks for traceability"
  - "Generate invoices from tracked time with minimal manual input"
  - "Manage three to five concurrent freelance contracts with different billing structures"
  - "Quickly estimate new project scope based on historical data from similar past projects"
  - "Communicate project progress to non-technical clients in plain language"
anti_patterns:
  - "Will not fill out timesheets retroactively — if the tool does not capture time in the moment it is useless"
  - "Ignores tools without keyboard shortcuts and fast navigation"
  - "Refuses to use any tool that requires more than two clicks to start tracking time on a task"
  - "Abandons tools that send more than three notifications per day"
  - "Will not adopt tools that do not have a dark mode"
channels:
  - "Hacker News"
  - "Twitter/X (dev community)"
  - "Dev.to"
  - "GitHub Explore"
  - "Reddit r/freelance and r/webdev"
---

# Alex Rivera — Freelance Full-Stack Developer

Alex Rivera represents the technical power user of TaskPilot. They are a self-employed developer who works directly with three to five clients at any given time, handling everything from initial scoping to deployment. Unlike Sarah, who manages a team, Alex is the team — they need a tool that eliminates friction rather than adding coordination layers. Alex's relationship with project management tools is adversarial by default: every minute spent in a PM tool is a minute not spent coding, and coding is what pays the bills.

## Work Style and Environment

Alex works from a home office with a dual-monitor setup running VS Code on one screen and a browser on the other. Their workflow is keyboard-driven. They use terminal-based tools wherever possible and evaluate every new application by whether it respects their flow state. A tool that requires mouse-heavy navigation or interrupts with modal dialogs will be uninstalled within a day. They are currently using a combination of Clockify for time tracking (which they forget to start half the time), GitHub Issues for task management (acceptable but lacks client visibility), and a custom Node.js script that generates PDF invoices from a JSON file (functional but embarrassing).

## Billing Complexity

Alex's billing situation is more complex than it appears on the surface. Client A pays a fixed monthly retainer for ongoing maintenance work. Client B is billed hourly at $125/hour with a monthly cap of 40 hours. Client C is a fixed-bid project with milestone-based payments. Client D is on a hybrid model: fixed for the initial build, hourly for change requests. Alex needs a tool that can handle all four billing models and generate accurate invoices for each without manual calculations. Currently, this invoicing process takes Alex about three hours at the end of each month — time that is, ironically, not billable.

## Technical Requirements

Alex expects TaskPilot to integrate with their development workflow, not replace it. The most important integration is GitHub: they want commits to automatically log time against tasks (or at least provide a one-click association), pull requests to update task status, and deployment events to mark milestones as complete. They also want an API — not just for the sake of having an API, but because they will inevitably want to build custom automations. If TaskPilot does not have a public REST or GraphQL API within the first year, Alex will lose interest.

Performance matters to Alex more than it matters to most users. They notice when a page takes 400ms versus 200ms to load. They will benchmark the app informally and complain publicly on Twitter if it feels sluggish. On the other hand, if TaskPilot is fast and well-built, Alex will become an evangelist — they enjoy recommending good tools to their developer network, and their endorsement carries weight in the communities they frequent.

## What Success Looks Like for Alex

A perfect day with TaskPilot means Alex opened the app once in the morning to check their task list, hit a keyboard shortcut to start a timer, coded for four hours, hit the same shortcut to stop the timer, and moved on. At the end of the month, they clicked a button and had an invoice. No timesheets, no manual entry, no context switching. Their utilization rate (billable hours divided by working hours) went from 65% to 80%, which at their hourly rate translates to roughly $1,500 per month in recovered revenue.

## Persona Interactions

Alex and Sarah represent opposite ends of the user spectrum for TaskPilot. Sarah wants overview and control; Alex wants invisibility and speed. Features that delight Sarah (dashboards, reports, team views) are noise to Alex. Features that delight Alex (keyboard shortcuts, API access, GitHub integration) are invisible to Sarah. The design challenge for TaskPilot is building a product that serves both without forcing either to wade through features meant for the other.
