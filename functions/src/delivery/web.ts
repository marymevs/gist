/**
 * Web delivery for morning gists.
 * Gist is already in Firestore — just update status.
 */

import { updateGistDeliveryStatus } from '../firestoreUtils';

export type WebDeliveryInput = {
  userId: string;
  dateKey: string;
};

export type WebDeliveryResult = {
  status: 'delivered';
};

export async function deliverByWeb(input: WebDeliveryInput): Promise<WebDeliveryResult> {
  await updateGistDeliveryStatus(input.userId, input.dateKey, 'delivered');
  return { status: 'delivered' };
}
