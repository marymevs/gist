/**
 * Tests for faxWebhook.ts — Phaxio delivery webhook handler.
 *
 * Tests signature verification and status mapping logic.
 * The Cloud Function itself (onRequest) is not directly tested here —
 * we test the exported helpers that contain the business logic.
 */

import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'crypto';

// ── stub firebase imports before module load ─────────────────────────────────
vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn(),
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    value: () => { throw new Error(`Secret ${name} not available in test`); },
  }),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collectionGroup: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    }),
  }),
}));
vi.mock('../firestoreUtils', () => ({
  updateGistDeliveryStatus: vi.fn(),
  writeDeliveryLog: vi.fn(),
}));

import { verifyPhaxioSignature } from './faxWebhook';

// ─── signature verification tests ────────────────────────────────────────────

describe('verifyPhaxioSignature', () => {
  const webhookToken = 'test-webhook-token-12345';

  function sign(body: string, token: string): string {
    return crypto.createHmac('sha256', token).update(body).digest('hex');
  }

  it('returns true for a valid signature', () => {
    const body = '{"data":{"id":"123","status":"success"}}';
    const signature = sign(body, webhookToken);

    expect(verifyPhaxioSignature(body, signature, webhookToken)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const body = '{"data":{"id":"123","status":"success"}}';
    const badSignature = sign(body, 'wrong-token');

    expect(verifyPhaxioSignature(body, badSignature, webhookToken)).toBe(false);
  });

  it('returns false when signature is undefined', () => {
    const body = '{"data":{"id":"123"}}';
    expect(verifyPhaxioSignature(body, undefined, webhookToken)).toBe(false);
  });

  it('returns false when webhook token is empty', () => {
    const body = '{"data":{"id":"123"}}';
    const signature = sign(body, webhookToken);
    expect(verifyPhaxioSignature(body, signature, '')).toBe(false);
  });

  it('returns false when signature is not valid hex', () => {
    const body = '{"data":{"id":"123"}}';
    expect(verifyPhaxioSignature(body, 'not-hex-at-all!!!', webhookToken)).toBe(false);
  });

  it('handles Buffer body input', () => {
    const body = '{"data":{"id":"456","status":"failure"}}';
    const signature = sign(body, webhookToken);
    const bodyBuffer = Buffer.from(body, 'utf-8');

    expect(verifyPhaxioSignature(bodyBuffer, signature, webhookToken)).toBe(true);
  });

  it('returns false when body is tampered', () => {
    const originalBody = '{"data":{"id":"123","status":"success"}}';
    const tamperedBody = '{"data":{"id":"123","status":"failure"}}';
    const signature = sign(originalBody, webhookToken);

    expect(verifyPhaxioSignature(tamperedBody, signature, webhookToken)).toBe(false);
  });
});
