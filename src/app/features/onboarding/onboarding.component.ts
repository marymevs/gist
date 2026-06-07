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

// Sample self-descriptions shown in the optional expandable panel under the
// context textarea. Deliberately cross-generational and varied — they show
// what "good" looks like without prescribing a shape (issue #156).
const CONTEXT_EXAMPLES = [
  {
    tag: 'Writer',
    text:
      'I’m a fiction writer working on my second novel — historical, set in 1960s Brooklyn. I teach part-time at a community college, mostly nights, which means my mornings are my real working hours. I live with my partner and our two cats. Outside of writing I’m into long walks, jazz records, and cooking projects that take all weekend. I’m trying to be less reactive to my phone and more present with the people I care about.',
  },
  {
    tag: 'Bar owner',
    text:
      'I own a wine bar in Brooklyn — six employees, busy weekends, slow weekdays. I have ADHD and mornings are the hardest part of my day; I tend to spiral on my phone if I don’t have something to anchor on. My fiancée and I just got engaged; her parents are visiting next month. I’m in a band that practices Tuesdays — I play bass, badly. I’m trying to figure out whether to open a second location.',
  },
  {
    tag: 'Retired professional',
    text:
      'I retired from corporate law three years ago and now I sit on two non-profit boards. I read every morning — newspaper, then a novel. My grandchildren are 4 and 6 and I see them most weekends. I’ve started taking watercolor lessons; I’m bad but it’s the first thing in years I’ve done purely for myself. I want to use my mornings well; I have time now and I don’t want to waste it.',
  },
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
  /** Total onboarding screens. Bumped from 4 → 6 for the expanded questionnaire. */
  readonly maxStep = 6;
  step = 1;

  // Screen 1: Who You Are
  profileName = '';
  profileContext = '';
  showContextExamples = false;

  // Screen 2: Your Days (direct asks)
  majorProject = '';
  morningRoutine = '';
  wakingTime = '';

  // Screen 3: Mornings & What Works (direct asks)
  worstPartOfMorning = '';
  whatWorksPerfectly = '';
  whatWouldMakeYouStop = '';
  executiveFunctionStatus: 'yes' | 'no' | 'prefer-not-to-say' | null = null;

  // Screen 4: Connect Your Data
  calendarStatus: 'idle' | 'connecting' | 'connected' = 'idle';
  gmailStatus: 'idle' | 'connecting' | 'connected' = 'idle';
  showOAuthTrust = false;

  // Screen 5: Preferences
  selectedTone: 'calm' | 'detailed' | 'concise' | null = null;
  selectedTopics: string[] = [];
  selectedRhythms: string[] = [];

  // Screen 6: Delivery time
  // Delivery method itself is not stored — runtime resolveDeliveryMethod()
  // returns 'email' if Gmail is connected, 'web' otherwise.
  // deliveryHour is the displayed 12-hour value (1-12); pair with
  // deliveryMeridiem to compute the 24-hour value written to Firestore
  // (the scheduler reads delivery.schedule.hour as 24h).
  deliveryHour = 7;
  deliveryMeridiem: 'AM' | 'PM' = 'AM';
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
  readonly contextExamples = CONTEXT_EXAMPLES;
  /** [1..maxStep] — drives the step-dot indicator and progress label. */
  readonly stepSequence = Array.from({ length: this.maxStep }, (_, i) => i + 1);

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
      case 3:
        return true; // questionnaire \u2014 all optional
      case 4:
        return this.calendarStatus === 'connected' || this.gmailStatus === 'connected';
      case 5:
      case 6:
        return true; // preferences + delivery \u2014 all optional
      default:
        return false;
    }
  }

  get connectorWarning(): string {
    if (this.step !== 4) return '';
    if (this.calendarStatus === 'connected' || this.gmailStatus === 'connected') return '';
    return 'Your first Gist will be lighter without connected data \u2014 you can always add sources later from Settings.';
  }

  next(): void {
    if (this.step < this.maxStep) {
      this.step++;
    } else {
      this.finishOnboarding();
    }
  }

  toggleContextExamples(): void {
    this.showContextExamples = !this.showContextExamples;
  }

  setExecutiveFunction(status: 'yes' | 'no' | 'prefer-not-to-say'): void {
    this.executiveFunctionStatus =
      this.executiveFunctionStatus === status ? null : status;
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

  /** 24-hour value combining deliveryHour (1-12) + deliveryMeridiem. */
  get deliveryHour24(): number {
    const h12 = this.deliveryHour;
    if (this.deliveryMeridiem === 'PM') {
      return h12 === 12 ? 12 : h12 + 12;
    }
    // AM
    return h12 === 12 ? 0 : h12;
  }

  get formattedDeliveryTime(): string {
    const m = this.deliveryMinute.toString().padStart(2, '0');
    return `${this.deliveryHour}:${m} ${this.deliveryMeridiem}`;
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

    // Save onboarding profile to Firestore.
    // Empty optional fields are written as null (not omitted) so re-running
    // onboarding clears a previously-entered value rather than leaving it stale.
    const orNull = (v: string): string | null => v.trim() || null;
    try {
      await setDoc(
        ref,
        {
          profile: {
            name: this.profileName.trim(),
            context: orNull(this.profileContext),
          },
          prefs: {
            tone: this.selectedTone ?? 'calm',
            topics: this.selectedTopics.length > 0 ? this.selectedTopics : null,
            rhythms: this.selectedRhythms.length > 0 ? this.selectedRhythms : null,
            timezone: this.timezone,
            // Expanded questionnaire (issue #156)
            majorProject: orNull(this.majorProject),
            morningRoutine: orNull(this.morningRoutine),
            wakingTime: orNull(this.wakingTime),
            worstPartOfMorning: orNull(this.worstPartOfMorning),
            whatWorksPerfectly: orNull(this.whatWorksPerfectly),
            whatWouldMakeYouStop: orNull(this.whatWouldMakeYouStop),
            executiveFunctionStatus: this.executiveFunctionStatus ?? null,
          },
          delivery: {
            schedule: {
              hour: this.deliveryHour24,
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
