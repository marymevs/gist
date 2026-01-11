import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from 'firebase/auth';

@Component({
  standalone: true,
  templateUrl: './signup.component.html',
  styleUrls: ['./auth.shared.scss'],
})
export class SignupComponent {
  email = '';
  password = '';
  selectedPlan: 'web' | 'print' | 'loop' = 'print';
  loading = false;
  error = '';

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router
  ) {}

  async signupWithEmail(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      const cred = await createUserWithEmailAndPassword(
        this.auth,
        this.email,
        this.password
      );

      await this.saveProfile(cred.user.uid, cred.user.email);
      await this.router.navigate(['/today']);
    } catch (e: any) {
      this.error = e?.message ?? 'Signup failed.';
    } finally {
      this.loading = false;
    }
  }

  async signupWithGoogle(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
      await this.saveProfile(cred.user.uid, cred.user.email);
      await this.router.navigate(['/today']);
    } catch (e: any) {
      this.error = e?.message ?? 'Google signup failed.';
    } finally {
      this.loading = false;
    }
  }

  private async saveProfile(uid: string, email: string | null): Promise<void> {
    const ref = doc(this.firestore, 'users', uid);
    await setDoc(
      ref,
      {
        email,
        plan: this.selectedPlan,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        stripeSubscriptionStatus: 'demo',
      },
      { merge: true }
    );
  }
}
