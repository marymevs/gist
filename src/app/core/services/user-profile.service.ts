import { Injectable } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  constructor(private firestore: Firestore) {}

  async upsert(uid: string, email: string | null, plan: string): Promise<void> {
    const ref = doc(this.firestore, 'users', uid);
    await setDoc(
      ref,
      {
        email,
        plan,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}
