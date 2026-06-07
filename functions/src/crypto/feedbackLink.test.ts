import { describe, it, expect, beforeAll } from 'vitest';
import {
  signFeedbackParams,
  verifyFeedbackSignature,
  type FeedbackParams,
} from './feedbackLink';

beforeAll(() => {
  process.env.FEEDBACK_LINK_SECRET = Buffer.alloc(32, 9).toString('base64');
});

const params: FeedbackParams = {
  uid: 'abc123',
  date: '2026-06-07',
  card: 'card-1',
  cat: 'Action',
  rating: 'up',
};

describe('feedbackLink', () => {
  it('verifies a signature it produced', () => {
    const sig = signFeedbackParams(params);
    expect(verifyFeedbackSignature(params, sig)).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(verifyFeedbackSignature(params, undefined)).toBe(false);
    expect(verifyFeedbackSignature(params, '')).toBe(false);
  });

  it('rejects a tampered parameter', () => {
    const sig = signFeedbackParams(params);
    expect(verifyFeedbackSignature({ ...params, rating: 'down' }, sig)).toBe(false);
    expect(verifyFeedbackSignature({ ...params, uid: 'someone-else' }, sig)).toBe(false);
  });

  it('rejects a garbage signature without throwing', () => {
    expect(verifyFeedbackSignature(params, 'not-a-real-sig')).toBe(false);
  });
});
