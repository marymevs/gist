import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { Functions, httpsCallableFromURL } from '@angular/fire/functions';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword } from 'firebase/auth';

@Component({
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.scss'],
})
export class OnboardingComponent {
  // Account
  email = '';
  password = '';
  authMethod: 'email' | 'google' | null = null;
  authComplete = false;
  authError = '';

  // Integrations
  calendarConnected = false;
  calendarLoading = false;
  calendarError = '';
  gmailConnected = false;
  gmailLoading = false;
  gmailError = '';

  // Fax
  faxNumber = '';
  testFaxStatus: 'idle' | 'sending' | 'sent' | 'error' = 'idle';
  testFaxError = '';

  // Delivery time
  deliveryHour = '6';
  deliveryMinute = '00';
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Overall
  submitting = false;
  submitError = '';

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private functions: Functions,
    private router: Router,
  ) {}

  // ─── Account ────────────────────────────────────────────────────────────────

  async signupWithEmail(): Promise<void> {
    this.authError = '';
    try {
      const cred = await createUserWithEmailAndPassword(this.auth, this.email, this.password);
      await this.saveProfile(cred.user.uid, cred.user.email);
      this.authComplete = true;
      this.authMethod = 'email';
    } catch (e: any) {
      this.authError = e?.message ?? 'Signup failed.';
    }
  }

  async signupWithGoogle(): Promise<void> {
    this.authError = '';
    try {
      const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
      await this.saveProfile(cred.user.uid, cred.user.email);
      this.authComplete = true;
      this.authMethod = 'google';
    } catch (e: any) {
      this.authError = e?.message ?? 'Google signup failed.';
    }
  }

  private async saveProfile(uid: string, email: string | null): Promise<void> {
    const ref = doc(this.firestore, 'users', uid);
    await setDoc(ref, {
      email,
      plan: 'print',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      stripeSubscriptionStatus: 'demo',
      prefs: { timezone: this.timezone },
    }, { merge: true });
  }

  // ─── Calendar OAuth ─────────────────────────────────────────────────────────

  async connectCalendar(): Promise<void> {
    this.calendarLoading = true;
    this.calendarError = '';
    try {
      // Reuse existing OAuth popup flow from account component pattern
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      const cred = await signInWithPopup(this.auth, provider);
      // Store the access token for calendar use
      const credential = GoogleAuthProvider.credentialFromResult(cred);
      if (credential?.accessToken) {
        const uid = this.auth.currentUser?.uid;
        if (uid) {
          await setDoc(
            doc(this.firestore, 'users', uid, 'integrations', 'googleCalendar'),
            { accessToken: credential.accessToken, status: 'connected', connectedAt: serverTimestamp() },
            { merge: true },
          );
        }
      }
      this.calendarConnected = true;
    } catch (e: any) {
      this.calendarError = e?.message ?? 'Google said no. Try again?';
    } finally {
      this.calendarLoading = false;
    }
  }

  // ─── Gmail OAuth ────────────────────────────────────────────────────────────

  async connectGmail(): Promise<void> {
    this.gmailLoading = true;
    this.gmailError = '';
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      const cred = await signInWithPopup(this.auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(cred);
      if (credential?.accessToken) {
        const uid = this.auth.currentUser?.uid;
        if (uid) {
          await setDoc(
            doc(this.firestore, 'users', uid, 'integrations', 'googleGmail'),
            { accessToken: credential.accessToken, status: 'connected', connectedAt: serverTimestamp() },
            { merge: true },
          );
        }
      }
      this.gmailConnected = true;
    } catch (e: any) {
      this.gmailError = e?.message ?? 'Google said no. Try again?';
    } finally {
      this.gmailLoading = false;
    }
  }

  // ─── Test Fax ───────────────────────────────────────────────────────────────

  async sendTestFax(): Promise<void> {
    if (!this.faxNumber.trim()) return;
    this.testFaxStatus = 'sending';
    this.testFaxError = '';

    try {
      const token = await this.auth.currentUser?.getIdToken();
      const response = await fetch('/api/sendTestFax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          faxNumber: this.faxNumber.trim(),
          deliveryTime: `${this.deliveryHour}:${this.deliveryMinute} AM`,
          name: this.auth.currentUser?.email?.split('@')[0] ?? 'Subscriber',
        }),
      });

      const data = await response.json();
      if (data.success) {
        this.testFaxStatus = 'sent';
        // Save fax number to user doc
        const uid = this.auth.currentUser?.uid;
        if (uid) {
          await setDoc(doc(this.firestore, 'users', uid), {
            delivery: { faxNumber: this.faxNumber.trim() },
          }, { merge: true });
        }
      } else {
        this.testFaxStatus = 'error';
        this.testFaxError = data.error ?? 'That number didn\'t work. Double-check it.';
      }
    } catch (e: any) {
      this.testFaxStatus = 'error';
      this.testFaxError = 'Something went wrong. Try again.';
    }
  }

  // ─── Submit (save preferences + redirect to Stripe or Today) ───────────────

  async onSubmit(): Promise<void> {
    this.submitting = true;
    this.submitError = '';

    try {
      const uid = this.auth.currentUser?.uid;
      if (!uid) {
        this.submitError = 'Not signed in.';
        return;
      }

      // Save delivery preferences
      await setDoc(doc(this.firestore, 'users', uid), {
        delivery: {
          faxNumber: this.faxNumber.trim(),
          schedule: {
            hour: parseInt(this.deliveryHour, 10),
            minute: parseInt(this.deliveryMinute, 10),
          },
        },
        prefs: { timezone: this.timezone },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // For the founder (demo status), skip Stripe and go to /today
      // For external users, redirect to Stripe checkout
      // TODO: Wire Stripe checkout redirect here for external users
      await this.router.navigate(['/today']);
    } catch (e: any) {
      this.submitError = e?.message ?? 'Something went wrong.';
    } finally {
      this.submitting = false;
    }
  }

  get deliveryTimeLabel(): string {
    const h = parseInt(this.deliveryHour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHour}:${this.deliveryMinute} ${ampm}`;
  }

  get canSubmit(): boolean {
    return this.authComplete && this.faxNumber.trim().length > 0;
  }
}
