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
| **CONFIDENTIAL** | `profile.context`, `prefs.importantPeople`, `executiveFunctionStatus`, rendered gist bodies | Plaintext at rest — **read back by the browser**, so encrypting at rest would require routing every read through a decrypting function (rejected for the beta; see below). Protected by per-uid Firestore rules + access-path hardening. |
| **CONFIDENTIAL** | API keys (Anthropic, Resend, Google, WeatherAPI, field-encryption key, feedback-link key) | Firebase **Secret Manager**; never in code or git. |
| **INTERNAL** | Cloud Functions logs | Avoid logging token values or raw PII (current code logs uids/dates only). |

### Why client-displayed PII is not encrypted at rest

`profile.context`, the important-people list, and the rendered brief are read
directly by the browser to display the Account and Today screens. Encrypting them
at rest means the browser can no longer read them — every read/write would have to
be proxied through a decrypting Cloud Function and Firestore rules locked to block
direct field access. That is a re-architecture of the app's data flow (loses
real-time reads, touches onboarding/account/today + new callables) with real
breakage risk, for a 5-user beta. Decision (#177): **defer**. The tokens — the
only data whose leak enables external account takeover — are encrypted; the rest
is covered by access control + the operational hardening below.

If/when the user base or compliance needs grow, revisit "Full encryption" (proxy
all PII reads/writes through decrypting functions).

## What is encrypted (issue #177)

- **OAuth tokens** are encrypted with AES-256-GCM before every Firestore write
  (initial OAuth exchange and token refresh) and decrypted on read.
  - Helper: `functions/src/crypto/fieldCrypto.ts` (wire format
    `enc:v1:<iv>:<tag>:<ciphertext>`, all base64).
  - Key: `FIELD_ENCRYPTION_KEY` secret (32-byte base64). Decryption passes
    legacy plaintext through unchanged, so rollout is non-breaking.
- **Email-feedback links** are HMAC-SHA256 signed (`FEEDBACK_LINK_SECRET`); the
  unauthenticated `/emailFeedback` endpoint rejects unsigned/forged links so
  feedback can't be forged for an arbitrary uid (memory-poisoning).
  - Helper: `functions/src/crypto/feedbackLink.ts`.

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
npx tsx scripts/migrate-encrypt-tokens.ts            # dry run
npx tsx scripts/migrate-encrypt-tokens.ts --apply    # write
gcloud scheduler jobs resume firebase-schedule-generateMorningGist-us-central1 \
  --location us-central1

# 5. Verify in the console: integration docs show enc:v1:… for token fields.
```

## Audit trail

`/cso` security reports are saved (locally, gitignored) under
`.gstack/security-reports/`. Latest: `2026-06-07-151249.json`.
