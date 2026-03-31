import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { Functions, httpsCallableFromURL } from '@angular/fire/functions';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, User } from 'firebase/auth';

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
      const currentUser = this.auth.currentUser;
      if (!currentUser) throw new Error('Not signed in.');
      // Use server-side code exchange (same as AccountComponent) so refresh token
      // is stored and the popup does not re-authenticate the Firebase user.
      const { authorizationUrl, callbackOrigin } =
        await this.startExchangeFlow(currentUser, 'exchangeGoogleCalendarCode');
      const popup = this.openOAuthPopup(authorizationUrl, 'google-calendar-oauth');
      if (!popup) throw new Error('Popup was blocked. Please allow popups and try again.');
      await this.waitForOAuthResult(popup, callbackOrigin, 'google-calendar-oauth');
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
      const currentUser = this.auth.currentUser;
      if (!currentUser) throw new Error('Not signed in.');
      const { authorizationUrl, callbackOrigin } =
        await this.startExchangeFlow(currentUser, 'exchangeGoogleGmailCode');
      const popup = this.openOAuthPopup(authorizationUrl, 'google-gmail-oauth');
      if (!popup) throw new Error('Popup was blocked. Please allow popups and try again.');
      await this.waitForOAuthResult(popup, callbackOrigin, 'google-gmail-oauth');
      this.gmailConnected = true;
    } catch (e: any) {
      this.gmailError = e?.message ?? 'Google said no. Try again?';
    } finally {
      this.gmailLoading = false;
    }
  }

  // ─── OAuth helpers (mirrors AccountComponent — uses server-side code exchange) ──

  private getExchangeEndpoint(fnName: string): string {
    const projectId = this.auth.app.options.projectId;
    if (!projectId) throw new Error('Missing Firebase project ID.');
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://127.0.0.1:5001/${projectId}/us-central1/${fnName}`;
    }
    return `https://us-central1-${projectId}.cloudfunctions.net/${fnName}`;
  }

  private async startExchangeFlow(
    currentUser: User,
    fnName: string,
  ): Promise<{ authorizationUrl: string; callbackOrigin: string }> {
    const endpoint = this.getExchangeEndpoint(fnName);
    const idToken = await currentUser.getIdToken();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'start', origin: window.location.origin }),
    });
    const payload = (await response.json()) as {
      authorizationUrl?: unknown;
      callbackOrigin?: unknown;
      error?: unknown;
    };
    if (!response.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to start OAuth');
    }
    if (typeof payload.authorizationUrl !== 'string' || typeof payload.callbackOrigin !== 'string') {
      throw new Error('OAuth start response was missing required fields.');
    }
    return { authorizationUrl: payload.authorizationUrl, callbackOrigin: payload.callbackOrigin };
  }

  private openOAuthPopup(url: string, name: string): Window | null {
    const width = 520;
    const height = 680;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    return window.open(url, name, `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  }

  private waitForOAuthResult(popup: Window, callbackOrigin: string, expectedSource: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let popupClosedAtMs: number | null = null;

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        window.clearInterval(closeCheckInterval);
        window.clearTimeout(timeoutHandle);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        error ? reject(error) : resolve();
      };
      const onMessage = (event: MessageEvent<unknown>) => {
        if (event.origin !== callbackOrigin) return;
        if (!event.data || typeof event.data !== 'object') return;
        const payload = event.data as { source?: unknown; success?: unknown; message?: unknown };
        if (payload.source !== expectedSource) return;
        if (payload.success === true) { finish(); return; }
        finish(new Error(typeof payload.message === 'string' ? payload.message : 'Connection failed.'));
      };
      window.addEventListener('message', onMessage);
      const closeCheckInterval = window.setInterval(() => {
        if (!popup.closed) { popupClosedAtMs = null; return; }
        if (popupClosedAtMs === null) { popupClosedAtMs = Date.now(); return; }
        if (Date.now() - popupClosedAtMs >= 1200) {
          finish(new Error('Connection was cancelled before it completed.'));
        }
      }, 250);
      const timeoutHandle = window.setTimeout(() => {
        if (!popup.closed) popup.close();
        finish(new Error('Timed out waiting for Google authorization.'));
      }, 5 * 60 * 1000);
    });
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

  get currentUserEmail(): string | null {
    return this.auth.currentUser?.email ?? null;
  }
}
