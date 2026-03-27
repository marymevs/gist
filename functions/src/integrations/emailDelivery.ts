import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { Resend } from 'resend';

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

// SPF/DKIM must be configured for mygist.app in the Resend dashboard
// and DNS records added before this address will deliver to external users.
// See TODOS.md "Domain setup for email delivery" for the full checklist.
const FROM_ADDRESS = process.env.GIST_FROM_ADDRESS ?? 'Gist <morning@mygist.app>';

export type SendResult =
  | { success: true }
  | { success: false; error: string };

export async function sendMorningGistEmail(params: {
  toEmail: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  let apiKey: string;
  try {
    apiKey = RESEND_API_KEY.value()?.trim() ?? '';
  } catch {
    apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  }

  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY is not configured.' };
  }

  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.toEmail,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      logger.warn('Resend API returned an error.', { error });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Resend API call threw.', { message });
    return { success: false, error: message };
  }
}

/**
 * Returns the user's email address. Falls back to Firebase Auth if the
 * Firestore user doc has a null email field (common for OAuth sign-ins where
 * the email wasn't written to Firestore at account creation time).
 */
export async function resolveUserEmail(
  uid: string,
  firestoreEmail: string | null,
): Promise<string | null> {
  if (firestoreEmail?.trim()) return firestoreEmail.trim();

  try {
    const record = await getAuth().getUser(uid);
    return record.email?.trim() ?? null;
  } catch (err) {
    logger.warn('Could not resolve user email from Firebase Auth.', {
      uid,
      err,
    });
    return null;
  }
}
