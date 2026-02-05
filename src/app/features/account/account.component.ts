import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { AccountDataService } from '../../core/services/account-data.service';
import { GistUser } from '../../core/models/user.model';
import { Observable } from 'rxjs';
import { User, signOut } from 'firebase/auth';

type Plan = 'web' | 'paper' | 'loop';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
})
export class AccountComponent {
  userDoc$: Observable<GistUser | null> = this.accountData.currentUserDoc$();
  authUser$ = user(this.auth);
  isConnectingCalendar = false;
  isConnectingGmail = false;

  inputs = {
    calendarStatus: 'Not connected',
    emailStatus: 'Not connected',
    weatherLocation: 'New York, NY',
    newsDomains: 'Tech, Business, Culture',
  };

  prefs = {
    lengthLabel: 'Standard (2 pages)',
    toneLabel: 'Calm, direct',
    quietDays: 'Sat, Sun',
  };

  billing = {
    planLabel: 'print',
    nextInvoiceLabel: 'Feb 10',
    includedSendsLabel: '30 / month',
  };

  security = {
    email: 'you@domain.com',
    twoFaStatus: 'Not enabled',
    dataStatus: 'Export available',
  };

  constructor(
    private auth: Auth,
    private accountData: AccountDataService,
  ) {}
  // --- Click handlers (wire these later) ---

  onManageConnections(): void {
    // Later: route to a Connections page or open a modal
    alert('Demo: Manage connections (Calendar / Weather / News sources).');
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
      alert('Please sign in before connecting your calendar.');
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
      alert('Google Calendar connected.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to connect Google Calendar. Please try again.';
      alert(message);
    } finally {
      this.isConnectingCalendar = false;
    }
  }

  async onConnectGmail(): Promise<void> {
    if (this.isConnectingGmail) return;

    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      alert('Please sign in before connecting Gmail.');
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
      alert('Gmail connected.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to connect Gmail. Please try again.';
      alert(message);
    } finally {
      this.isConnectingGmail = false;
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

  onEditPreferences(): void {
    // Later: route to Preferences page
    alert('Demo: Edit tone, length, quiet days.');
  }

  onChangePlan(): void {
    // Later: open Stripe Checkout or customer portal
    alert('Demo: Change plan (Stripe).');
  }

  onViewInvoices(): void {
    // Later: open Stripe customer portal invoices view
    alert('Demo: View invoices (Stripe).');
  }

  onManageSecurity(): void {
    // Later: route to security settings; 2FA depends on auth provider
    alert('Demo: Manage security (email / 2FA / export).');
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  // Optional: call this from template if you detect missing doc
  async ensureDoc(uid: string, email: string | null): Promise<void> {
    await this.accountData.ensureUserDoc({ uid, email });
  }

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

  // Optional: if you want to navigate instead of alerts, use these patterns:
  // this.router.navigate(['/delivery']);
  // this.router.navigate(['/account/preferences']);
}
