import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AccountDataService } from '../../core/services/account-data.service';
import { ToastService } from '../../shared/services/toast.service';
import { GistUser, EmailAccount } from '../../core/models/user.model';
import { Observable } from 'rxjs';
import { User, signOut } from 'firebase/auth';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const TONE_OPTIONS = [
  { value: 'calm', label: 'Calm, direct' },
  { value: 'detailed', label: 'Detailed, thorough' },
  { value: 'concise', label: 'Concise, bullet-only' },
] as const;

// Curated IANA timezones for the picker. The user's saved zone is prepended at
// edit time if it isn't already here, so any value remains selectable.
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern — New York' },
  { value: 'America/Chicago', label: 'Central — Chicago' },
  { value: 'America/Denver', label: 'Mountain — Denver' },
  { value: 'America/Phoenix', label: 'Mountain (no DST) — Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska — Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii — Honolulu' },
  { value: 'America/Toronto', label: 'Eastern (Canada) — Toronto' },
  { value: 'America/Sao_Paulo', label: 'Brazil — São Paulo' },
  { value: 'Europe/London', label: 'UK — London' },
  { value: 'Europe/Paris', label: 'Central Europe — Paris' },
  { value: 'Europe/Athens', label: 'Eastern Europe — Athens' },
  { value: 'Asia/Kolkata', label: 'India — Kolkata' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Japan — Tokyo' },
  { value: 'Australia/Sydney', label: 'Australia — Sydney' },
];

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const MINUTE_OPTIONS = [0, 15, 30, 45] as const;

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
  /** Account id currently being disconnected, for per-row button state. */
  disconnectingId: string | null = null;
  isSavingImportantPeople = false;
  isSavingPreferences = false;

  // Important people edit mode
  isEditingImportantPeople = false;
  editImportantPeople: { name: string; relationship: string; email: string }[] =
    [];

  // Preferences edit mode
  isEditingPreferences = false;
  editTone = 'calm';
  editQuietDays: boolean[] = [true, false, false, false, false, false, true]; // Sun=on, Sat=on
  editTimezone = 'America/New_York';
  editDeliveryHour = 7; // 1–12 (display value)
  editDeliveryMinute = 0; // 0/15/30/45
  editDeliveryMeridiem: 'AM' | 'PM' = 'AM';
  // Snapshot of the delivery time when the editor opened — used to detect whether
  // the user actually changed it, so we never overwrite the schedule (or its
  // backend default) just because they edited tone/length/timezone.
  private hadStoredSchedule = false;
  private initialDeliveryHour24 = 7;
  private initialDeliveryMinute = 0;
  // Timezone list for the picker — may gain the user's saved zone at edit time.
  timezoneOptions = [...TIMEZONE_OPTIONS];

  // Security expanded
  isSecurityExpanded = false;

  // Constants for template
  readonly dayLabels = DAY_LABELS;
  readonly toneOptions = TONE_OPTIONS;
  readonly hourOptions = HOUR_OPTIONS;
  readonly minuteOptions = MINUTE_OPTIONS;

  constructor(
    private auth: Auth,
    private functions: Functions,
    private accountData: AccountDataService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
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
    return 'Not connected';
  }

  /**
   * Connected Gmail inboxes for display (issue #184). Prefers the emailAccounts
   * registry; falls back to a synthetic single entry for pre-#184 users who
   * have a connection but no registry yet (until the migration backfills them).
   */
  emailAccounts(user: GistUser | null): EmailAccount[] {
    if (!user) return [];
    const registry = user.emailAccounts ?? [];
    const seen = new Set(registry.map((a) => a.email?.toLowerCase()));
    const list = [...registry];
    // A connection made before the emailAccounts registry existed lives only on
    // user.email + emailIntegration. Show it alongside registry entries (not
    // instead of them) so adding a second inbox doesn't hide the original.
    if (
      user.emailIntegration?.status === 'connected' &&
      user.email &&
      !seen.has(user.email.toLowerCase())
    ) {
      list.unshift({ id: 'gmail', email: user.email, status: 'connected' });
    }
    return list;
  }

  async onDisconnectEmail(account: EmailAccount): Promise<void> {
    if (this.disconnectingId) return;
    this.disconnectingId = account.id;
    try {
      const disconnect = httpsCallable<
        { accountId: string },
        { success: boolean; remaining: number }
      >(this.functions, 'disconnectEmailAccount');
      await disconnect({ accountId: account.id });
      this.toast.show(`Disconnected ${account.email}.`, 'success');
    } catch {
      this.toast.show('Unable to disconnect. Please try again.', 'error');
    } finally {
      this.disconnectingId = null;
    }
  }

  async onConnectGoogleCalendar(): Promise<void> {
    if (this.isConnectingCalendar) return;

    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      this.toast.show(
        'Please sign in before connecting your calendar.',
        'error',
      );
      return;
    }

    this.isConnectingCalendar = true;

    // Open the popup synchronously, inside the tap handler, so mobile browsers
    // (iOS Safari / Chrome Android) don't treat it as an unsolicited popup. Any
    // await before window.open() expires the user-gesture token and the popup is
    // blocked. We point it at about:blank now and navigate it to Google once the
    // authorization URL comes back from the server.
    const popup = this.openOAuthPopup('about:blank', 'google-calendar-oauth');
    if (!popup) {
      this.isConnectingCalendar = false;
      this.toast.show(
        'Popup was blocked. Please allow popups and try again.',
        'error',
      );
      return;
    }

    try {
      const { authorizationUrl, callbackOrigin } =
        await this.startGoogleCalendarAuth(currentUser);
      popup.location.href = authorizationUrl;

      await this.waitForOAuthResult(
        popup,
        callbackOrigin,
        'google-calendar-oauth',
      );
      this.toast.show('Google Calendar connected.', 'success');
    } catch (error) {
      if (!popup.closed) popup.close();
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

    // Open the popup synchronously, inside the tap handler, so mobile browsers
    // (iOS Safari / Chrome Android) don't treat it as an unsolicited popup. Any
    // await before window.open() expires the user-gesture token and the popup is
    // blocked. We point it at about:blank now and navigate it to Google once the
    // authorization URL comes back from the server.
    const popup = this.openOAuthPopup('about:blank', 'google-gmail-oauth');
    if (!popup) {
      this.isConnectingGmail = false;
      this.toast.show(
        'Popup was blocked. Please allow popups and try again.',
        'error',
      );
      return;
    }

    try {
      const { authorizationUrl, callbackOrigin } =
        await this.startGoogleGmailAuth(currentUser);
      popup.location.href = authorizationUrl;

      await this.waitForOAuthResult(
        popup,
        callbackOrigin,
        'google-gmail-oauth',
      );
      this.toast.show('Gmail connected.', 'success');
    } catch (error) {
      if (!popup.closed) popup.close();
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to connect Gmail. Please try again.';
      this.toast.show(message, 'error');
    } finally {
      this.isConnectingGmail = false;
    }
  }

  // --- Important people ---

  /** Comma-joined names for the read-only summary. */
  importantPeopleLabel(user: GistUser): string {
    const people = user.prefs?.importantPeople ?? [];
    if (people.length === 0) return 'None yet';
    return people.map((p) => p.name).join(', ');
  }

  onEditImportantPeople(user: GistUser): void {
    this.editImportantPeople = (user.prefs?.importantPeople ?? []).map((p) => ({
      name: p.name ?? '',
      relationship: p.relationship ?? '',
      email: p.email ?? '',
    }));
    if (this.editImportantPeople.length === 0) this.addImportantPerson();
    this.isEditingImportantPeople = true;
  }

  addImportantPerson(): void {
    if (this.editImportantPeople.length >= 30) return;
    this.editImportantPeople.push({ name: '', relationship: '', email: '' });
  }

  removeImportantPerson(index: number): void {
    this.editImportantPeople.splice(index, 1);
  }

  onCancelImportantPeople(): void {
    this.isEditingImportantPeople = false;
  }

  async onSaveImportantPeople(user: GistUser): Promise<void> {
    if (this.isSavingImportantPeople) return;
    if (!user?.uid) {
      this.toast.show('Sign in to save important people.', 'error');
      return;
    }

    // Name is required; relationship and email are optional. An email only
    // counts (and becomes a VIP sender) if it looks like an address.
    const people = this.editImportantPeople
      .map((p) => {
        const email = p.email.trim().toLowerCase();
        const entry: { name: string; relationship: string; email?: string } = {
          name: p.name.trim(),
          relationship: p.relationship.trim(),
        };
        if (email.includes('@')) entry.email = email;
        return entry;
      })
      .filter((p) => p.name)
      .slice(0, 30);

    this.isSavingImportantPeople = true;
    try {
      await this.accountData.updateImportantPeople(user.uid, people);
      this.isEditingImportantPeople = false;
      this.toast.show('Important people saved.', 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save important people right now.';
      this.toast.show(message, 'error');
    } finally {
      this.isSavingImportantPeople = false;
    }
  }

  // --- Preferences edit ---

  onEditPreferences(user: GistUser): void {
    this.editTone = user.prefs?.tone ?? 'calm';
    const quietDays = user.prefs?.quietDays ?? [0, 6]; // default Sun, Sat
    this.editQuietDays = DAY_LABELS.map((_, i) => quietDays.includes(i));

    // Timezone — default to the browser's zone if the user has none saved.
    this.editTimezone =
      user.prefs?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      'America/New_York';
    // Ensure the saved zone is selectable even if it's not in the curated list.
    this.timezoneOptions = TIMEZONE_OPTIONS.some(
      (o) => o.value === this.editTimezone,
    )
      ? [...TIMEZONE_OPTIONS]
      : [{ value: this.editTimezone, label: this.editTimezone }, ...TIMEZONE_OPTIONS];

    // Delivery time — stored as 24h; present as 12h + meridiem. When the user
    // has no stored schedule, show 7:00 AM as a hint but remember it was unset
    // so we don't persist it unless they actually pick a time.
    this.hadStoredSchedule = user.delivery?.schedule?.hour != null;
    const hour24 = user.delivery?.schedule?.hour ?? 7;
    this.editDeliveryMinute = user.delivery?.schedule?.minute ?? 0;
    this.editDeliveryMeridiem = hour24 >= 12 ? 'PM' : 'AM';
    this.editDeliveryHour = hour24 % 12 === 0 ? 12 : hour24 % 12;
    this.initialDeliveryHour24 = this.editDeliveryHour24;
    this.initialDeliveryMinute = this.editDeliveryMinute;

    this.isEditingPreferences = true;
  }

  /** Combine the 12h editor fields back into a 0–23 hour. */
  private get editDeliveryHour24(): number {
    const h = this.editDeliveryHour % 12;
    return this.editDeliveryMeridiem === 'PM' ? h + 12 : h;
  }

  onCancelPreferences(): void {
    this.isEditingPreferences = false;
  }

  async onSavePreferences(user: GistUser): Promise<void> {
    if (this.isSavingPreferences || !user?.uid) return;

    const quietDays = this.editQuietDays
      .map((checked, i) => (checked ? i : -1))
      .filter((i) => i >= 0);

    // Only persist the delivery schedule if the user already had one or actually
    // changed the time here — otherwise editing tone/timezone would silently
    // overwrite an unset schedule (and its backend default).
    const scheduleChanged =
      this.editDeliveryHour24 !== this.initialDeliveryHour24 ||
      this.editDeliveryMinute !== this.initialDeliveryMinute;
    const delivery =
      this.hadStoredSchedule || scheduleChanged
        ? {
            schedule: {
              hour: this.editDeliveryHour24,
              minute: this.editDeliveryMinute,
            },
          }
        : undefined;

    this.isSavingPreferences = true;
    try {
      await this.accountData.updatePreferences(
        user.uid,
        {
          tone: this.editTone,
          quietDays,
          timezone: this.editTimezone,
        },
        delivery,
      );
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

  toneLabel(user: GistUser): string {
    const val = user.prefs?.tone ?? 'calm';
    return TONE_OPTIONS.find((o) => o.value === val)?.label ?? 'Calm, direct';
  }

  quietDaysLabel(user: GistUser): string {
    const days = user.prefs?.quietDays ?? [0, 6];
    if (days.length === 0) return 'None';
    return days.map((d) => DAY_LABELS[d]).join(', ');
  }

  timezoneLabel(user: GistUser): string {
    const tz = user.prefs?.timezone;
    if (!tz) return 'Not set';
    return TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz;
  }

  deliveryTimeLabel(user: GistUser): string {
    const sched = user.delivery?.schedule;
    if (sched?.hour == null) return '7:00 AM';
    const minute = sched.minute ?? 0;
    const ampm = sched.hour >= 12 ? 'PM' : 'AM';
    const displayHour = sched.hour % 12 === 0 ? 12 : sched.hour % 12;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
  }

  // --- Security ---

  toggleSecurity(): void {
    this.isSecurityExpanded = !this.isSecurityExpanded;
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      // Firebase clears the auth session; Firestore observables re-emit null and
      // the component is destroyed on navigation, so no manual state cleanup is
      // needed. Send the user back to the public landing page.
      await this.router.navigate(['/']);
    } catch {
      this.toast.show('Could not log out. Please try again.', 'error');
    }
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
        typeof payload.error === 'string'
          ? payload.error
          : 'Failed to start OAuth';
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
        typeof payload.error === 'string'
          ? payload.error
          : 'Failed to start OAuth';
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
      console.warn(
        '[gmail] Unable to parse authorization URL for redirect_uri',
      );
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

      const timeoutHandle = window.setTimeout(
        () => {
          if (!popup.closed) {
            popup.close();
          }
          finish(new Error('Timed out waiting for Google authorization.'));
        },
        5 * 60 * 1000,
      );
    });
  }
}
