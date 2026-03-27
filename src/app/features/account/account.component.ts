import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { AccountDataService } from '../../core/services/account-data.service';
import { ToastService } from '../../shared/services/toast.service';
import { GistUser } from '../../core/models/user.model';
import { Observable } from 'rxjs';
import { User, signOut } from 'firebase/auth';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const LENGTH_OPTIONS = [
  { value: 'brief', label: 'Brief (1 page)' },
  { value: 'standard', label: 'Standard (2 pages)' },
  { value: 'detailed', label: 'Detailed (3 pages)' },
] as const;

const TONE_OPTIONS = [
  { value: 'calm', label: 'Calm, direct' },
  { value: 'detailed', label: 'Detailed, thorough' },
  { value: 'concise', label: 'Concise, bullet-only' },
] as const;

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
})
export class AccountComponent {
  userDoc$: Observable<GistUser | null> = this.accountData.currentUserDoc$();
  authUser$ = user(this.auth);
  isConnectingCalendar = false;
  isConnectingGmail = false;
  isSavingVipSenders = false;
  isSavingFaxNumber = false;
  isSavingPreferences = false;

  // Preferences edit mode
  isEditingPreferences = false;
  editLength = 'standard';
  editTone = 'calm';
  editQuietDays: boolean[] = [true, false, false, false, false, false, true]; // Sun=on, Sat=on

  // Security expanded
  isSecurityExpanded = false;

  // Constants for template
  readonly dayLabels = DAY_LABELS;
  readonly lengthOptions = LENGTH_OPTIONS;
  readonly toneOptions = TONE_OPTIONS;

  constructor(
    private auth: Auth,
    private accountData: AccountDataService,
    private toast: ToastService,
    private route: ActivatedRoute,
  ) {
    // Auto-expand preferences if navigated with ?section=preferences
    this.route.queryParams.subscribe((params) => {
      if (params['section'] === 'preferences') {
        this.isEditingPreferences = true;
      }
    });
  }

  calendarStatus(user: GistUser | null): string {
    const integration = user?.calendarIntegration;
    if (!integration) return 'Not connected';
    if (integration.status === 'connected' || integration.connectedAt) {
      return 'Connected';
    }
    if (integration.accessToken || integration.authorizationCode) {
      return 'Connected';
    }
    return 'Not connected';
  }

  emailStatus(user: GistUser | null): string {
    const integration = user?.emailIntegration;
    if (!integration) return 'Not connected';
    if (integration.status === 'connected' || integration.connectedAt) {
      return 'Connected';
    }
    return 'Not connected';
  }

  async onConnectGoogleCalendar(): Promise<void> {
    if (this.isConnectingCalendar) return;

    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      this.toast.show('Please sign in before connecting your calendar.', 'error');
      return;
    }

    this.isConnectingCalendar = true;
    try {
      const { authorizationUrl, callbackOrigin } =
        await this.startGoogleCalendarAuth(currentUser);

      const popup = this.openOAuthPopup(authorizationUrl, 'google-calendar-oauth');
      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups and try again.');
      }

      await this.waitForOAuthResult(popup, callbackOrigin, 'google-calendar-oauth');
      this.toast.show('Google Calendar connected.', 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to connect Google Calendar. Please try again.';
      this.toast.show(message, 'error');
    } finally {
      this.isConnectingCalendar = false;
    }
  }

  async onConnectGmail(): Promise<void> {
    if (this.isConnectingGmail) return;

    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      this.toast.show('Please sign in before connecting Gmail.', 'error');
      return;
    }

    this.isConnectingGmail = true;
    try {
      const { authorizationUrl, callbackOrigin } =
        await this.startGoogleGmailAuth(currentUser);

      const popup = this.openOAuthPopup(authorizationUrl, 'google-gmail-oauth');
      if (!popup) {
        throw new Error('Popup was blocked. Please allow popups and try again.');
      }

      await this.waitForOAuthResult(popup, callbackOrigin, 'google-gmail-oauth');
      this.toast.show('Gmail connected.', 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to connect Gmail. Please try again.';
      this.toast.show(message, 'error');
    } finally {
      this.isConnectingGmail = false;
    }
  }

  async onSaveVipSenders(user: GistUser, raw: string): Promise<void> {
    if (this.isSavingVipSenders) return;
    if (!user?.uid) {
      this.toast.show('Sign in to save VIP senders.', 'error');
      return;
    }

    const vipSenders = Array.from(
      new Set(
        raw
          .split(/[,;\n]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => entry && entry.includes('@')),
      ),
    ).slice(0, 30);

    this.isSavingVipSenders = true;
    try {
      await this.accountData.updateEmailVipSenders(user.uid, vipSenders);
      this.toast.show('VIP senders saved.', 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save VIP senders right now.';
      this.toast.show(message, 'error');
    } finally {
      this.isSavingVipSenders = false;
    }
  }

  async onSaveFaxNumber(user: GistUser, raw: string): Promise<void> {
    if (this.isSavingFaxNumber) return;
    if (!user?.uid) {
      this.toast.show('Sign in to save your fax number.', 'error');
      return;
    }

    const faxNumber = raw.trim().replace(/\s+/g, '');
    if (!faxNumber) {
      this.toast.show('Please enter a fax number.', 'info');
      return;
    }

    this.isSavingFaxNumber = true;
    try {
      await this.accountData.updateFaxNumber(user.uid, faxNumber);
      this.toast.show('Fax number saved.', 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save fax number right now.';
      this.toast.show(message, 'error');
    } finally {
      this.isSavingFaxNumber = false;
    }
  }

  planLabel(plan: GistUser['plan']): string {
    if (plan === 'web') return 'Web';
    if (plan === 'print') return 'Print';
    return 'Loop';
  }

  planPrice(plan: GistUser['plan']): string {
    if (plan === 'web') return '$12/mo';
    if (plan === 'print') return '$25/mo';
    return '$45/mo';
  }

  // --- Preferences edit ---

  onEditPreferences(user: GistUser): void {
    this.editLength = user.prefs?.length ?? 'standard';
    this.editTone = user.prefs?.tone ?? 'calm';
    const quietDays = user.prefs?.quietDays ?? [0, 6]; // default Sun, Sat
    this.editQuietDays = DAY_LABELS.map((_, i) => quietDays.includes(i));
    this.isEditingPreferences = true;
  }

  onCancelPreferences(): void {
    this.isEditingPreferences = false;
  }

  async onSavePreferences(user: GistUser): Promise<void> {
    if (this.isSavingPreferences || !user?.uid) return;

    const quietDays = this.editQuietDays
      .map((checked, i) => (checked ? i : -1))
      .filter((i) => i >= 0);

    this.isSavingPreferences = true;
    try {
      await this.accountData.updatePreferences(user.uid, {
        length: this.editLength,
        tone: this.editTone,
        quietDays,
      });
      this.isEditingPreferences = false;
      this.toast.show('Preferences saved.', 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save preferences right now.';
      this.toast.show(message, 'error');
    } finally {
      this.isSavingPreferences = false;
    }
  }

  async onChangePlan(): Promise<void> {
    try {
      const token = await this.auth.currentUser?.getIdToken();
      if (!token) return;
      const response = await fetch('/api/stripeCreateCheckout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan: 'print' }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? 'Could not start checkout.');
      }
    } catch {
      alert('Could not connect to billing. Try again.');
    }
  }

  onViewInvoices(): void {
    // Opens Stripe customer portal — URL configured in Stripe dashboard
    window.open('https://billing.stripe.com/p/login/test', '_blank');
  }

  lengthLabel(user: GistUser): string {
    const val = user.prefs?.length ?? 'standard';
    return LENGTH_OPTIONS.find((o) => o.value === val)?.label ?? 'Standard (2 pages)';
  }

  toneLabel(user: GistUser): string {
    const val = user.prefs?.tone ?? 'calm';
    return TONE_OPTIONS.find((o) => o.value === val)?.label ?? 'Calm, direct';
  }

  quietDaysLabel(user: GistUser): string {
    const days = user.prefs?.quietDays ?? [0, 6];
    if (days.length === 0) return 'None';
    return days.map((d) => DAY_LABELS[d]).join(', ');
  }

  // --- Security ---

  toggleSecurity(): void {
    this.isSecurityExpanded = !this.isSecurityExpanded;
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  async ensureDoc(uid: string, email: string | null): Promise<void> {
    await this.accountData.ensureUserDoc({ uid, email });
  }

  // --- OAuth helpers (unchanged) ---

  private getCalendarExchangeEndpoint(): string {
    const projectId = this.auth.app.options.projectId;
    if (!projectId) {
      throw new Error('Missing Firebase project ID configuration.');
    }

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://127.0.0.1:5001/${projectId}/us-central1/exchangeGoogleCalendarCode`;
    }

    return `https://us-central1-${projectId}.cloudfunctions.net/exchangeGoogleCalendarCode`;
  }

  private getGmailExchangeEndpoint(): string {
    const projectId = this.auth.app.options.projectId;
    if (!projectId) {
      throw new Error('Missing Firebase project ID configuration.');
    }

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://127.0.0.1:5001/${projectId}/us-central1/exchangeGoogleGmailCode`;
    }

    return `https://us-central1-${projectId}.cloudfunctions.net/exchangeGoogleGmailCode`;
  }

  private async startGoogleCalendarAuth(currentUser: User): Promise<{
    authorizationUrl: string;
    callbackOrigin: string;
  }> {
    const endpoint = this.getCalendarExchangeEndpoint();
    const idToken = await currentUser.getIdToken();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        action: 'start',
        origin: window.location.origin,
      }),
    });

    const payload = (await response.json()) as {
      authorizationUrl?: unknown;
      callbackOrigin?: unknown;
      error?: unknown;
    };
    if (!response.ok) {
      const errorMessage =
        typeof payload.error === 'string' ? payload.error : 'Failed to start OAuth';
      throw new Error(errorMessage);
    }

    if (
      typeof payload.authorizationUrl !== 'string' ||
      typeof payload.callbackOrigin !== 'string'
    ) {
      throw new Error('OAuth start response was missing required fields.');
    }

    return {
      authorizationUrl: payload.authorizationUrl,
      callbackOrigin: payload.callbackOrigin,
    };
  }

  private async startGoogleGmailAuth(currentUser: User): Promise<{
    authorizationUrl: string;
    callbackOrigin: string;
  }> {
    const endpoint = this.getGmailExchangeEndpoint();
    const idToken = await currentUser.getIdToken();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        action: 'start',
        origin: window.location.origin,
      }),
    });

    const payload = (await response.json()) as {
      authorizationUrl?: unknown;
      callbackOrigin?: unknown;
      error?: unknown;
    };
    if (!response.ok) {
      const errorMessage =
        typeof payload.error === 'string' ? payload.error : 'Failed to start OAuth';
      throw new Error(errorMessage);
    }

    if (
      typeof payload.authorizationUrl !== 'string' ||
      typeof payload.callbackOrigin !== 'string'
    ) {
      throw new Error('OAuth start response was missing required fields.');
    }

    try {
      const redirectUri = new URL(payload.authorizationUrl).searchParams.get(
        'redirect_uri',
      );
      if (redirectUri) {
        console.info('[gmail] Google OAuth redirect_uri', redirectUri);
      } else {
        console.warn('[gmail] Missing redirect_uri in authorization URL');
      }
    } catch {
      console.warn('[gmail] Unable to parse authorization URL for redirect_uri');
    }

    return {
      authorizationUrl: payload.authorizationUrl,
      callbackOrigin: payload.callbackOrigin,
    };
  }

  private openOAuthPopup(url: string, name = 'google-oauth'): Window | null {
    const width = 520;
    const height = 680;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
    return window.open(url, name, features);
  }

  private waitForOAuthResult(
    popup: Window,
    callbackOrigin: string,
    expectedSource: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let popupClosedAtMs: number | null = null;

      const cleanup = (): void => {
        window.removeEventListener('message', onMessage);
        window.clearInterval(closeCheckInterval);
        window.clearTimeout(timeoutHandle);
      };

      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      const onMessage = (event: MessageEvent<unknown>): void => {
        if (event.origin !== callbackOrigin) return;
        if (!event.data || typeof event.data !== 'object') return;

        const payload = event.data as {
          source?: unknown;
          success?: unknown;
          message?: unknown;
        };
        if (payload.source !== expectedSource) return;

        if (payload.success === true) {
          finish();
          return;
        }

        const message =
          typeof payload.message === 'string'
            ? payload.message
            : 'Google Calendar connection failed.';
        finish(new Error(message));
      };

      window.addEventListener('message', onMessage);

      const closeCheckInterval = window.setInterval(() => {
        if (!popup.closed) {
          popupClosedAtMs = null;
          return;
        }

        if (popupClosedAtMs === null) {
          popupClosedAtMs = Date.now();
          return;
        }

        if (Date.now() - popupClosedAtMs >= 1200) {
          finish(
            new Error('Calendar connection was cancelled before it completed.'),
          );
        }
      }, 250);

      const timeoutHandle = window.setTimeout(() => {
        if (!popup.closed) {
          popup.close();
        }
        finish(new Error('Timed out waiting for Google authorization.'));
      }, 5 * 60 * 1000);
    });
  }
}
