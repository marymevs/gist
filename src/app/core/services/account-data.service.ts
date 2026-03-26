import { Injectable } from '@angular/core';
import { Auth, user } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  docData,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, of, switchMap } from 'rxjs';
import { GistUser } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AccountDataService {
  constructor(private auth: Auth, private firestore: Firestore) {}

  /** Emits the Firestore user doc for the currently signed-in user (or null if logged out). */
  currentUserDoc$(): Observable<GistUser | null> {
    return user(this.auth).pipe(
      switchMap((u) => {
        if (!u) return of(null);
        const ref = doc(this.firestore, 'users', u.uid);
        return docData(ref) as Observable<GistUser>;
      })
    );
  }

  /** If the user doc is missing (e.g., users created via Google login), create a minimal one. */
  async ensureUserDoc(params: {
    uid: string;
    email: string | null;
  }): Promise<void> {
    const ref = doc(this.firestore, 'users', params.uid);
    await setDoc(
      ref,
      {
        uid: params.uid,
        email: params.email,
        plan: 'print', // sensible default for your product
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        stripeSubscriptionStatus: 'demo',
      },
      { merge: true }
    );
  }

  async updateFaxNumber(uid: string, faxNumber: string): Promise<void> {
    const ref = doc(this.firestore, 'users', uid);
    await setDoc(
      ref,
      {
        delivery: {
          faxNumber: faxNumber.trim(),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async updatePreferences(
    uid: string,
    prefs: { length?: string; tone?: string; quietDays?: number[] },
  ): Promise<void> {
    const ref = doc(this.firestore, 'users', uid);
    await setDoc(
      ref,
      {
        prefs: {
          length: prefs.length,
          tone: prefs.tone,
          quietDays: prefs.quietDays,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async updateEmailVipSenders(uid: string, vipSenders: string[]): Promise<void> {
    const ref = doc(this.firestore, 'users', uid);
    await setDoc(
      ref,
      {
        prefs: {
          email: {
            vipSenders,
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}
