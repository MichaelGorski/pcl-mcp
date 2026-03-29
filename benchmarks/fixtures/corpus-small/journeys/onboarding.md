---
id: "onboarding"
name: "First-Time User Onboarding"
persona: "sarah-pm"
trigger: "User clicks 'Get started free' on the TaskPilot marketing site"
success_state: "User has reached the dashboard with their first project created, at least one task added, and understands the core navigation — all within 10 minutes of signup"
failure_modes:
  - "User abandons during email verification because the confirmation email is delayed more than 60 seconds"
  - "User gets confused by the workspace concept and does not understand it maps to their agency"
  - "User creates a workspace but does not create a project, leaving them on an empty dashboard with no clear next step"
  - "User invites team members before creating a project, leading to invited users seeing an empty workspace"
  - "User spends too long customizing workspace settings and runs out of patience before reaching the core value"
steps:
  - "signup"
  - "verify-email"
  - "create-workspace"
  - "invite-team"
  - "create-first-project"
---

# First-Time User Onboarding Journey

## UX Principles for Onboarding

- **Each step must be completable in under 2 minutes** — Sarah's anti-pattern research shows users abandon flows longer than 10 minutes total
- **Optional steps must have a prominent "Skip for now" option** — never force data entry that isn't strictly required
- **Progress indicator (step N of M) must be visible at all times** — users need to know how much is left
- **Never require information that can be inferred** — pre-fill from OAuth provider (name, email, avatar, org domain)
- **Multi-step wizard, not a single long form** — break the flow into focused, digestible steps with clear progression
- **Allow going back** — users should be able to revisit previous steps without losing data

This journey documents the critical first experience a new user has with TaskPilot. Research consistently shows that users who do not reach a meaningful outcome within their first session have less than a 10% chance of returning. For TaskPilot, a "meaningful outcome" is defined as: the user can see a project on their dashboard with at least one task, and they understand how to navigate between projects, tasks, and time tracking. The entire onboarding flow is designed to get users to this state in under 10 minutes.

## Step 1: Signup (signup)

**What the user sees:** A minimal signup form with three options: (1) Continue with Google, (2) Continue with GitHub, (3) Sign up with email. The form is centered on the page with the TaskPilot logo above it and a single testimonial quote from an existing user below. There are no distracting navigation elements, pricing comparisons, or feature lists on this page.

**What the user does:** Sarah will most likely click "Continue with Google" because she uses Google Workspace at her agency. The OAuth flow opens in a popup, she selects her Google account, and the popup closes automatically. If she chooses email signup, she enters her email and a password (minimum 8 characters, shown with a strength meter). No username is required — the display name is pulled from the OAuth provider or asked for in the next step.

**Expected duration:** 30-60 seconds.

**Design considerations:** The signup page must load in under 1 second. The Google OAuth popup must not be blocked by common popup blockers (tested against the top five). If the user already has an account, the form should detect this and show a "Welcome back" message with a login link instead of creating a duplicate account.

## Step 2: Email Verification (verify-email)

**What the user sees:** A confirmation page with the heading "Check your inbox" and an illustration of an envelope. The user's email address is displayed with a "Resend" button and a "Change email" link. A subtle animation (pulsing dot) indicates the system is waiting.

**What the user does:** Sarah switches to her email client, finds the verification email, and clicks the magic link. The TaskPilot tab automatically detects the verification (via Supabase Realtime subscription on the auth state) and redirects to the workspace creation step without requiring the user to come back and click anything.

**Expected duration:** 30-90 seconds. If the email takes longer than 60 seconds to arrive, the resend button should pulse gently to draw attention.

**Failure mitigation:** If verification is not completed within 5 minutes, send a follow-up email with a different subject line ("Your TaskPilot verification code — try this one"). Track email delivery rates by provider and alert the engineering team if deliverability drops below 95% for any major provider (Gmail, Outlook, Yahoo). OAuth users skip this step entirely.

## Step 3: Create Workspace (create-workspace)

**What the user sees:** A form with two fields: "Workspace name" (pre-filled with the domain extracted from their email, e.g., "acmeagency" from sarah@acmeagency.com) and "What best describes your team?" with options: "Just me", "Small team (2-10)", "Agency/studio", "Other". A preview of the workspace URL is shown below the name field (e.g., taskpilot.dev/acmeagency).

**What the user does:** Sarah reviews the pre-filled workspace name, possibly adjusts it to "Acme Agency", selects "Agency/studio" from the team type options, and clicks "Create workspace". This selection affects the default dashboard layout and suggested features (agencies see client management prominently, solo freelancers see time tracking prominently).

**Expected duration:** 20-40 seconds.

**Technical note:** Workspace slugs must be unique, lowercase, alphanumeric with hyphens. Validation happens in real-time as the user types (debounced at 300ms) with a green checkmark or red X indicating availability.

## Step 4: Invite Team (invite-team)

**What the user sees:** An invitation screen with the heading "Invite your team" and a text area where multiple email addresses can be pasted (comma or newline separated). Below it, a "Skip for now" link is clearly visible. A tooltip explains that team members will receive an email invitation and can join the workspace immediately.

**What the user does:** Sarah may enter two or three email addresses for her core team members, or she may skip this step if she wants to explore the tool alone first. The "Skip for now" option is deliberately prominent — we do not want to force team invitations before the user has experienced the product individually. If she does invite people, each address is validated in real-time, and a counter shows "3 invitations ready to send".

**Expected duration:** 15-45 seconds (or 3 seconds if skipped).

**Important UX decision:** Invitations are sent immediately upon clicking "Send invitations and continue", but the invited users land on a holding page that says "Sarah is setting up your workspace — you will get another email when it is ready." This prevents the failure mode where invited users arrive to an empty workspace before Sarah has created her first project.

## Step 5: Create First Project (create-first-project)

**What the user sees:** A guided project creation wizard with three stages: (1) Name and client — a text field for project name and an optional client name field, (2) Timeline — a start date (defaulting to today) and end date picker with a "No fixed deadline" checkbox, (3) First tasks — a simple list input where the user can type tasks and press Enter to add more, with three placeholder suggestions pre-filled ("e.g., Design homepage, Set up hosting, Send proposal"). A progress indicator shows 3/3 steps.

**What the user does:** Sarah names her project "Acme Corp Website Redesign", enters "Acme Corp" as the client, sets a deadline four weeks from today, and adds three or four initial tasks. She clicks "Create project" and is redirected to the dashboard, which now shows her project with a progress bar, the tasks she added, and a prominent "Start timer" button next to the first task.

**Expected duration:** 60-120 seconds.

**Success confirmation:** Upon project creation, a brief celebratory animation plays (confetti, lasting 1.5 seconds — not longer, as it becomes annoying on repeat). A dismissible tooltip points to the timer button with the text "Click here to start tracking time on your first task." The onboarding is now complete, and all subsequent guidance happens through contextual tooltips that appear on first encounter with each feature.
