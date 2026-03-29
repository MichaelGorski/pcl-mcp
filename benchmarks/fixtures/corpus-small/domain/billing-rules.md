---
id: billing-rules
critical: true
title: "Billing & Payment Rules"
---

## Overview

These are non-negotiable business rules governing all billing and payment operations in TaskPilot. Every engineer working on billing, subscription, payment, or plan-related code MUST read and follow these rules. Violations can result in legal liability, chargebacks, and loss of payment processing capability.

## Rule 1: Explicit Consent Required

Never charge a user without explicit consent. Every payment action must require:
- A visible confirmation modal showing the exact amount to be charged
- A clear "Confirm Payment" button (not just a form submission)
- The billing email address displayed in the confirmation
- For recurring charges, explicitly state "You will be charged $X/month"

This applies to: initial subscription, plan upgrades, add-ons, and any one-time charges.

## Rule 2: Stripe-Only Payment Processing

All billing operations MUST go through Stripe. Specifically:
- **Never** store credit card numbers, CVVs, or full card details in our database
- **Never** build custom payment forms that touch raw card data — use Stripe Elements or Checkout
- All subscription management (create, update, cancel) goes through the Stripe Subscriptions API
- Webhook endpoint (`/api/webhooks/stripe`) handles all asynchronous billing events
- Use Stripe's idempotency keys for all mutating API calls to prevent double charges

The only billing data we store locally: Stripe customer ID, subscription ID, plan tier, and billing period dates.

## Rule 3: Downgrade Timing

Plan downgrades take effect at the end of the current billing period, not immediately.
- When a user requests a downgrade, set `cancel_at_period_end` on the Stripe subscription
- Continue providing the current plan's features until the period expires
- Send a confirmation email with the effective date of the downgrade
- On the effective date, apply new plan limits (e.g., project count for free tier)
- Never prorate downward — the user has already paid for the full period

## Rule 4: Free Tier Limits

Free tier users can create a maximum of 3 active projects.
- Archived projects do not count toward the limit
- If a user downgrades to free tier with more than 3 projects, allow them to choose which 3 to keep active — archive the rest automatically but do not delete any data
- Show a clear upgrade prompt when the limit is reached
- API must enforce this limit server-side (not just UI validation)

## Rule 5: Refund Policy

Refunds must be processed within 48 hours of the refund request.
- Refunds are processed through Stripe Refunds API only
- Full refund for the current billing period
- No partial refunds (simplifies accounting)
- After refund, immediately downgrade to free tier
- Send confirmation email with refund amount and expected bank processing time (5-10 business days)
- Log all refund events in the audit trail

## Rule 6: Trial Period

The trial period is exactly 14 days from account creation. No exceptions.
- Trial includes all features of the Pro plan
- No credit card required to start trial
- Send reminder emails at: day 10, day 12, day 13 (last day)
- On day 14: automatically downgrade to free tier limits
- Trial extensions require VP-level approval (manual database flag, not a code path)
- Never build "extend trial" functionality in the application — this is an intentional policy constraint

## Rule 7: Discount Policy

Annual plans receive a 20% discount compared to monthly billing (built into Stripe pricing).
- No other discounts may be applied without written approval from the finance team
- Coupon codes: only valid coupons created in Stripe Dashboard may be redeemed
- Never create coupon codes programmatically — they are a business decision, not a feature
- Student/nonprofit discounts: handled manually through support, not through automated flows
- No stacking of discounts (one coupon per subscription maximum)

## Enforcement

All billing code must be reviewed by at least two engineers before merging. The billing module has CODEOWNERS protection. Automated tests must cover:
- Payment consent flow (modal shown before charge)
- Stripe API integration (mock Stripe in tests, not real API)
- Downgrade scheduling (verify `cancel_at_period_end` behavior)
- Free tier limit enforcement (server-side check)
- Refund processing window validation
- Trial period duration accuracy
