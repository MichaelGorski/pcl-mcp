---
id: data-governance
critical: true
title: "Data Governance Rules"
---

## Overview

These rules govern how TaskPilot handles user data, privacy, and compliance. They are legally binding constraints that apply to every feature touching user data. Non-compliance can result in GDPR fines, loss of user trust, and legal action. Every engineer must read these rules before working on features that create, read, update, or delete user data.

## Rule 1: Data Residency

User data must not leave the Supabase project region.
- EU users: data stored in eu-west-1 (Ireland)
- US users: data stored in us-east-1 (Virginia)
- Region is determined at workspace creation time and cannot be changed
- Cross-region data transfer is prohibited — even for analytics or backups
- Third-party services (email, push notifications) may only receive the minimum data needed for delivery (email address for email, device token for push)

## Rule 2: Account Deletion (Soft Delete + Anonymization)

Account deletion must anonymize data, not hard-delete it.
- Replace all PII fields with anonymized values:
  - name → "Deleted User"
  - email → "deleted-{uuid}@anonymized.taskpilot.app"
  - avatar → default avatar
  - All custom profile fields → null
- Retain aggregated analytics data (project counts, feature usage metrics) with anonymized user reference
- Retain audit logs with anonymized user reference (required for compliance)
- Delete: API tokens, active sessions, notification preferences, connected OAuth tokens
- The deletion process must complete within 30 days of request (GDPR Article 17)
- Send confirmation email before anonymization begins
- Provide a 7-day grace period where the user can cancel the deletion

### Implementation Pattern for Account Deletion

The deletion service should follow this sequence:

1. **Verify eligibility**: Check the user has no pending invoices or active disputes
2. **Offer data export**: Check if the user has requested a data export; if not, prompt before proceeding
3. **Cancel billing**: Cancel any active Stripe subscription (`stripe.subscriptions.cancel()`)
4. **Start grace period**: Set `user.deletion_requested_at = now()` and `user.status = 'pending_deletion'`
5. **After 7-day grace period**: Execute anonymization:
   - Set `user.status = 'deleted'`
   - Replace `user.name` with `"Deleted User"`
   - Replace `user.email` with `"deleted-{uuid}@anonymized.taskpilot.app"`
   - Set `user.avatar_url = null`, clear all custom profile fields
   - Replace `user_id` references in audit logs with the anonymized ID (do NOT delete audit entries)
   - Preserve aggregated metrics (project counts, task counts) with anonymized user reference
6. **Revoke access**: Delete all sessions, API tokens, OAuth connections, and notification preferences
7. **Send confirmation**: Email the original address confirming account deletion is complete

## Rule 3: Encryption at Rest

All Personally Identifiable Information (PII) must be encrypted at rest.
- Supabase PostgreSQL uses AES-256 encryption at the storage layer (enabled by default)
- Application-level encryption required for: payment metadata, OAuth tokens, API keys
- Use the `pgcrypto` extension for application-level column encryption where needed
- Encryption keys managed through Supabase Vault, never hardcoded
- Backup files must also be encrypted (Supabase handles this for managed backups)

## Rule 4: Data Export

Data exports must be available within 24 hours of a user request (GDPR Article 20).
- Export format: JSON (primary) and CSV (for spreadsheet-compatible data)
- Export must include: projects, tasks, time entries, comments, files metadata
- Export must NOT include: other users' data, system logs, internal analytics
- Export is triggered via Settings → Privacy → "Export My Data" button
- Generates a downloadable ZIP file, available for 7 days via signed URL
- Notification sent when export is ready
- Rate limit: 1 export request per 24 hours per user

## Rule 5: Session Management

Session tokens expire after 30 days of inactivity.
- Active sessions (user makes a request) reset the 30-day timer
- Inactive sessions are automatically revoked
- Users can view and revoke active sessions from Settings → Security
- Maximum 10 concurrent sessions per user (oldest auto-revoked when exceeded)
- Session token is an opaque JWT managed by Supabase Auth
- Refresh token rotation: each refresh issues a new token and invalidates the old one
- On password change: all sessions except current are immediately revoked

## Rule 6: API Rate Limiting

API rate limit: 100 requests per minute per authenticated user.
- Rate limit applies to all API routes and Server Actions
- Rate limit is enforced at the edge (middleware), not at the application layer
- Exceeding the limit returns HTTP 429 with `Retry-After` header
- Unauthenticated endpoints (login, signup): 20 requests per minute per IP
- Webhook endpoints (Stripe, GitHub): exempt from user rate limits but have their own IP-based limits
- Rate limit headers included in every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Rule 7: Audit Logging

Audit log retention: minimum 90 days.
- All data mutations (create, update, delete) must generate an audit log entry
- Audit log fields: timestamp, user_id (anonymized if deleted), action, resource_type, resource_id, ip_address, user_agent
- Stored in a separate `audit_logs` table with append-only policy (no UPDATE or DELETE allowed)
- Audit logs are excluded from user data exports (internal compliance data)
- Accessible to workspace admins via Settings → Security → Audit Log
- Searchable by action type, user, resource, and date range

## Compliance Checklist

Before any PR touching user data is merged, verify:
- [ ] PII fields are encrypted at rest
- [ ] No cross-region data transfer
- [ ] Account deletion handles this data type correctly
- [ ] Data export includes this data type
- [ ] Audit log entry is generated for mutations
- [ ] Rate limiting is respected
- [ ] Session validation is performed server-side
