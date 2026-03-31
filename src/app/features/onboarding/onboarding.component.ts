import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
  docData,
} from '@angular/fire/firestore';
import { User } from 'firebase/auth';
import { Subscription } from 'rxjs';
import { ToastService } from '../../shared/services/toast.service';
import type { GistUser } from '../../core/models/user.model';

const TOPIC_CHIPS = [
  'Markets & finance',
  'Tech & startups',
  'World news',
  'Science',
  'Health & wellness',
  'Sports',
  'Culture & arts',
  'Local news',
] as const;

const RHYTHM_CHIPS = [
  'Morning quiet time',
  'Commute briefing',
  'Before first meeting',
  'With coffee',
  'Lunchtime catch-up',
] as const;

const LOADING_MESSAGES = [
  'Checking tomorrow\u2019s forecast\u2026',
  'Reading your calendar\u2026',
  'Scanning the morning headlines\u2026',
  'Writing your morning briefing\u2026',
  'Composing your first Gist\u2026',
] as const;

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.scss'],
})
export class OnboardingComponent implements OnInit, OnDestroy {
  step = 1;

  // Screen 1: Who You Are
  profileName = '';
  profileContext = '';

  // Screen 2: Connect Your Data
  calendarStatus: 'idle' | 'connecting' | 'connected' = 'idle';
  gmailStatus: 'idle' | 'connecting' | 'connected' = 'idle';
  showOAuthTrust = false;

  // Screen 3: Preferences
  selectedTone: 'calm' | 'detailed' | 'concise' | null = null;
  selectedTopics: string[] = [];
  selectedRhythms: string[] = [];

  // Screen 4: Delivery
  deliveryMethod: 'web' | 'email' = 'web';
  deliveryHour = 7;
  deliveryMinute = 30;
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Loading state (post-onboarding)
  isGenerating = false;
  loadingMessageIndex = 0;
  generationFailed = false;

  // Constants for template
  readonly topicChips = TOPIC_CHIPS;
  readonly rhythmChips = RHYTHM_CHIPS;
  readonly loadingMessages = LOADING_MESSAGES;

  private authUser: User | null = null;
  private userSub?: Subscription;
  private loadingInterval?: ReturnType<typeof setInterval>;
  private loadingTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.userSub = user(this.auth).subscribe((u) => {
      this.authUser = u;
      if (!u) {
        this.router.navigate(['/login']);
      }
    });

    // Check if user already has integration status from Firestore
    const authSub = user(this.auth).subscribe((u) => {
      if (!u) return;
      authSub.unsubscribe();

      const ref = doc(this.firestore, 'users', u.uid);
      docData(ref).subscribe((data) => {
        if (!data) return;
        const d = data as Partial<GistUser>;
        if (d.calendarIntegration?.status === 'connected' || d.calendarIntegration?.connectedAt) {
          this.calendarStatus = 'connected';
        }
        if (d.emailIntegration?.status === 'connected' || d.emailIntegration?.connectedAt) {
          this.gmailStatus = 'connected';
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    if (this.loadingInterval) clearInterval(this.loadingInterval);
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  get canAdvance(): boolean {
    switch (this.step) {
      case 1:
        return this.profileName.trim().length > 0;
      case 2:
        return this.calendarStatus === 'connected' || this.gmailStatus === 'connected';
      case 3:
        return true; // all optional
      case 4:
        return true;
      default:
        return false;
    }
  }

  get connectorWarning(): string {
    if (this.step !== 2) return '';
    if (this.calendarStatus === 'connected' || this.gmailStatus === 'connected') return '';
    return 'Your first Gist will be lighter without connected data \u2014 you can always add sources later from Settings.';
  }

  next(): void {
    if (this.step < 4) {
      this.step++;
    } else {
      this.finishOnboarding();
    }
  }

  back(): void {
    if (this.step > 1) {
      this.step--;
    }
  }

  // ── Screen 2: OAuth ─────────────────────────────────────────────────────────

  async connectCalendar(): Promise<void> {
    if (this.calendarStatus !== 'idle' || !this.authUser) return;

    this.calendarStatus = 'connecting';
    this.showOAuthTrust = true;

    try {
      const { authorizationUrl, callbackOrigin } = await this.startOAuth(
        this.authUser,
        'calendar',
      );
      const popup = this.openOAuthPopup(authorizationUrl, 'google-calendar-oauth');
      if (!popup) throw new Error('Popup was blocked. Please allow popups and try again.');

      await this.waitForOAuthResult(popup, callbackOrigin, 'google-calendar-oauth');
      this.calendarStatus = 'connected';
      this.toast.show('Google Calendar connected.', 'success');
    } catch (e) {
      this.calendarStatus = 'idle';
      const msg = e instanceof Error ? e.message : 'Unable to connect Calendar.';
      this.toast.show(msg, 'error');
    } finally {
      this.showOAuthTrust = false;
    }
  }

  async connectGmail(): Promise<void> {
    if (this.gmailStatus !== 'idle' || !this.authUser) return;

    this.gmailStatus = 'connecting';
    this.showOAuthTrust = true;

    try {
      const { authorizationUrl, callbackOrigin } = await this.startOAuth(
        this.authUser,
        'gmail',
      );
      const popup = this.openOAuthPopup(authorizationUrl, 'google-gmail-oauth');
      if (!popup) throw new Error('Popup was blocked. Please allow popups and try again.');

      await this.waitForOAuthResult(popup, callbackOrigin, 'google-gmail-oauth');
      this.gmailStatus = 'connected';
      this.toast.show('Gmail connected.', 'success');
    } catch (e) {
      this.gmailStatus = 'idle';
      const msg = e instanceof Error ? e.message : 'Unable to connect Gmail.';
      this.toast.show(msg, 'error');
    } finally {
      this.showOAuthTrust = false;
    }
  }

  // ── Screen 3: Chips ─────────────────────────────────────────────────────────

  toggleTone(tone: 'calm' | 'detailed' | 'concise'): void {
    this.selectedTone = this.selectedTone === tone ? null : tone;
  }

  toggleTopic(topic: string): void {
    const idx = this.selectedTopics.indexOf(topic);
    if (idx >= 0) {
      this.selectedTopics.splice(idx, 1);
    } else {
      this.selectedTopics.push(topic);
    }
  }

  toggleRhythm(rhythm: string): void {
    const idx = this.selectedRhythms.indexOf(rhythm);
    if (idx >= 0) {
      this.selectedRhythms.splice(idx, 1);
    } else {
      this.selectedRhythms.push(rhythm);
    }
  }

  isTopicSelected(topic: string): boolean {
    return this.selectedTopics.includes(topic);
  }

  isRhythmSelected(rhythm: string): boolean {
    return this.selectedRhythms.includes(rhythm);
  }

  // ── Screen 4: Delivery ──────────────────────────────────────────────────────

  get formattedDeliveryTime(): string {
    const h = this.deliveryHour;
    const m = this.deliveryMinute;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // ── Finish ──────────────────────────────────────────────────────────────────

  async finishOnboarding(): Promise<void> {
    if (!this.authUser) return;

    this.isGenerating = true;
    this.loadingMessageIndex = 0;
    this.generationFailed = false;

    // Start rotating loading messages
    this.loadingInterval = setInterval(() => {
      this.loadingMessageIndex =
        (this.loadingMessageIndex + 1) % LOADING_MESSAGES.length;
    }, 2500);

    const uid = this.authUser.uid;
    const ref = doc(this.firestore, 'users', uid);

    // Save onboarding profile to Firestore
    try {
      await setDoc(
        ref,
        {
          profile: {
            name: this.profileName.trim(),
            context: this.profileContext.trim() || null,
          },
          prefs: {
            tone: this.selectedTone ?? 'calm',
            topics: this.selectedTopics.length > 0 ? this.selectedTopics : null,
            rhythms: this.selectedRhythms.length > 0 ? this.selectedRhythms : null,
            timezone: this.timezone,
          },
          delivery: {
            method: this.deliveryMethod,
            schedule: {
              hour: this.deliveryHour,
              minute: this.deliveryMinute,
            },
          },
          onboardingComplete: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (e) {
      this.toast.show('Failed to save your preferences. Please try again.', 'error');
      this.isGenerating = false;
      if (this.loadingInterval) clearInterval(this.loadingInterval);
      return;
    }

    // Trigger instant preview generation
    try {
      const idToken = await this.authUser.getIdToken();
      const projectId = this.auth.app.options.projectId;
      const hostname = window.location.hostname;
      const baseUrl =
        hostname === 'localhost' || hostname === '127.0.0.1'
          ? `http://127.0.0.1:5001/${projectId}/us-central1`
          : `https://us-central1-${projectId}.cloudfunctions.net`;

      const resp = await fetch(`${baseUrl}/generateGistOnDemand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!resp.ok) throw new Error('Generation failed');

      // Generation succeeded — navigate to today
      if (this.loadingInterval) clearInterval(this.loadingInterval);
      this.router.navigate(['/today']);
    } catch {
      // 30s timeout fallback
      this.loadingTimeout = setTimeout(() => {
        this.generationFailed = true;
        if (this.loadingInterval) clearInterval(this.loadingInterval);
      }, 30000);

      // If already past 30s or fetch failed immediately, show fallback
      this.generationFailed = true;
      if (this.loadingInterval) clearInterval(this.loadingInterval);
    }
  }

  goToToday(): void {
    this.router.navigate(['/today']);
  }

  // ── OAuth helpers ───────────────────────────────────────────────────────────

  private getExchangeEndpoint(type: 'calendar' | 'gmail'): string {
    const projectId = this.auth.app.options.projectId;
    if (!projectId) throw new Error('Missing Firebase project ID.');

    const fn =
      type === 'calendar'
        ? 'exchangeGoogleCalendarCode'
        : 'exchangeGoogleGmailCode';

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://127.0.0.1:5001/${projectId}/us-central1/${fn}`;
    }
    return `https://us-central1-${projectId}.cloudfunctions.net/${fn}`;
  }

  private async startOAuth(
    currentUser: User,
    type: 'calendar' | 'gmail',
  ): Promise<{ authorizationUrl: string; callbackOrigin: string }> {
    const endpoint = this.getExchangeEndpoint(type);
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
      const msg =
        typeof payload.error === 'string' ? payload.error : 'Failed to start OAuth';
      throw new Error(msg);
    }
    if (
      typeof payload.authorizationUrl !== 'string' ||
      typeof payload.callbackOrigin !== 'string'
    ) {
      throw new Error('OAuth response missing required fields.');
    }
    return {
      authorizationUrl: payload.authorizationUrl,
      callbackOrigin: payload.callbackOrigin,
    };
  }

  private openOAuthPopup(url: string, name: string): Window | null {
    const w = 520, h = 680;
    const left = Math.max(0, (window.screen.width - w) / 2);
    const top = Math.max(0, (window.screen.height - h) / 2);
    return window.open(url, name, `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
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
        clearInterval(closeCheck);
        clearTimeout(timeout);
      };

      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        error ? reject(error) : resolve();
      };

      const onMessage = (event: MessageEvent<unknown>): void => {
        if (event.origin !== callbackOrigin) return;
        if (!event.data || typeof event.data !== 'object') return;
        const p = event.data as { source?: unknown; success?: unknown; message?: unknown };
        if (p.source !== expectedSource) return;
        if (p.success === true) { finish(); return; }
        finish(new Error(typeof p.message === 'string' ? p.message : 'Connection failed.'));
      };

      window.addEventListener('message', onMessage);

      const closeCheck = setInterval(() => {
        if (!popup.closed) { popupClosedAtMs = null; return; }
        if (popupClosedAtMs === null) { popupClosedAtMs = Date.now(); return; }
        if (Date.now() - popupClosedAtMs >= 1200) {
          finish(new Error('Connection was cancelled.'));
        }
      }, 250);

      const timeout = setTimeout(() => {
        if (!popup.closed) popup.close();
        finish(new Error('Timed out waiting for authorization.'));
      }, 5 * 60 * 1000);
    });
  }
}
