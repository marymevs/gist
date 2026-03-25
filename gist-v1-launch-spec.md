# Gist v1 Launch Spec

Date: February 23, 2026
Owner: Mary
Target launch: March 5, 2026 (preferred)
Latest acceptable: March 9, 2026 (two-week mark)

## Summary
Launch a friends-and-family v1 of Gist in ~2 weeks. The launch must include:
- Morning gists
- Evening gists
- Fax loop
- AI agent loop

The friends-and-family build must be referable: invited users can share access with their own friends and family, within controlled limits.

## Goals
- Deliver a daily morning gist that feels complete and reliably arrives (web and/or fax).
- Deliver an evening gist that closes the loop (reflection, planning, setup for tomorrow).
- Provide a working fax delivery pipeline with logging and retry.
- Provide an AI agent loop that runs daily and feeds both morning and evening gists.
- Enable a friends-and-family onboarding flow with referable invites.

## Non-goals (v1)
- Paid plans or billing enforcement.
- Full public launch or scalable marketing funnels.
- Extensive personalization beyond baseline preferences.
- High-volume deliverability guarantees.

## Launch Audience
- Friends and family cohort (target 20-50 users).
- Each invited user gets a shareable invite link with limited referrals.

## Success Criteria
- 90%+ morning gist deliveries succeed on the first attempt.
- 95%+ of faxes are delivered within the target delivery window.
- 50%+ of invited users complete onboarding and receive at least one gist.
- 30%+ of invited users return for a second day.
- At least 10 qualitative feedback responses collected by March 12, 2026.

## Product Requirements

### 1) Morning Gists
**User story**: As a user, I receive a morning briefing that is concise, useful, and visible in the UI and optionally on paper.

**Requirements**
- Generate a morning gist per user per day (date-keyed, timezone-aware).
- Include:
  - Weather summary
  - Calendar highlights
  - World/news highlights
  - Gist bullets and “one thing”
- Render in web UI (Today page). ✅
- Today page visually matches newspaper/fax mockup; Print button calls `window.print()` directly (Cmd+P → letter output). ✅ PR #19
- Optional fax delivery (Phaxio — HTML uploaded directly, no PDF conversion):
  - Gist HTML → Phaxio render → fax send
  - Log delivery status
- Delivery logs visible to the user. ✅

**Acceptance criteria**
- A logged-in user can see today’s morning gist on the web UI.
- Delivery logs show last 4 deliveries with status and timestamp.
- Faxed gists produce a PDF and register a delivery status.

### 2) Evening Gists
**User story**: As a user, I receive an evening briefing that helps me close the day and set up tomorrow.

**Requirements**
- Generate an evening gist per user per day (date-keyed).
- Include:
  - Reflections or prompts
  - Tomorrow’s focus setup or plan
  - Optional follow-ups from morning
- Render in web UI (Evening page).
- Optional fax delivery (same loop as morning).

**Acceptance criteria**
- A logged-in user can see today’s evening gist on the web UI.
- Evening gist generation is isolated from morning gist logic.

### 3) Fax Loop
**User story**: As a user, I can receive gists by fax reliably.

**Requirements**
- HTML-to-fax pipeline via Phaxio (Phaxio renders HTML server-side — no PDF conversion needed). ✅ PR #18
- Fax API integration with queued, delivered, failed statuses. ✅ PR #18 (scheduler side; webhook deferred to next sprint)
- Delivery logs written per send attempt. ✅ PR #18
- Retries for failed sends (at least 1 retry). ✅ PR #18 (retries once on 5xx/network errors)
- Manual resend option (admin or user UI). ⏳ Not yet built

**Acceptance criteria**
- Every fax send produces a delivery log with status and timestamp. ✅
- Failed sends trigger a retry with a second log. ✅

### 4) AI Agent Loop
**User story**: As the system, I run daily agent tasks that prepare content for morning and evening gists.

**Requirements**
- Daily scheduled task(s) that run with Cloud Scheduler/Functions.
- Clear separation of agent tasks (data gathering, summarization, planning).
- Writes outputs to Firestore models for morning/evening gists.
- Logs execution status and failures.

**Acceptance criteria**
- Agent loop runs daily for active users with a success log.
- Errors are logged with enough context to debug.

### 5) Friends-and-Family + Referable Invites
**User story**: As a founding user, I can invite friends and family, and they can invite their own friends and family within limits.

**Requirements**
- Invite link or code tied to a user.
- Each invite grants limited downstream referrals (e.g., 3 per person).
- Track:
  - who invited whom
  - activation status
  - last active date
- Basic abuse control (cap invites per user).

**Acceptance criteria**
- A user can share a link or code that onboards a new user.
- New user’s inviter is recorded and visible in admin.

## Technical Requirements

### Data Models (min)
- `morningGist` and `eveningGist` models per user/date.
- `deliveryLog` with status, method, pages, timestamps.
- `invite` model with inviter, invitee, code, status.
- `agentTask` or `agentRun` model for daily loop status.

### Scheduling & Reliability
- Cloud Scheduler or equivalent to trigger daily generation.
- Idempotent gist generation (safe to rerun).
- Retries for transient failures (fax and agents).

### Observability
- Structured logs for:
  - gist generation success/failure
  - fax send attempts
  - agent loop start/end
- Optional alert on error spikes.

## UX/Flows

### Onboarding
1. Accept invite
2. Create account
3. Choose delivery method (web / fax)
4. Connect calendar (if enabled)
5. Confirm timezone
6. Confirm start date

### Daily Flow
- Morning gist delivered before the user’s desired time.
- Evening gist delivered after a set evening time.
- Delivery status visible in the Today view.

## Launch Plan (Two-Week Sprint)

### Week 1: Feb 23 – Mar 1, 2026
- Morning gist generation stable and timezone-safe.
- Evening gist generation MVP.
- Fax loop working end-to-end with logging.
- Invite model and onboarding path.
- Agent loop MVP with logs.

### Week 2: Mar 2 – Mar 5, 2026
- Fixes and polish.
- Reliability improvements (retry, idempotency).
- Basic admin visibility (invites and deliveries).
- Friends-and-family test readiness.

### Buffer: Mar 6 – Mar 9, 2026
- Launch slips if needed.
- Fix critical bugs only.

## Risks & Mitigations
- **Fax API failures**: add retries and clear error logs.
- **Calendar integration failures**: require re-auth and degrade gracefully.
- **Low activation**: tighten onboarding and reduce steps.
- **Agent errors**: fall back to templated content.

## Open Questions
- What limits for referral invites per user?
- Default delivery time windows?
- Minimum gist content when data is missing?
- Do we ship a manual resend UI now or admin-only?

## Decisions Needed This Week
- Referral invite cap (e.g., 3 per user).
- ~~Fax API provider and delivery SLA.~~ **Decided: Phaxio (HTML-to-fax, HMAC-SHA256 webhooks).**
- Preferred “evening time” default.

## Security & Data Access (v1)
**Goals**: Keep production user data private from devs, minimize PII exposure, and enforce least-privilege access.

**Environment separation**  
- Separate Firebase projects for staging and production.  
- Staging uses synthetic or scrubbed data only.  
- Developers work in staging by default; production access is restricted.

**Access control**  
- Firestore rules enforce per-user access by default.  
- Admin access is limited to a small, explicitly named group.  
- Use role-based claims for any admin views in the app.

**PII minimization**  
- Store only derived calendar data when possible (not raw event bodies).  
- Encrypt OAuth refresh tokens at rest and never log them.  
- Redact PII in logs and error reports.

**Operational safeguards**  
- Audit who has production access in Firebase Console and GCP IAM.  
- Use separate deploy credentials for staging vs production.  
- Add a basic security checklist before launch (rules reviewed, access list reviewed, logging redaction verified).
