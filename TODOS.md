# TODOS

Forward-looking items only. See [CHANGELOG.md](./CHANGELOG.md) for what's already shipped.

## Active

### Per-user delivery time (timezone-aware scheduling)
- **What:** Scheduler currently runs at hardcoded 7am ET for all users. Users in other timezones get the wrong time.
- **Why:** Required once any user outside ET onboards. A bar owner in LA would currently receive at 4am.
- **Implementation:** Change schedule to `*/15 * * * *`. In the scheduler body, check each user's `prefs.timezone` and `delivery.schedule.hour`. Skip users whose delivery window hasn't arrived yet. `UserDoc.delivery.schedule` fields already exist.
- **Depends on:** Stable daily email delivery working first (7-day self-validation).

### Email feedback loop (action card accuracy measurement)
- **What:** No way to measure if Action email cards are accurate. Success criterion "≥70% accuracy" is unmeasurable today.
- **Why:** Closes the categorization feedback loop. Real signal to improve prompt tuning over time.
- **Implementation:** Add a thumbs-up/thumbs-down link in email footer per email card. Link triggers a Cloud Function that writes a feedback doc to Firestore (`users/{uid}/emailFeedback/{cardId}`). Review weekly.
- **Depends on:** Working email delivery first.

### Domain setup for email delivery (mygist.app) — BLOCKING
- **What:** Email is currently sent from `onboarding@resend.dev` (Resend's dev address). Need to configure the real sending domain so emails arrive from `morning@mygist.app`.
- **Why:** Resend's default domain only allows sending to your own verified address — can't use it for external users. SPF/DKIM records also improve inbox placement.
- **Urgency:** A new external user was onboarded 2026-05-27 and will not receive any Gist emails until this is done. Every day of delay is a day of broken delivery for that user.
- **Implementation:**
  1. In Resend dashboard: add `mygist.app` as a sending domain
  2. Add the SPF and DKIM DNS records Resend provides to your domain registrar
  3. Wait 24-48h for DNS propagation, verify in Resend dashboard
  4. Set the `GIST_FROM_ADDRESS` Firebase secret to `Gist <morning@mygist.app>` (overrides the `onboarding@resend.dev` default in `functions/src/integrations/emailDelivery.ts`)
  5. Send 10 test emails to Gmail, Apple Mail, and Outlook — confirm inbox placement before inviting external users
- **Depends on:** Nothing blocking — do this first.
