/**
 * Print delivery for morning gists.
 * The gist is already in Firestore, adds it to print job queue
 */
import { getDb } from '../firebaseAdmin';
import type { NewspaperTemplateInput } from '../integrations/newspaperTypes';

const db = getDb();

export type PrintDeliveryInput = {
  userId: string;
  dateKey: string;
  newspaperInput?: NewspaperTemplateInput;
};

export type PrintDeliveryResult = {
  status: 'delivered' | 'failed';
};

export async function deliverByPrint(
  _input: PrintDeliveryInput,
): Promise<PrintDeliveryResult> {
  // add to print job queue
  const data = { status: 'pending', text: String(_input.newspaperInput) };
  await db
    .collection('devices')
    .doc('machine_001')
    .collection('printJobs')
    .add(data);
  return { status: 'delivered' };
}
