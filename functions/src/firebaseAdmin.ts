import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function ensureFirebaseApp(): void {
  if (!getApps().length) {
    initializeApp();
  }
}

export function getDb() {
  ensureFirebaseApp();
  return getFirestore();
}
