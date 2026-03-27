# TODOS

## Active

### Per-user delivery time (timezone-aware scheduling)
- **What:** Scheduler currently runs at hardcoded 7am EST for all users. Users in other timezones get the wrong time.
- **Why:** Required once any user outside EST onboards. A bar owner in LA would currently receive at 4am.
- **Implementation:** Change schedule to `*/15 * * * *`. In the scheduler body, check each user's `prefs.timezone` and `delivery.schedule.hour`. Skip users whose delivery window hasn't arrived yet. `UserDoc.delivery.schedule` fields already exist.
- **Depends on:** Stable daily email delivery working first (7-day self-validation).

### Email feedback loop (action card accuracy measurement)
- **What:** No way to measure if Action email cards are accurate. Success criterion "≥70% accuracy" is unmeasurable today.
- **Why:** Closes the categorization feedback loop. Real signal to improve prompt tuning over time.
- **Implementation:** Add a thumbs-up/thumbs-down link in email footer per email card. Link triggers a Cloud Function that writes a feedback doc to Firestore (`users/{uid}/emailFeedback/{cardId}`). Review weekly.
- **Depends on:** Working email delivery first.

### Domain setup for email delivery (mygist.app)
- **What:** Email is currently sent from `onboarding@resend.dev` (Resend's dev address). Need to configure the real sending domain so emails arrive from `morning@mygist.app`.
- **Why:** Resend's default domain only allows sending to your own verified address — can't use it for external users. SPF/DKIM records also improve inbox placement.
- **Implementation:**
  1. In Resend dashboard: add `mygist.app` as a sending domain
  2. Add the SPF and DKIM DNS records Resend provides to your domain registrar
  3. Wait 24-48h for DNS propagation, verify in Resend dashboard
  4. Update `FROM_ADDRESS` in `functions/src/integrations/emailDelivery.ts` from `onboarding@resend.dev` to `Gist <morning@mygist.app>`
  5. Send 10 test emails to Gmail, Apple Mail, and Outlook — confirm inbox placement before inviting external users
- **Depends on:** Nothing blocking — can be done any time before external user invites.


### Phaxio webhook no-callback timeout
- **What:** If Phaxio never sends a delivery callback (outage, misconfigured webhook URL), `morningGists.delivery.status` stays `'queued'` indefinitely. Users see perpetual "queued" status in the UI.
- **Why:** Closed feedback loop matters for trust. Users should know if their fax didn't arrive.
- **Implementation:** Add a daily Cloud Scheduler job that scans for `morningGists` docs with `delivery.status === 'queued'` and `createdAt` older than 1 hour. Mark those as `'unconfirmed'`, log a warning. User sees "Unconfirmed — check your fax machine" in the UI.
- **Priority:** P2 — needed before external users, not MVP blocker.
- **Depends on:** Fax delivery working (webhook infrastructure in place).


### Anthropic vs OpenAI evaluation
- **What:** Compare Anthropic (Claude) vs OpenAI for gist generation and email categorization. Evaluate: cost per API call, output quality on existing prompts, SDK ergonomics (Anthropic SDK vs OpenAI SDK in Node.js).
- **Why:** Founder wants to evaluate switching AI providers before Tier 2 agent work. Decision affects all AI-generated content and agent execution costs.
- **Implementation:** Run existing prompts through both APIs. Compare output quality, latency, and per-call cost. Document findings in a comparison doc.
- **Priority:** P2 — needed before Tier 2 agent work, not blocking Tier 1.
- **Depends on:** Nothing. Research task.

### Tier 2 fax cost modeling
- **What:** Model the full per-user cost of the 4-leg fax loop (outbound morning fax + inbound marked-up fax + outbound confirmation fax + inbound confirmation fax). Include Phaxio per-page costs + AI API costs for OCR/action parsing.
- **Why:** At $25/mo Tier 2 pricing, the 4-leg loop may cost $8-17/mo in raw Phaxio fees alone. Must confirm margins are positive before committing to Tier 2 pricing.
- **Implementation:** Get exact Phaxio pricing for inbound + outbound faxes per page. Model daily cost at 1, 2, and 3 pages per fax. Add AI API cost estimates. Determine minimum viable Tier 2 price.
- **Priority:** P1 — must resolve before building Tier 2.
- **Depends on:** Phaxio pricing confirmation.

### Evening gist MVP
- **What:** Evening briefing that closes the day — reflection prompts, tomorrow's focus, follow-ups from morning. Evening page scaffold already exists in `src/app/features/evening/`.
- **Why:** Listed in v1 launch spec as a requirement. Closes the daily loop. But design doc defers to "after 30 days of reliable morning delivery."
- **Implementation:** New Cloud Function `generateEveningGist`, new Firestore collection, reuse existing template patterns.
- **Priority:** P3 — deferred until 30 days of reliable morning delivery validates the morning loop.
- **Depends on:** Tier 1 morning delivery stable for 30 days.


### Referral invite system
- **What:** Invite link or code tied to a user. Each invite grants limited downstream referrals (e.g., 3 per person). Track who invited whom, activation status, last active date.
- **Why:** Listed in v1 launch spec. How the bar owner invites other bar owners. Word-of-mouth channel.
- **Implementation:** `invites` Firestore collection, invite code generation, onboarding flow integration, admin visibility.
- **Priority:** P3 — build after bar owner validates Tier 1 demand.
- **Depends on:** Bar owner using the product for at least 1 week.

## Completed

### Phaxio webhook signature validation + faxWebhook.ts
- **What:** Implemented HMAC-SHA256 signature verification for Phaxio v2.1 webhook callbacks. `faxWebhook.ts` validates each callback, writes delivery status to Firestore `deliveryLogs`, and handles idempotency.
- **Completed:** v0.1.0.0 (2026-03-27)

### Stripe billing gate for fax delivery
- **What:** Stripe subscription checkout, webhook handler for payment lifecycle (paid, failed, canceled), and fail-open billing gate cached in Firestore. Prevents fax delivery to non-paying users.
- **Completed:** v0.1.0.0 (2026-03-27)

### Fax idempotency guard (prevent duplicate faxes)
- **What:** Writes `delivery.status: 'paused'` to the morningGist doc before sending payment-paused notifications. The existing idempotency check (`delivery.status !== undefined`) then prevents same-day re-runs from re-notifying. Combined with `delivery.status: 'queued'` written at fax-send time.
- **Completed:** v0.1.0.0 (2026-03-27)

### Formalize DESIGN.md
- **What:** DESIGN.md at repo root documents the full CSS design system: color tokens, typography scale, spacing, component patterns, responsive breakpoints, dark mode.
- **Completed:** PR #21 (2026-03-25)

### PDF download for web plan users (Print → newspaper layout)
- **What:** Once `faxTemplate.ts` exists as a print-first HTML template, offer a "Print" button on the Today page for all users.
- **Why:** Delight feature — web users who want to print their Gist manually get a clean print layout. Reuses the fax template at zero marginal cost.
- **Implementation:** Today page redesigned to visually match the newspaper/fax mockup — warm newsprint background, white paper card (max-width 680px), Georgia serif typography. `window.print()` from the web page produces the same layout directly. `@media print` hides chrome (toolbar, sidebar) and renders full-width paper. The `generateGistPrint` Cloud Function remains for fax delivery.
- **Completed:** PR #19 (2026-03-25)

### Firestore security rules
- **What:** Current rules are `allow read, write` with no auth check. All user data (Gmail snippets, calendar items, email subjects) is publicly readable.
- **Why:** Must be fixed before inviting any external user. morningGists contains sensitive personal data.
- **Implementation:** Lock down all collections to `request.auth.uid == resource.data.userId` or equivalent ownership check. Test with emulator before deploy.
- **Completed:** PR #16
