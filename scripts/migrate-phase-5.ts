/**
 * Phase 5 migration — strip legacy fields from the user doc.
 *
 * Removes:
 *   - plan
 *   - stripeCustomerId
 *   - stripeSubscriptionStatus
 *   - delivery.faxNumber
 *
 * These fields were deleted from the types in PRs #133 (functions) and
 * #134 (Angular), but the live Firestore doc still carries them as
 * leftover server-side data. This script removes them.
 *
 * ────────────────────────────────────────────────────────────────────────
 * USAGE
 *
 *   # Dry-run (default — reads only, shows what would change):
 *   GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json> \
 *     MIGRATE_UID=<your-uid> \
 *     npx tsx scripts/migrate-phase-5.ts
 *
 *   # Apply for real:
 *   GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json> \
 *     MIGRATE_UID=<your-uid> \
 *     npx tsx scripts/migrate-phase-5.ts --apply
 *
 * Kept in scripts/ as a historical record of the Phase 5 data migration —
 * even though it's one-off, the script doubles as documentation of what
 * the live schema used to look like.
 * ────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const FIELDS_TO_DELETE = [
  'plan',
  'stripeCustomerId',
  'stripeSubscriptionStatus',
  'delivery.faxNumber',
] as const;

async function main(): Promise<void> {
  const uid = process.env.MIGRATE_UID;
  if (!uid) {
    console.error('ERROR: MIGRATE_UID env var is required.');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY (will write)' : 'DRY RUN (read-only)';
  console.log(`Phase 5 migration — mode: ${mode}`);
  console.log(`Target uid: ${uid}\n`);

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const ref = db.collection('users').doc(uid);

  const before = await ref.get();
  if (!before.exists) {
    console.error(`ERROR: users/${uid} does not exist.`);
    process.exit(1);
  }
  const beforeData = before.data() ?? {};

  console.log('── BEFORE ──────────────────────────────────────────────');
  console.log(JSON.stringify(beforeData, null, 2));
  console.log();

  // Report which target fields are actually present
  const presentFields = FIELDS_TO_DELETE.filter((field) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      return (
        beforeData[parent] !== undefined &&
        typeof beforeData[parent] === 'object' &&
        (beforeData[parent] as Record<string, unknown>)[child] !== undefined
      );
    }
    return beforeData[field] !== undefined;
  });

  if (presentFields.length === 0) {
    console.log('Nothing to do — none of the target fields are present.');
    process.exit(0);
  }

  console.log('Fields present that will be deleted:');
  for (const f of presentFields) console.log(`  - ${f}`);
  console.log();

  if (!apply) {
    console.log('DRY RUN — no write performed. Re-run with --apply to commit.');
    process.exit(0);
  }

  // Apply
  const updatePayload: Record<string, FieldValue> = {};
  for (const f of presentFields) updatePayload[f] = FieldValue.delete();

  await ref.update(updatePayload);
  console.log('Update applied.\n');

  // Verify
  const after = await ref.get();
  const afterData = after.data() ?? {};
  console.log('── AFTER ───────────────────────────────────────────────');
  console.log(JSON.stringify(afterData, null, 2));
  console.log();

  const stillPresent = FIELDS_TO_DELETE.filter((field) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      return (
        afterData[parent] !== undefined &&
        typeof afterData[parent] === 'object' &&
        (afterData[parent] as Record<string, unknown>)[child] !== undefined
      );
    }
    return afterData[field] !== undefined;
  });

  if (stillPresent.length > 0) {
    console.error('WARNING: some target fields are still present after the update:');
    for (const f of stillPresent) console.error(`  - ${f}`);
    process.exit(2);
  }

  console.log('All target fields removed. Migration complete.');
  console.log('Verify in the Firebase console.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
