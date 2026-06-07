/**
 * Web delivery for morning gists.
 * The gist is already in Firestore; there's nothing to send. The caller
 * (generateMorningGistForUser) syncs delivery.status from the returned result.
 */

export type WebDeliveryInput = {
  userId: string;
  dateKey: string;
};

export type WebDeliveryResult = {
  status: 'delivered';
};

export async function deliverByWeb(_input: WebDeliveryInput): Promise<WebDeliveryResult> {
  return { status: 'delivered' };
}
