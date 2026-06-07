import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptString,
  decryptString,
  isEncrypted,
  encryptTokenRecord,
  decryptTokenRecord,
  encryptJson,
  decryptJson,
} from './fieldCrypto';

// A deterministic 32-byte key (base64) for tests. The module reads the key
// lazily (getKey() on first use), so setting the env in beforeAll — before any
// encrypt/decrypt runs — is sufficient with a static import.
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
});

describe('fieldCrypto', () => {
  it('round-trips a string', () => {
    const plain = 'ya29.a0AfB_byC-secret-access-token';
    const enc = encryptString(plain);
    expect(enc).not.toBe(plain);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(decryptString(enc)).toBe(plain);
  });

  it('produces a fresh IV each time (ciphertext differs, plaintext matches)', () => {
    const a = encryptString('same');
    const b = encryptString('same');
    expect(a).not.toBe(b);
    expect(decryptString(a)).toBe('same');
    expect(decryptString(b)).toBe('same');
  });

  it('passes through legacy plaintext on decrypt', () => {
    expect(decryptString('legacy-plaintext-token')).toBe('legacy-plaintext-token');
  });

  it('is idempotent on encrypt (does not double-encrypt)', () => {
    const once = encryptString('hello');
    expect(encryptString(once)).toBe(once);
  });

  it('detects tampering via the auth tag', () => {
    const enc = encryptString('tamper-me');
    // Flip a character in the ciphertext segment.
    const parts = enc.split(':');
    const last = parts[parts.length - 1];
    parts[parts.length - 1] = last[0] === 'A' ? 'B' + last.slice(1) : 'A' + last.slice(1);
    expect(() => decryptString(parts.join(':'))).toThrow();
  });

  it('isEncrypted recognises the wire format', () => {
    expect(isEncrypted(encryptString('x'))).toBe(true);
    expect(isEncrypted('plain')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(42)).toBe(false);
  });

  it('encrypts only token fields and leaves nulls/others intact', () => {
    const rec = {
      accessToken: 'at',
      refreshToken: 'rt',
      idToken: null,
      scope: 'calendar',
      expiryDate: 123,
    };
    const enc = encryptTokenRecord(rec);
    expect(isEncrypted(enc.accessToken)).toBe(true);
    expect(isEncrypted(enc.refreshToken)).toBe(true);
    expect(enc.idToken).toBe(null);
    expect(enc.scope).toBe('calendar');
    expect(enc.expiryDate).toBe(123);

    const dec = decryptTokenRecord(enc);
    expect(dec.accessToken).toBe('at');
    expect(dec.refreshToken).toBe('rt');
    expect(dec.idToken).toBe(null);
    expect(dec.scope).toBe('calendar');
  });

  it('decryptTokenRecord passes through a legacy plaintext record', () => {
    const legacy = { accessToken: 'plain-at', refreshToken: 'plain-rt' };
    expect(decryptTokenRecord(legacy)).toEqual(legacy);
  });

  it('round-trips structured data via encryptJson/decryptJson', () => {
    const dayItems = [
      { time: '09:00', title: 'Therapy', note: 'weekly' },
      { time: '14:00', title: 'Investor call' },
    ];
    const enc = encryptJson(dayItems);
    expect(typeof enc).toBe('string');
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain('Therapy'); // plaintext not present in ciphertext
    expect(decryptJson(enc)).toEqual(dayItems);
  });

  it('decryptJson passes through legacy already-parsed values', () => {
    const legacy = [{ title: 'old plaintext event' }];
    expect(decryptJson(legacy)).toEqual(legacy);
  });
});
