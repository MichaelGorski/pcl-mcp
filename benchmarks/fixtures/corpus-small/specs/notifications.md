---
id: "notifications"
title: "Notification System"
status: "in-progress"
acceptance_criteria:
  - "Support email, in-app, and browser push as three independent delivery channels"
  - "Users can configure per-channel preferences for each notification event type from a settings page"
  - "Batch digest mode must be available with configurable frequency of real-time, daily summary, or weekly summary"
  - "The system must enforce a hard limit of 50 outbound emails per day per user to prevent spam complaints"
  - "Every email notification must include a one-click unsubscribe link compliant with RFC 8058 that works without login"
  - "In-app notifications must load within 500ms of clicking the bell icon and support cursor-based pagination"
  - "Notification preferences must sync across devices within 5 seconds of being changed"
  - "The system must support notification templates that can be updated without a code deployment"
out_of_scope:
  - "SMS notifications — deferred pending cost analysis and user demand validation"
  - "Slack or Microsoft Teams integration for notifications — planned as a separate integration spec"
  - "AI-powered notification prioritization or smart bundling — considered for v2"
  - "Custom notification sounds or visual themes"
  - "Notification analytics dashboard for admins"
---

# Notification System Specification

The notification system is a cross-cutting concern that touches nearly every feature in TaskPilot. When a task is assigned, a deadline approaches, a timer is stopped, a client comments on a project, or a team member completes a milestone, the relevant users need to be informed through their preferred channel. The system must balance thoroughness (never miss an important event) with restraint (never annoy the user with irrelevant noise).

## Design Philosophy

The notification system follows the principle of "progressive disclosure of urgency." Not all events are equal, and the notification channel should match the urgency of the event. A task being overdue by 24 hours warrants an email and a push notification. A team member completing a routine task warrants an in-app notification only. A weekly project summary is sent as a digest email, not as 15 individual notifications about each task that was completed during the week.

Every notification type in the system is categorized into one of three urgency tiers. Tier 1 (Urgent) covers events that require immediate action, such as a deadline being missed, a payment failing, or a security alert. These default to all channels enabled. Tier 2 (Important) covers events that are valuable to know about soon, such as task assignments, comments on your work, or milestone completions. These default to in-app and email enabled. Tier 3 (Informational) covers events that are nice to know, such as a team member joining the workspace, a project being archived, or a weekly summary. These default to in-app only.

## Event Types

The notification system handles the following event types at launch.

Task Events include task_assigned, task_completed, task_overdue, task_commented, and task_deadline_approaching (triggered 24 hours before deadline). These are the highest-volume notification types and the most likely to cause notification fatigue if not managed properly.

Project Events include project_milestone_reached, project_deadline_approaching, project_completed, and project_member_added. These are lower volume but higher signal — a milestone being reached is always worth knowing about.

Time Tracking Events include timer_running_long (triggered after 8 hours of continuous tracking, as this likely indicates a forgotten timer) and weekly_time_summary. The long-running timer alert is one of the most appreciated notifications based on beta feedback, as it prevents billing errors.

Billing Events include invoice_generated, payment_received, payment_failed, and subscription_expiring. These are always Tier 1 regardless of user preferences — billing events cannot be silenced, only the channel can be changed.

System Events include workspace_invitation, password_changed, new_device_login, and data_export_ready. Security-related events (password changed, new device) are always sent via email regardless of preferences, as a security measure.

## Architecture

The notification system is built as an event-driven pipeline with three stages.

Event Ingestion handles the initial capture. All notification-triggering events are published to a Supabase Realtime channel (notifications:workspace_id). A serverless function (deployed as a Supabase Edge Function) subscribes to these events and writes them to a notifications table in the database.

Processing applies user preferences and rate limits. A background job runs every 60 seconds to process pending notifications. For each notification, it checks the recipient's preferences to determine which channels are enabled for this event type, whether the user is in digest mode, and whether the daily email limit has been reached. If the user is in digest mode, the notification is marked as "batched" and grouped into the next digest. If the user has exceeded the daily email limit, the notification is downgraded to in-app only and a warning is logged.

Delivery dispatches to channels. Processed notifications are sent to their respective channels. Email delivery uses Resend (primary) with SendGrid as a fallback. In-app notifications are written to a user-specific Realtime channel and stored in the database for persistence. Browser push notifications use the Web Push API with VAPID keys stored in Supabase secrets.

## Email Rate Limiting

The 50 emails per day per user limit is a hard constraint driven by email deliverability best practices. Exceeding this threshold risks TaskPilot's sender reputation being degraded by major email providers, which would affect all users. The limit is enforced at the processing stage, not the delivery stage, so the system fails gracefully. Excess notifications are silently downgraded to in-app rather than queued for later email delivery.

The daily counter resets at midnight UTC. A sliding window counter (using Supabase's built-in cache or an external Upstash Redis instance) tracks per-user email counts with a TTL of 24 hours. If the counter is unavailable, the system falls back to a database count query (slower but acceptable given the low frequency of this edge case).

## Digest Mode

Users who select daily or weekly digest mode receive a single email summarizing all notifications from the period. The digest email is organized by project, with each project section showing a bullet list of events sorted by recency. The digest is generated by a scheduled CRON job (daily at 9:00 AM in the user's timezone, weekly on Monday at 9:00 AM). The email template uses MJML for cross-client compatibility and includes a "View in TaskPilot" button that deep-links to the notification center.

Digest mode has one exception: Tier 1 (Urgent) notifications are never batched. If a payment fails or a deadline is missed, the user receives an immediate notification even if they are in digest mode. This ensures that critical events are never delayed by up to seven days for weekly digest users.

## Unsubscribe Mechanism

Every email includes a List-Unsubscribe header (RFC 2369) and a visible unsubscribe link in the footer. Clicking the link takes the user to a preferences page where they can disable that specific notification type for the email channel, disable all email notifications, or switch to digest mode. The unsubscribe action takes effect immediately — the system writes the preference change to the database and invalidates the in-memory preference cache within 5 seconds. This is a legal requirement under CAN-SPAM and GDPR, and non-compliance carries significant financial risk.
