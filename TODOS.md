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

### iFax webhook implementation
- **What:** Implement `faxWebhook.ts` to handle iFax postflight and receive webhook callbacks.
- **Why:** iFax sends postflight webhooks on fax completion (success or failure) and receive callbacks for inbound faxes. Without handling these, `morningGists.delivery.status` stays `'queued'` indefinitely.
- **Implementation:** iFax webhooks retry up to 5 times with exponential backoff (5 min → 60 min). Implement endpoint to receive callbacks, validate the request, extract job status, and update `delivery.status` to `'delivered'` or `'failed'`. Use `delivery.ifaxJobId` for correlation.
- **Priority:** P0 — do this before going live with fax delivery.
- **Depends on:** Nothing — iFax API docs available at https://www.ifaxapp.com/docs/api/v1.

### Stripe billing gate for fax delivery
- **What:** The `plan` field on the Firestore user doc is server-only (locked by Firestore rules), but plan assignment is still manual via Admin SDK. Before external paying users, Stripe subscription status should be verified before enabling fax delivery.
- **Why:** Without Stripe validation, there's no guarantee a user's `plan: 'print'` reflects an active paid subscription. Prevents accidental free fax delivery.
- **Implementation:** Add a Stripe subscription check in `generateMorningGistForUser()` before the fax delivery path. Use `stripe.subscriptions.retrieve()` with the user's `stripeSubscriptionId`. Only proceed if status is `'active'`.
- **Priority:** P1 — required before bar owner invite.
- **Depends on:** Stripe integration (not yet built). See payments + gating in notes.md.

### iFax webhook no-callback timeout
- **What:** If iFax never sends a delivery callback (outage, misconfigured webhook URL), `morningGists.delivery.status` stays `'queued'` indefinitely. Users see perpetual "queued" status in the UI.
- **Why:** Closed feedback loop matters for trust. Users should know if their fax didn't arrive.
- **Implementation:** Add a daily Cloud Scheduler job that scans for `morningGists` docs with `delivery.status === 'queued'` and `createdAt` older than 1 hour. Mark those as `'unconfirmed'`, log a warning. User sees "Unconfirmed — check your fax machine" in the UI. Can also use iFax's `POST /customer/fax-status` endpoint to poll job status as a fallback.
- **Priority:** P2 — needed before external users, not MVP blocker.
- **Depends on:** Fax delivery working (webhook infrastructure in place).

## Completed

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
