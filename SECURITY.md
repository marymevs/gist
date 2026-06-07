# Gist — Security & Data Handling

Status of issue #177 (encrypt data at rest / minimize owner-visible PII) and the
operational model that backs it. Written for the beta-onboarding bar.

## Threat model

The realistic threats for a small Firebase app onboarding beta users:

1. **Service-account key leak** — `gist-sa.json` lives on a laptop; if it leaks,
   the holder can read Firestore.
2. **Backup / export leak** — a Firestore export lands somewhere it shouldn't.
3. **Console snooping** — anyone with Firebase console read access browses data.

End-to-end ("owner literally cannot view PII") is **out of scope and not
achievable** with this architecture: Cloud Functions must read plaintext PII to
generate the brief and send email, and whoever controls the project controls the
keys. The achievable production bar is: **the crown-jewel secrets are ciphertext
at rest**, so a backup/console/read-credential leak yields nothing usable, and
PII access is documented and minimized.

## Data classification

| Class | Data | At-rest protection |
|-------|------|--------------------|
| **RESTRICTED** | OAuth access/refresh/id tokens (`users/{uid}/integrations/*`) | **AES-256-GCM encrypted** (issue #177). Never client-readable (rules `if false`). |
| **RESTRICTED** | Gist personal-data fields in `users/{uid}/morningGists/*` — `newspaper` (the full Claude-generated brief: lede, schedule, email summaries, people), `dayItems` (calendar), `emailCards` (inbox), `firstEvent` (a calendar title) | **AES-256-GCM encrypted** (issue #177). Server-only; the browser renders `renderedHtml` and reads only two cosmetic `newspaper` fields (location/deliveryTime) as fallbacks it already prefers from prefs/schedule — so encryption is invisible to the UI. `newspaper` is the richest PII payload. |
| **CONFIDENTIAL** | `profile.context`, `prefs.importantPeople`, `executiveFunctionStatus`, `renderedHtml`, `worldItems` (news) | Plaintext at rest. `worldItems` is public news (not PII). The others are **read back by the browser**, so encrypting would require a decrypting-function read proxy (deferred — see below). Note: `renderedHtml` still contains the calendar/email content as rendered HTML; it's an opaque blob (not an accidental-read vector in the console), so it was left plaintext. Protected by per-uid Firestore rules. |
| **CONFIDENTIAL** | API keys (Anthropic, Resend, Google, WeatherAPI, field-encryption key, feedback-link key) | Firebase **Secret Manager**; never in code or git. |
| **INTERNAL** | Cloud Functions logs | Avoid logging token values or raw PII (current code logs uids/dates only). |

### What is encrypted vs. left plaintext, and why

The goal is concrete: **the owner pokes around Firestore regularly and must not
accidentally read user PII.** Encryption-at-rest delivers exactly that — the
console shows `enc:v1:…`, so reading requires a deliberate decrypt, not a glance.

- **Encrypted:** the structured personal-data fields — OAuth tokens, plus a gist's
  `dayItems` (calendar) and `emailCards` (inbox). These are clean, glanceable
  fields *and* server-only, so encrypting them is both high-value and zero-risk.
  As new integrations land that pull personal data, their fields get the same
  treatment.
- **Left plaintext:**
  - `worldItems` (news) and weather — public, not PII.
  - `profile.context`, `importantPeople`, `executiveFunctionStatus` — owner chose
    to keep these readable; they're user self-descriptions, not synthesized from
    third-party accounts.
  - `renderedHtml` — the browser renders it directly on `/today`, so encrypting it
    would need a decrypting read-proxy + Firestore lockdown (a data-flow rewire).
    It contains the same calendar/email content, but as one opaque HTML blob it
    isn't an accidental-read vector when browsing the console. Deferred.

If the bar later rises to "encrypt everything the browser shows," the path is a
decrypting callable for `renderedHtml` (the rest of the brief follows the same
pattern).

## What is encrypted (issue #177)

- **OAuth tokens** are encrypted with AES-256-GCM before every Firestore write
  (initial OAuth exchange and token refresh) and decrypted on read.
  - Helper: `functions/src/crypto/fieldCrypto.ts` (wire format
    `enc:v1:<iv>:<tag>:<ciphertext>`, all base64).
  - Key: `FIELD_ENCRYPTION_KEY` secret (32-byte base64). Decryption passes
    legacy plaintext through unchanged, so rollout is non-breaking.
- **Gist personal-data fields** (`newspaper`, `dayItems`, `emailCards`,
  `firstEvent`) are encrypted with the same key before the gist doc is written —
  `newspaper` holds the richest PII (the full generated brief). The in-memory
  copies used for email delivery + rendering stay plaintext, so encryption only
  affects data at rest. (`renderedHtml` — the HTML render — is left plaintext as
  an opaque, non-glanceable blob; see the rationale above.)
- **Gist retention (data minimization)**: every gist is stamped with `expireAt`
  (generation + 7 days). A Firestore TTL policy on the `morningGists` collection
  group auto-deletes expired docs, so personal data at rest is bounded to the last
  ~7 days instead of accumulating forever. Encrypted while alive, gone after.
- **Email-feedback links** are HMAC-SHA256 signed (`FEEDBACK_LINK_SECRET`); the
  unauthenticated `/emailFeedback` endpoint rejects unsigned/forged links so
  feedback can't be forged for an arbitrary uid (memory-poisoning).
  - Helper: `functions/src/crypto/feedbackLink.ts`.

## Reading encrypted data on purpose

Encryption is reversible (AES-GCM, not a hash) — with the key you can always read
the data. `scripts/decrypt-field.ts` (read-only) is the deliberate-access tool:

```bash
export FIELD_ENCRYPTION_KEY="<base64 key>"   # same value as the secret
# Decrypt one value pasted from the console (no DB access needed):
npx tsx scripts/decrypt-field.ts 'enc:v1:...'
# Decrypt every encrypted field in a doc:
npx tsx scripts/decrypt-field.ts --doc users/UID/integrations/gmail
npx tsx scripts/decrypt-field.ts --doc users/UID/morningGists/2026-06-07
```

It requires the key, so it isn't a backdoor: reading needs both the
service-account creds *and* `FIELD_ENCRYPTION_KEY` (two separate doors). This is
the "deliberate, not accidental" path — you won't read PII by browsing, but you
can when you mean to.

## Operational hardening checklist (Finding 2 + ongoing)

- [ ] **Service-account key**: store `gist-sa.json` only in `~/.firebase-keys/`
      (already gitignored via `/scripts` + `.env` rules); never commit. Rotate if
      it has ever been shared. Prefer `gcloud auth application-default login` over
      a long-lived key file where possible.
- [ ] **Console IAM**: keep Firebase/GCP console access to the owner only; grant
      least privilege (Viewer, not Editor/Owner) to any future collaborator.
- [ ] **Secrets**: `FIELD_ENCRYPTION_KEY` and `FEEDBACK_LINK_SECRET` live in
      Secret Manager; never echo them into logs or commit them.
- [ ] **Retention**: document how long morning gists are kept; prune old
      `morningGists` if not needed (reduces the PII blast radius of any leak).
- [ ] **Dependencies**: re-run `npm audit --omit=dev` in `functions/` before each
      deploy; keep `firebase-admin` / `firebase-functions` current.

## Deploy / rollout runbook (#177)

Run from the repo root. The decrypt-on-read passthrough makes ordering safe —
the app keeps working with legacy plaintext tokens until the migration runs.

```bash
# 1. Generate the two secrets (32-byte base64 each). Keep the values safe.
openssl rand -base64 32        # -> FIELD_ENCRYPTION_KEY value
openssl rand -base64 32        # -> FEEDBACK_LINK_SECRET value

# 2. Store them in Secret Manager (paste each value when prompted):
firebase functions:secrets:set FIELD_ENCRYPTION_KEY
firebase functions:secrets:set FEEDBACK_LINK_SECRET

# 3. Deploy the functions (new tokens now written encrypted):
cd functions && npm run build && npm test && cd ..
firebase deploy --only functions

# 4. Pause the scheduler, migrate the 5 existing token docs, resume.
gcloud scheduler jobs pause firebase-schedule-generateMorningGist-us-central1 \
  --location us-central1
export FIELD_ENCRYPTION_KEY="<the same base64 value from step 1>"
# Tokens:
npx tsx scripts/migrate-encrypt-tokens.ts            # dry run
npx tsx scripts/migrate-encrypt-tokens.ts --apply    # write
# Existing gists (dayItems / emailCards):
npx tsx scripts/migrate-encrypt-gists.ts             # dry run
npx tsx scripts/migrate-encrypt-gists.ts --apply     # write
# Enforce 7-day retention on the backlog (DELETES gists older than 7 days,
# stamps recent ones with expireAt). ⚠️ destructive — dry-run first.
npx tsx scripts/enforce-gist-retention.ts            # dry run
npx tsx scripts/enforce-gist-retention.ts --apply    # delete + stamp
gcloud scheduler jobs resume firebase-schedule-generateMorningGist-us-central1 \
  --location us-central1

# 5. Enable the Firestore TTL policy so future gists auto-delete at expireAt:
gcloud firestore fields ttls update expireAt \
  --collection-group=morningGists --enable-ttl --project=gist-ab4e8

# 6. Verify in the console: integration docs show enc:v1:… for token fields,
#    morningGists show enc:v1:… for dayItems / emailCards, carry an expireAt,
#    and nothing older than 7 days remains.
```

## Audit trail

`/cso` security reports are saved (locally, gitignored) under
`.gstack/security-reports/`. Latest: `2026-06-07-151249.json`.
