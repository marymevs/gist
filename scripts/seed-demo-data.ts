/**
 * Demo seed script — populates Firestore with sample users and gists
 * for investor demo purposes. Run with:
 *
 *   npx ts-node scripts/seed-demo-data.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

// Initialize with default credentials or emulator
const useEmulator = process.env.FIRESTORE_EMULATOR_HOST;
initializeApp(useEmulator ? { projectId: 'gist-ab4e8' } : undefined);
const db = getFirestore();

const DEMO_USERS = [
  {
    uid: 'demo-sarah',
    email: 'sarah@example.com',
    plan: 'print',
    profile: { name: 'Sarah', context: 'I run a wine bar in Brooklyn' },
    prefs: {
      tone: 'calm',
      topics: ['Markets & finance', 'Local news'],
      timezone: 'America/New_York',
    },
    delivery: { method: 'fax', faxNumber: '+12125551234', schedule: { hour: 7, minute: 0 } },
    onboardingComplete: true,
    stripeSubscriptionStatus: 'active',
    stripeCustomerId: 'cus_demo_sarah',
  },
  {
    uid: 'demo-marcus',
    email: 'marcus@example.com',
    plan: 'web',
    profile: { name: 'Marcus', context: 'Product manager at a fintech startup' },
    prefs: {
      tone: 'concise',
      topics: ['Tech & startups', 'Markets & finance'],
      timezone: 'America/Los_Angeles',
    },
    delivery: { method: 'email', schedule: { hour: 6, minute: 30 } },
    onboardingComplete: true,
    stripeSubscriptionStatus: 'demo',
  },
  {
    uid: 'demo-elena',
    email: 'elena@example.com',
    plan: 'print',
    profile: { name: 'Elena', context: 'Architect, building a passive house' },
    prefs: {
      tone: 'detailed',
      topics: ['Science', 'Culture & arts'],
      timezone: 'America/Chicago',
    },
    delivery: { method: 'email', schedule: { hour: 8, minute: 0 } },
    onboardingComplete: true,
    stripeSubscriptionStatus: 'active',
    stripeCustomerId: 'cus_demo_elena',
  },
];

const SAMPLE_GISTS = [
  {
    date: '2026-03-31',
    weatherSummary: '54\u00b0F, partly cloudy, chance of rain after 3pm',
    moonPhase: '\uD83C\uDF12 Waxing Crescent',
    dayItems: [
      { time: '9:00 AM', title: '1:1 with Alex' },
      { time: '11:00 AM', title: 'Vendor tasting — natural wines' },
      { time: '2:00 PM', title: 'Accountant call (Q1 review)' },
    ],
    worldItems: [
      { headline: 'Fed signals rate pause through summer', implication: 'Wine import costs may stabilize' },
      { headline: 'Brooklyn restaurant closures hit 2-year high', implication: 'Your neighborhood is shifting — watch for opportunistic lease deals' },
    ],
    emailCards: [
      { id: 'demo-1', subject: 'Invoice #4421 from Brooklyn Wine Co', snippet: 'Your March order total...', category: 'Action' as const, why: 'Payment due this week', fromName: 'Brooklyn Wine Co' },
      { id: 'demo-2', subject: 'Re: Summer menu planning', snippet: 'Love the rosé idea...', category: 'WaitingOn' as const, why: 'Alex hasn\u2019t confirmed the tasting schedule', fromName: 'Alex' },
    ],
    gistBullets: [
      'Keep attention on the accountant call prep \u2014 Q1 numbers shape your summer hiring plan.',
      'Check vendor emails once before the tasting, then put the phone away until 4pm.',
      'Protect the gap between the tasting and accountant call for uninterrupted meal planning.',
    ],
    oneThing: 'Prepare three specific questions about seasonal cash flow before your 2pm accountant call.',
    qualityScore: { editorialVoice: 4, crossReferenceDepth: 4, personalizationDepth: 5 },
  },
  {
    date: '2026-03-30',
    weatherSummary: '61\u00b0F, clear skies, light breeze',
    dayItems: [
      { time: '8:30 AM', title: 'Sprint planning' },
      { time: '10:00 AM', title: 'Design review — checkout flow' },
      { time: '1:00 PM', title: 'Lunch with investor' },
    ],
    worldItems: [
      { headline: 'Stripe launches embedded finance toolkit', implication: 'Could simplify your payments integration timeline' },
    ],
    emailCards: [],
    gistBullets: [
      'Stay narrow on the checkout flow critique \u2014 one round of feedback beats three tentative ones.',
      'Silence Slack after sprint planning until the design review starts.',
      'Block 30 minutes before the investor lunch to review your pitch deck numbers.',
    ],
    oneThing: 'Draft one crisp slide summarizing your Q1 traction before the investor lunch at 1pm.',
    qualityScore: { editorialVoice: 4, crossReferenceDepth: 3, personalizationDepth: 4 },
  },
];

async function seed(): Promise<void> {
  console.log('Seeding demo data...\n');

  for (const user of DEMO_USERS) {
    const { uid, ...data } = user;
    await db.collection('users').doc(uid).set({
      uid,
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      calendarIntegration: { status: 'connected' },
      emailIntegration: { status: 'connected' },
    }, { merge: true });

    console.log(`  \u2713 User: ${user.profile.name} (${uid})`);

    // Add sample gists for first user
    if (uid === 'demo-sarah') {
      for (const gist of SAMPLE_GISTS) {
        await db
          .collection('users')
          .doc(uid)
          .collection('morningGists')
          .doc(gist.date)
          .set({
            id: `gist-${uid}-${gist.date}`,
            userId: uid,
            ...gist,
            delivery: { method: 'fax', pages: 2, status: 'delivered' },
            createdAt: Timestamp.now(),
          });
        console.log(`    \u2713 Gist: ${gist.date}`);
      }
    }
  }

  console.log(`\nDone! Seeded ${DEMO_USERS.length} users and ${SAMPLE_GISTS.length} gists.`);
}

seed().catch(console.error);
