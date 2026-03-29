---
id: "first-project"
name: "First Project Creation"
persona: "dev-alex"
trigger: "User clicks 'New Project' button from the dashboard after completing onboarding"
success_state: "Project exists with a descriptive name, at least three tasks with assignments, a timeline with milestones, and a linked GitHub repository — all completed within 5 minutes"
failure_modes:
  - "User abandons project creation because the GitHub integration OAuth flow fails or times out"
  - "User creates a project but adds no tasks, resulting in an empty project that provides no value"
  - "User skips the GitHub connection step and never returns to set it up, missing the core value proposition for developers"
  - "User sets an unrealistic timeline and gets discouraged by immediate overdue warnings"
  - "User tries to invite a collaborator who does not have a TaskPilot account and the invitation flow confuses them"
steps:
  - "name-project"
  - "set-timeline"
  - "add-tasks"
  - "connect-github"
  - "invite-collaborator"
---

# First Project Creation Journey

This journey documents the experience of Alex Rivera, a freelance developer, creating their first real project in TaskPilot after completing the initial onboarding. Unlike Sarah's onboarding journey which focuses on reaching the dashboard quickly, Alex's first project journey is about depth: connecting their development workflow (GitHub), setting up meaningful tasks, and establishing the foundation for automatic time tracking. This journey is critical because Alex will judge the entire product based on whether this first project setup feels like time well spent or time wasted on configuration.

## Context and Motivation

Alex has just finished a discovery call with a new client who wants a custom web application for managing event registrations. The project scope is roughly six weeks, billed hourly at $125/hour with a monthly invoice. Alex opens TaskPilot to create the project while the details are fresh. They are slightly skeptical — they have tried four different project management tools in the past two years and abandoned all of them within a month. The bar for TaskPilot is simple: does this setup process take less time than creating a GitHub project board? If yes, Alex will give it a real chance.

## Step 1: Name Project (name-project)

**What the user sees:** A modal dialog (triggered by the "New Project" button or the keyboard shortcut Cmd+N / Ctrl+N) with a single prominent text field labeled "Project name" and a secondary field for "Client name (optional)". Below the fields, a dropdown for "Billing model" with options: Hourly, Fixed bid, Retainer, Milestone-based, and None (personal project). A color picker allows selecting a project color for visual distinction on the dashboard.

**What the user does:** Alex types "EventHub - Registration Platform" as the project name, enters "Meridian Events" as the client, selects "Hourly" as the billing model, and adds the hourly rate ($125). They pick a blue color tag and press Enter (or Tab to advance). The entire interaction is keyboard-navigable — Alex never touches the mouse.

**Expected duration:** 20-30 seconds.

**Technical notes:** Project names must be unique within a workspace. The system auto-generates a URL-safe slug from the name (eventhub-registration-platform). If a collision is detected, a numeric suffix is added silently. The billing model selection triggers conditional fields: Hourly shows a rate field, Fixed bid shows a total amount field, Milestone-based shows a milestone builder in a later step.

## Step 2: Set Timeline (set-timeline)

**What the user sees:** A minimal timeline view with a start date (defaulted to today), an end date picker, and an option to add milestones. The interface shows a horizontal bar representing the project duration with week markers. A "Generate from template" dropdown offers common project shapes: "Standard web project (6 weeks)", "Sprint-based (2-week cycles)", "Ongoing retainer (no end date)", or "Custom".

**What the user does:** Alex selects "Custom", sets the start date to next Monday, and the end date to six weeks later. They add two milestones: "MVP complete" at the three-week mark and "Final delivery" at the six-week mark. The timeline bar updates in real-time to show these milestones as diamonds on the bar. Alex appreciates that this took 15 seconds rather than requiring them to configure a full Gantt chart.

**Expected duration:** 20-40 seconds.

**Design rationale:** Freelancers generally think in milestones, not sprints. The timeline view is deliberately simple — a single horizontal bar, not a Gantt chart — because complexity at this stage causes abandonment. Detailed scheduling (task dependencies, critical path) is available later but never required. The template suggestions are based on aggregate data from existing projects and will improve over time.

## Step 3: Add Tasks (add-tasks)

**What the user sees:** A fast task-entry interface resembling a text editor more than a form. Each line becomes a task when the user presses Enter. Tasks can be indented with Tab to create subtasks. A right-hand panel shows suggested tasks based on the project name and billing model ("Based on similar projects, you might need: Set up repository, Design database schema, Build API endpoints, Create frontend views, Write tests, Deploy to staging, Client review, Deploy to production").

**What the user does:** Alex quickly types out their initial task breakdown, pressing Enter between each line. They add eight tasks: "Set up Next.js project and CI/CD", "Design database schema", "Build registration API endpoints", "Create registration form UI", "Implement payment integration", "Build admin dashboard", "Testing and QA", "Deploy to production". They drag "Testing and QA" to span the last two weeks on the timeline. Two of the suggested tasks matched what they typed, so the suggestions feel useful rather than patronizing.

**Expected duration:** 45-90 seconds.

**Keyboard shortcuts:** Cmd+Enter creates the task and starts a timer immediately (for users who want to begin working right away). Tab indents a task to make it a subtask. Shift+Tab outdents. Up/Down arrow keys navigate between tasks. Backspace on an empty task deletes it and moves focus to the previous task. These shortcuts are discoverable via a small "?" icon in the corner.

## Step 4: Connect GitHub (connect-github)

**What the user sees:** An integration panel with the heading "Connect your code" showing GitHub (primary, with a green "Recommended" badge), GitLab, and Bitbucket as options. Below the options, a brief explanation: "Link a repository to automatically associate commits with tasks and track development progress." If Alex has already authenticated GitHub at the workspace level, they see a searchable list of their repositories.

**What the user does:** Alex clicks "GitHub" and, since this is their first time connecting, goes through the GitHub OAuth flow (opens in a popup, requests repository read access and webhook permissions). After authorizing, the popup closes and a search field appears pre-populated with their recent repositories. Alex searches for "meridian-eventhub", selects it, and clicks "Link repository". A confirmation shows that a webhook has been installed and future commits with task IDs in the message (e.g., "TP-12: Build registration form") will automatically be linked.

**Expected duration:** 30-60 seconds (first time with OAuth), 10-15 seconds (if already authenticated).

**Failure handling:** If the GitHub OAuth flow fails (popup blocked, network error, rate limited), the system shows an inline error with a "Try again" button and a "Skip for now — you can connect later from Settings" link. A background job retries webhook installation up to three times if it fails on the first attempt. The project creation is never blocked by a failed integration.

## Step 5: Invite Collaborator (invite-collaborator)

**What the user sees:** A simple "Add people" section showing the workspace members (if any) as avatars with checkboxes, and an email input field for inviting external collaborators. Role options are shown inline: "Can edit" (full access to tasks and time entries) and "Can view" (read-only access, suitable for clients). A "Share a link" option generates a read-only URL for the project that can be sent to the client directly.

**What the user does:** Alex does not have regular collaborators on this project, but they want their client to be able to see progress. They enter the client's email (contact@meridianevents.com), select "Can view", and click "Invite". They also generate a shareable progress link to bookmark for later. The project creation is now complete, and Alex is redirected to the project board view with their eight tasks displayed in a kanban layout (To Do, In Progress, Done).

**Expected duration:** 15-30 seconds (or 3 seconds if skipped).

**Post-creation experience:** The project board loads with a contextual banner at the top: "Your project is ready. Press 'T' to start a timer on any task, or 'N' to add more tasks." This banner dismisses after the user performs either action or clicks the X. Alex presses T on the first task and begins working. The timer appears as a small persistent indicator in the top-right corner of the navigation bar, visible from any page in the application.
