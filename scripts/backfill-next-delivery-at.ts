/**
 * Backfill `nextDeliveryAt` for onboarded users who are missing it.
 *
 * THE BUG THIS FIXES
 *
 * The 15-min scheduler (functions/src/generateMorningGist.ts) finds users with:
 *
 *     db.collection('users').where('nextDeliveryAt', '<=', now)
 *
 * A Firestore `.where()` skips any document that lacks the queried field
 * entirely. Until PR "fix/seed-next-delivery-at", nothing ever seeded
 * `nextDeliveryAt` at signup or onboarding, so every existing onboarded user is
 * invisible to the scheduler and gets no daily gist. The fix seeds the field for
 * NEW users (in generateGistOnDemand); this script seeds it for EXISTING ones.
 *
 * It sets nextDeliveryAt to the user's next delivery time based on their
 * delivery.schedule (hour/minute) in their prefs.timezone — identical math to
 * computeNextDelivery() in the scheduler, inlined here so the script doesn't pull
 * in the Cloud Functions module graph (secrets/params).
 *
 * ────────────────────────────────────────────────────────────────────────
 * USAGE
 *
 *   # Dry-run (default — reads only, lists who would be backfilled):
 *   GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json> \
 *     npx tsx scripts/backfill-next-delivery-at.ts
 *
 *   # Apply for real:
 *   GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json> \
 *     npx tsx scripts/backfill-next-delivery-at.ts --apply
 *
 * Idempotent: only touches docs where onboardingComplete === true AND
 * nextDeliveryAt is missing. Re-running after --apply is a no-op.
 * ────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ── Inlined from functions/src/helpers.ts (kept in sync) ────────────────────

function safeTimezone(tz?: string): string {
  if (!tz) return 'America/New_York';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'America/New_York';
  }
}

function toDateKeyISO(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

// ── Inlined from functions/src/generateMorningGist.ts (kept in sync) ─────────

function computeNextDelivery(
  now: Date,
  timezone: string,
  schedule?: { hour?: number; minute?: number },
): Timestamp {
  const hour = schedule?.hour ?? 7;
  const minute = schedule?.minute ?? 30;

  const todayStr = toDateKeyISO(now, timezone);
  const deliveryToday = new Date(
    `${todayStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
  );

  const target =
    deliveryToday.getTime() > now.getTime()
      ? deliveryToday
      : new Date(deliveryToday.getTime() + 24 * 60 * 60 * 1000);

  return Timestamp.fromDate(target);
}

// ── Backfill ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY (will write)' : 'DRY RUN (read-only)';
  console.log(`Backfill nextDeliveryAt — mode: ${mode}\n`);

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const now = new Date();

  // Onboarded users are the ones who should be receiving daily gists.
  const snap = await db
    .collection('users')
    .where('onboardingComplete', '==', true)
    .get();

  console.log(`Scanned ${snap.size} onboarded user(s).\n`);

  const toBackfill: {
    uid: string;
    timezone: string;
    next: Timestamp;
  }[] = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.nextDeliveryAt !== undefined) return; // already seeded — skip

    const uid = data.uid ?? docSnap.id;
    const timezone = safeTimezone(data.prefs?.timezone);
    const next = computeNextDelivery(now, timezone, data.delivery?.schedule);
    toBackfill.push({ uid, timezone, next });
  });

  if (toBackfill.length === 0) {
    console.log('Nothing to do — every onboarded user already has nextDeliveryAt.');
    process.exit(0);
  }

  console.log(`${toBackfill.length} user(s) missing nextDeliveryAt:`);
  for (const u of toBackfill) {
    console.log(
      `  - ${u.uid}  (tz ${u.timezone})  →  ${u.next.toDate().toISOString()}`,
    );
  }
  console.log();

  if (!apply) {
    console.log('DRY RUN — no writes performed. Re-run with --apply to commit.');
    process.exit(0);
  }

  let written = 0;
  for (const u of toBackfill) {
    await db.collection('users').doc(u.uid).update({ nextDeliveryAt: u.next });
    written++;
  }

  console.log(`\nBackfill applied to ${written} user(s).`);
  console.log('They will be picked up on the next scheduler tick at their delivery time.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
