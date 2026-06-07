/**
 * Application-layer field encryption (issue #177).
 *
 * Encrypts sensitive values before they are written to Firestore so that they
 * are ciphertext at rest — a Firestore backup export, console read, or stolen
 * read-only credential reveals nothing usable. Decryption requires the
 * FIELD_ENCRYPTION_KEY secret, which lives in Secret Manager and is granted
 * only to the Cloud Functions that legitimately need plaintext.
 *
 * Algorithm: AES-256-GCM (authenticated encryption — tampering is detected on
 * decrypt). Each value gets a fresh random 96-bit IV.
 *
 * Wire format (single string, ':'-delimited, all base64):
 *   enc:v1:<iv>:<authTag>:<ciphertext>
 *
 * The `enc:v1:` prefix makes reads backward-compatible: decryptString() passes
 * through any value that isn't in this format, so legacy plaintext docs keep
 * working during and after migration.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { defineSecret } from 'firebase-functions/params';

/**
 * 32-byte AES key, base64-encoded, stored in Secret Manager. Any function that
 * encrypts or decrypts fields must include this in its `secrets:` array.
 */
export const FIELD_ENCRYPTION_KEY = defineSecret('FIELD_ENCRYPTION_KEY');

const PREFIX = 'enc:v1:';
const IV_BYTES = 12; // 96-bit IV — the recommended size for AES-GCM.

let cachedKey: Buffer | null = null;

/**
 * Resolve the encryption key. Prefers process.env (set for local dev and the
 * migration script) and falls back to the Secret Manager param (production
 * runtime). Cached after first successful resolution.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw =
    process.env.FIELD_ENCRYPTION_KEY?.trim() ||
    safeSecretValue(FIELD_ENCRYPTION_KEY);

  if (!raw) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY is not set. Generate one with ' +
        '`openssl rand -base64 32` and store it as a Firebase secret.',
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        'Expected a base64-encoded 256-bit key.',
    );
  }

  cachedKey = key;
  return key;
}

/** `.value()` throws if the secret isn't bound; treat that as "not available". */
function safeSecretValue(secret: ReturnType<typeof defineSecret>): string {
  try {
    return secret.value()?.trim() ?? '';
  } catch {
    return '';
  }
}

/** True if `value` is in the enc:v1 wire format produced by encryptString. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Encrypt a string. Returns the enc:v1 wire format. Idempotent: a value that is
 * already encrypted is returned unchanged (so re-running a migration is safe).
 */
export function encryptString(plaintext: string): string {
  if (isEncrypted(plaintext)) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return (
    PREFIX +
    [iv, authTag, ciphertext].map((b) => b.toString('base64')).join(':')
  );
}

/**
 * Decrypt a value produced by encryptString. Any value not in the enc:v1 format
 * is returned unchanged (backward compatibility with legacy plaintext docs).
 */
export function decryptString(value: string): string {
  if (!isEncrypted(value)) return value;

  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value: expected iv:tag:ciphertext.');
  }

  const [iv, authTag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/** Token fields that must be encrypted at rest. */
const TOKEN_FIELDS = ['accessToken', 'refreshToken', 'idToken'] as const;

/**
 * Return a shallow copy of an OAuth token record with the sensitive token
 * fields encrypted. Null/undefined fields are left as-is. Safe to call on a
 * record whose fields are already encrypted.
 */
export function encryptTokenRecord<T extends Record<string, unknown>>(
  rec: T,
): T {
  const out: Record<string, unknown> = { ...rec };
  for (const field of TOKEN_FIELDS) {
    const v = out[field];
    if (typeof v === 'string' && v.length > 0) out[field] = encryptString(v);
  }
  return out as T;
}

/**
 * Inverse of encryptTokenRecord — decrypts the sensitive token fields in place
 * on a shallow copy. Legacy plaintext fields pass through untouched.
 */
export function decryptTokenRecord<T extends Record<string, unknown>>(
  rec: T,
): T {
  const out: Record<string, unknown> = { ...rec };
  for (const field of TOKEN_FIELDS) {
    const v = out[field];
    if (typeof v === 'string' && v.length > 0) out[field] = decryptString(v);
  }
  return out as T;
}
