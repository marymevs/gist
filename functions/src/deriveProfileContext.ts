/**
 * Profile-context derivation (issue #156).
 *
 * Fires asynchronously whenever a user document is written. When the user's
 * long-form `profile.context` changes, we parse it with Claude into a light
 * structure (work / freeTime / creative / misc) and store it back under
 * `profile.contextDerived`.
 *
 * Raw `profile.context` is the source of truth and is never modified here.
 * The derived structure is a regenerable convenience copy — the generator
 * uses it for scaffolding when present, and falls back to raw context when not.
 * Onboarding never blocks on this; the first Gist simply uses whichever is
 * ready at generation time.
 *
 * The prompt + parse + assembly live in personalization/deriveContext.ts so
 * this trigger and any backfill tooling run byte-identical logic.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin';
import { ANTHROPIC_API_KEY } from './integrations/claudeUtils';
import {
  deriveContextFromText,
  buildContextDerived,
  type DerivedContext,
} from './personalization/deriveContext';
import type { UserDoc } from './types';

export const deriveProfileContext = onDocumentWritten(
  {
    document: 'users/{uid}',
    region: 'us-central1',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after.data() as UserDoc | undefined;
    if (!after) return; // document deleted

    const context = after.profile?.context?.trim();
    if (!context) return; // nothing to derive

    const before = event.data?.before.data() as UserDoc | undefined;
    const prevContext = before?.profile?.context?.trim();

    // Only re-derive when the raw text actually changed. This also breaks the
    // trigger loop: our own write below touches contextDerived, not context,
    // so the next invocation sees an unchanged context and returns here.
    if (context === prevContext) return;

    logger.info('deriveProfileContext: deriving structure', {
      uid,
      contextLength: context.length,
    });

    let derived: DerivedContext;
    try {
      derived = await deriveContextFromText(context);
    } catch (err) {
      // Swallow — derivation is best-effort. The generator falls back to raw
      // context, and the next edit to profile.context will retry.
      logger.error('deriveProfileContext: Claude call failed', { uid, err });
      return;
    }

    const contextDerived = buildContextDerived(derived, Timestamp.now());

    // Deep-merge so we never clobber profile.name / profile.context.
    await getDb()
      .doc(`users/${uid}`)
      .set({ profile: { contextDerived } }, { merge: true });

    logger.info('deriveProfileContext: wrote contextDerived', {
      uid,
      fields: Object.keys(contextDerived).filter(
        (k) => k !== 'parsedAt' && k !== 'parserVersion',
      ),
    });
  },
);
