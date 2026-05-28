import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

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
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrls: ['./auth.shared.scss'],
})
export class SignupComponent {
  email = '';
  password = '';
  loading = false;
  error = '';

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
  ) {}

  async signupWithEmail(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      const cred = await createUserWithEmailAndPassword(
        this.auth,
        this.email,
        this.password,
      );

      await this.saveProfile(cred.user.uid, cred.user.email);
      await this.router.navigate(['/onboarding']);
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
      await this.router.navigate(['/onboarding']);
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}
