/**
 * Tests for selectEmailCards — the global merit selection pass that runs over a
 * candidate pool merged across all of a user's connected inboxes (issue #184).
 *
 * AI classification stays off (no prefs.enableAi, GIST_EMAIL_AI unset), so the
 * function is pure and runs without network. We assert the cross-account
 * behaviour the multi-inbox refactor introduced: collisions are namespaced by
 * account, quotas/dedup/personal-guarantee still hold across the merged pool.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { selectEmailCards, type EmailCandidate } from './gmailInt';

// Ensure the env-var AI escape hatch is off for deterministic, network-free runs.
beforeEach(() => {
  delete process.env.GIST_EMAIL_AI;
});

let seq = 0;
function candidate(overrides: Partial<EmailCandidate> = {}): EmailCandidate {
  seq += 1;
  return {
    accountId: 'gmail:personal@gmail.com',
    accountLabel: 'personal@gmail.com',
    messageId: `m${seq}`,
    threadId: `t${seq}`,
    fromName: `Sender ${seq}`,
    fromEmail: `sender${seq}@work.com`,
    subject: `Subject ${seq}`,
    snippet: `Snippet ${seq}`,
    receivedAtMs: 1_700_000_000_000 + seq * 1000,
    isUnread: true,
    isImportant: false,
    isStarred: false,
    isDirect: false,
    isCc: false,
    isList: false,
    isAutomated: false,
    hasAttachment: false,
    hasDocLink: false,
    hasAsk: false,
    hasUrgent: false,
    hasWaitingOn: false,
    hasQuestion: false,
    isNewsletterish: false,
    fromVip: false,
    senderDomain: 'work.com',
    categoryHint: 'FYI',
    urgencyHint: 0,
    reasons: ['Unread'],
    baseScore: 5,
    ...overrides,
  };
}

describe('selectEmailCards — multi-account', () => {
  it('draws cards from every connected inbox and tags their source', async () => {
    const pool = [
      candidate({
        accountId: 'gmail:personal@gmail.com',
        accountLabel: 'personal@gmail.com',
        baseScore: 9,
      }),
      candidate({
        accountId: 'gmail:work@company.com',
        accountLabel: 'work@company.com',
        baseScore: 8,
      }),
    ];

    const cards = await selectEmailCards(pool, {}, 5);

    expect(cards).toHaveLength(2);
    const labels = cards.map((c) => c.accountLabel).sort();
    expect(labels).toEqual(['personal@gmail.com', 'work@company.com']);
    // Card ids are namespaced by account so they're globally unique.
    expect(new Set(cards.map((c) => c.id)).size).toBe(2);
    expect(cards.every((c) => c.id.includes(':'))).toBe(true);
  });

  it('does not treat identical thread ids in different inboxes as duplicates', async () => {
    // Same threadId/messageId across two accounts — a real possibility since
    // Gmail ids are only unique within a single inbox. Both must survive.
    const pool = [
      candidate({
        accountId: 'gmail:personal@gmail.com',
        accountLabel: 'personal@gmail.com',
        threadId: 'shared-thread',
        messageId: 'shared-msg',
        fromEmail: 'a@work.com',
        baseScore: 9,
      }),
      candidate({
        accountId: 'gmail:work@company.com',
        accountLabel: 'work@company.com',
        threadId: 'shared-thread',
        messageId: 'shared-msg',
        fromEmail: 'b@work.com',
        baseScore: 8,
      }),
    ];

    const cards = await selectEmailCards(pool, {}, 5);
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((c) => c.id)).size).toBe(2);
  });

  it('still dedupes the same thread within one inbox', async () => {
    const pool = [
      candidate({ threadId: 'same', messageId: 'x1', fromEmail: 'p@work.com', baseScore: 9 }),
      candidate({ threadId: 'same', messageId: 'x2', fromEmail: 'q@work.com', baseScore: 8 }),
    ];
    const cards = await selectEmailCards(pool, {}, 5);
    expect(cards).toHaveLength(1);
  });

  it('dedupes a repeated sender across inboxes (one card per sender)', async () => {
    const pool = [
      candidate({
        accountId: 'gmail:personal@gmail.com',
        accountLabel: 'personal@gmail.com',
        fromEmail: 'newsletter@brand.com',
        baseScore: 9,
      }),
      candidate({
        accountId: 'gmail:work@company.com',
        accountLabel: 'work@company.com',
        fromEmail: 'newsletter@brand.com',
        baseScore: 8,
      }),
    ];
    const cards = await selectEmailCards(pool, {}, 5);
    expect(cards).toHaveLength(1);
  });

  it('caps a category at its quota when other categories can fill the slots', async () => {
    // Five high-scoring Action candidates outrank two FYI ones, spread across
    // both inboxes. With maxCards=4 the Action quota (2) and FYI quota (2) leave
    // no room for the fill pass — so Action is held to 2 despite outranking FYI.
    const actions = Array.from({ length: 5 }, (_, i) =>
      candidate({
        accountId: i % 2 ? 'gmail:work@company.com' : 'gmail:personal@gmail.com',
        accountLabel: i % 2 ? 'work@company.com' : 'personal@gmail.com',
        categoryHint: 'Action',
        fromEmail: `actor${i}@work.com`,
        baseScore: 20 - i,
      }),
    );
    const fyis = Array.from({ length: 2 }, (_, i) =>
      candidate({
        categoryHint: 'FYI',
        fromEmail: `fyi${i}@work.com`,
        baseScore: 5 - i,
      }),
    );

    const cards = await selectEmailCards([...actions, ...fyis], {}, 4);
    expect(cards.filter((c) => c.category === 'Action')).toHaveLength(2);
    expect(cards.filter((c) => c.category === 'FYI')).toHaveLength(2);
  });

  it('guarantees a personal-domain card when the inbox would otherwise be all work', async () => {
    // maxCards work-domain candidates outranking one personal-domain card.
    const work = Array.from({ length: 3 }, (_, i) =>
      candidate({
        fromEmail: `colleague${i}@bigcorp.com`,
        senderDomain: 'bigcorp.com',
        baseScore: 20 - i,
      }),
    );
    const personal = candidate({
      accountId: 'gmail:work@company.com',
      accountLabel: 'work@company.com',
      fromEmail: 'mom@gmail.com',
      senderDomain: 'gmail.com',
      baseScore: 1,
    });

    const cards = await selectEmailCards([...work, personal], {}, 3);
    expect(cards).toHaveLength(3);
    expect(cards.some((c) => c.fromEmail === 'mom@gmail.com')).toBe(true);
  });

  it('returns an empty array for an empty pool', async () => {
    expect(await selectEmailCards([], {}, 5)).toEqual([]);
  });
});
