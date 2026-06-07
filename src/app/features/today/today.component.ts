import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { doc, docData } from '@angular/fire/firestore';

import { Auth, authState } from '@angular/fire/auth';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { Observable, of, combineLatest, tap } from 'rxjs';
import { map, switchMap, startWith, shareReplay } from 'rxjs/operators';

import { ToastService } from '../../shared/services/toast.service';

type DayItem = { time?: string; title: string; note?: string };
type WorldItem = { headline: string; implication: string };
type EmailCard = {
  id: string;
  threadId: string;
  messageId: string;
  fromName?: string;
  fromEmail?: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  category: 'Action' | 'WaitingOn' | 'FYI';
  urgency: number;
  importance: number;
  why: string;
  suggestedNextStep?: string;
};

type NewspaperData = {
  lede?: { kicker?: string; headline?: string; paragraph?: string };
  schedule?: Array<{
    time?: string;
    emoji?: string;
    name?: string;
    note?: string;
  }>;
  notifications?: Array<{ emoji?: string; source?: string; body?: string }>;
  goodNews?: Array<{ headline?: string; summary?: string }>;
  people?: Array<{ name?: string; nudge?: string }>;
  quote?: { text?: string; attribution?: string };
  bodyMind?: {
    sectionLabel?: string;
    title?: string;
    paragraphs?: string[];
    coachingNote?: string;
  };
  practiceArc?: {
    sectionLabel?: string;
    title?: string;
    items?: Array<{ label?: string; text?: string }>;
    closingNote?: string;
  };
  moonHighlight?: { title?: string; paragraph?: string };
  closingThought?: string;
  personalQuote?: { text?: string; attribution?: string };
};

type NewspaperMeta = {
  subscriberName?: string;
  location?: string;
  dateFormatted?: string;
  deliveryTime?: string;
  volumeIssue?: string;
  weather?: {
    tempNow?: string;
    conditions?: string;
    forecast?: Array<{ day?: string; high?: string; condition?: string }>;
  };
  rhythms?: {
    moon?: string;
    season?: string;
    light?: string;
    countdown?: string;
  };
  moonFooter?: string;
  seasonFooter?: string;
  intentionPrompt?: string;
};

type MorningGist = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  timezone: string;

  weatherSummary: string;
  moonPhase?: string;
  firstEvent?: string;

  dayItems: DayItem[];
  worldItems: WorldItem[];
  emailCards: EmailCard[];

  newspaper?: NewspaperData & NewspaperMeta;

  delivery?: {
    method: 'web' | 'email';
    pages: number;
    status: 'queued' | 'delivered' | 'failed' | string;
    deliveredAt?: Timestamp;
  };

  createdAt?: Timestamp;
};

/**
 * Validate an IANA timezone, falling back to America/New_York — mirrors the
 * server's safeTimezone() so the client computes the SAME date key the server
 * stored the gist under.
 */
function safeTimezone(tz?: string): string {
  if (!tz) return 'America/New_York';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'America/New_York';
  }
}

/** Today's date key (YYYY-MM-DD) in the given timezone. */
function todayDateKey(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Short timezone abbreviation for a zone right now, e.g. "PDT", "EST". */
function tzAbbr(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Minimal slice of the user doc the /today view needs for tz-aware display. */
type TodayUserDoc = {
  prefs?: { timezone?: string; city?: string };
  delivery?: { schedule?: { hour?: number; minute?: number } };
};

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './today.component.html',
  styleUrls: ['./today.component.scss'],
  providers: [DatePipe],
})
export class TodayComponent {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);
  private datePipe = inject(DatePipe);
  private functions = inject(Functions);
  private toast = inject(ToastService);

  // UI state
  hasGistToday = false;
  pdfLoading = false;
  isGenerating = false;
  isResending = false;

  // Toolbar / sidebar text — derived from gist$ in constructor
  metaText = '—';
  statusText = '—';

  // === Firestore-backed streams for template ===

  // The signed-in user's doc — drives the timezone used to pick "today" and
  // the meta header (city + delivery schedule). Shared so we open one listener.
  userDoc$: Observable<TodayUserDoc | null> = authState(this.auth).pipe(
    switchMap((user) => {
      if (!user) return of(null);
      const ref = doc(this.db, `users/${user.uid}`);
      return docData(ref) as Observable<TodayUserDoc>;
    }),
    startWith(null),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  gist$: Observable<MorningGist | null> = combineLatest([
    authState(this.auth),
    this.userDoc$,
  ]).pipe(
    tap(([u]) => console.log('authState emitted:', u?.uid ?? null)),
    switchMap(([user, udoc]) => {
      if (!user) return of(null);

      // Use the user's own timezone so we fetch the same date key the server
      // stored the gist under. Falls back to America/New_York (matching the
      // server's safeTimezone) when the pref is missing or invalid.
      const tz = safeTimezone(udoc?.prefs?.timezone);
      const dateKey = todayDateKey(tz); // 'YYYY-MM-DD'
      const gistDocRef = doc(
        this.db,
        `users/${user.uid}/morningGists/${dateKey}`,
      );

      return docData(gistDocRef, { idField: 'id' }).pipe(
        map((data) => (data as MorningGist) ?? null),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor() {
    // Derive the toolbar/sidebar text bindings (metaText/statusText) from the
    // gist doc — delivery.status now lives on the gist itself.
    combineLatest([
      this.gist$.pipe(startWith(null)),
      this.userDoc$,
    ])
      .pipe(map(([gist, udoc]) => this.computeHeaderText(gist, udoc)))
      .subscribe(({ metaText, statusText }) => {
        this.metaText = metaText;
        this.statusText = statusText;
      });

    // Track whether a gist exists for today (controls PDF button state)
    this.gist$.subscribe((gist) => {
      this.hasGistToday = !!gist;
    });
  }

  // === UI actions ===
  onPrint(): void {
    window.print();
  }

  async onDownloadPdf(): Promise<void> {
    if (!this.hasGistToday || this.pdfLoading) return;
    this.pdfLoading = true;
    try {
      const token = await this.auth.currentUser?.getIdToken();
      if (!token) return;
      const response = await fetch('/api/generateGistPdf', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        alert("PDF couldn't be generated.");
        return;
      }
      const html = await response.text();
      // Open in new tab for print-to-PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch {
      alert("PDF couldn't be generated.");
    } finally {
      this.pdfLoading = false;
    }
  }

  async onResend(): Promise<void> {
    if (this.isResending) return;
    this.isResending = true;
    try {
      const fn = httpsCallable(this.functions, 'resendMorningGist');
      await fn({});
      this.toast.show('Gist resend queued.', 'success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to resend — try again later.';
      this.toast.show(message, 'error');
    } finally {
      this.isResending = false;
    }
  }

  async onGenerateOnDemand(): Promise<void> {
    if (this.isGenerating) return;
    this.isGenerating = true;
    try {
      const token = await this.auth.currentUser?.getIdToken();
      if (!token) return;
      const projectId = this.auth.app.options.projectId;
      const h = window.location.hostname;
      const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '::1';
      const baseUrl = isLocal
        ? `http://localhost:5001/${projectId}/us-central1`
        : `https://us-central1-${projectId}.cloudfunctions.net`;
      const resp = await fetch(`${baseUrl}/generateGistOnDemand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error(`Generation failed: ${resp.status}`);
      // gist$ is a real-time Firestore listener — page updates automatically
    } catch (err) {
      console.error('generateGistOnDemand failed', err);
    } finally {
      this.isGenerating = false;
    }
  }

  onEditTomorrow(): void {
    this.router.navigate(['/account'], {
      queryParams: { section: 'preferences' },
    });
  }

  goToSchedule(): void {
    this.router.navigate(['/account'], {
      queryParams: { section: 'preferences' },
    });
  }

  // === Newspaper view model ===
  /** Normalize gist data into the broadsheet view model.
   *  If newspaper data exists, use it. Otherwise build from legacy fields. */
  np(gist: MorningGist) {
    const n = gist.newspaper;
    if (n?.lede) {
      // Full newspaper data — use as-is with defaults
      return {
        subscriberName: n.subscriberName || 'You',
        location: n.location || 'Your City',
        dateFormatted: n.dateFormatted || this.prettyDateFromDateKey(gist.date),
        deliveryTime: n.deliveryTime || '',
        volumeIssue: n.volumeIssue || '',
        weather: {
          tempNow: n.weather?.tempNow || '—',
          conditions: n.weather?.conditions || gist.weatherSummary || '',
          forecast: n.weather?.forecast || [],
        },
        rhythms: n.rhythms || { moon: '', season: '', light: '' },
        lede: n.lede,
        schedule: n.schedule || [],
        goodNews: n.goodNews || [],
        notifications: n.notifications || [],
        people: n.people || [],
        quote: n.quote,
        bodyMind: n.bodyMind,
        practiceArc: n.practiceArc,
        moonHighlight: n.moonHighlight,
        closingThought: n.closingThought || '',
        personalQuote: n.personalQuote,
        moonFooter: n.moonFooter || '',
        seasonFooter: n.seasonFooter || '',
        intentionPrompt:
          n.intentionPrompt ||
          'What would make today feel complete — not just productive, but good?',
        hasPage2: !!(n.bodyMind || n.practiceArc),
      };
    }

    // Legacy fallback — build newspaper-shaped data from old fields
    return {
      subscriberName: 'You',
      location: 'Your City',
      dateFormatted: this.prettyDateFromDateKey(gist.date),
      deliveryTime: '',
      volumeIssue: '',
      weather: {
        tempNow: gist.weatherSummary?.match(/\d+°/)?.[0] || '—',
        conditions: gist.weatherSummary || '',
        forecast: [] as Array<{
          day?: string;
          high?: string;
          condition?: string;
        }>,
      },
      rhythms: { moon: gist.moonPhase || '', season: '', light: '' } as {
        moon: string;
        season: string;
        light: string;
        countdown?: string;
      },
      lede: {
        kicker: 'Good Morning',
        headline: gist.newspaper?.lede?.headline || 'Your Daily Briefing',
        paragraph: gist.newspaper?.lede?.paragraph || '',
      },
      schedule: (gist.dayItems || []).map((d) => ({
        time: d.time || '',
        emoji: '',
        name: d.title,
        note: d.note || '',
      })),
      goodNews: (gist.worldItems || []).map((w) => ({
        headline: w.headline,
        summary: w.implication,
      })),
      notifications: (gist.emailCards || []).map((e) => ({
        emoji:
          e.category === 'Action'
            ? '📧'
            : e.category === 'WaitingOn'
              ? '⏳'
              : '📋',
        source: e.fromName || e.fromEmail || e.subject,
        body:
          e.snippet + (e.suggestedNextStep ? ` → ${e.suggestedNextStep}` : ''),
      })),
      people: [] as Array<{ name: string; nudge: string }>,
      quote: null as { text: string; attribution: string } | null,
      bodyMind: null as {
        sectionLabel: string;
        title: string;
        paragraphs: string[];
        coachingNote?: string;
      } | null,
      practiceArc: null as {
        sectionLabel: string;
        title: string;
        items: Array<{ label: string; text: string }>;
        closingNote?: string;
      } | null,
      moonHighlight: null as { title: string; paragraph: string } | null,
      closingThought: '',
      personalQuote: null as { text: string; attribution: string } | null,
      moonFooter: gist.moonPhase || '',
      seasonFooter: '',
      intentionPrompt:
        'What would make today feel complete — not just productive, but good?',
      hasPage2: false,
    };
  }

  // === Helpers ===
  private computeHeaderText(
    gist: MorningGist | null,
    udoc: TodayUserDoc | null,
  ): { metaText: string; statusText: string } {
    // Meta line: "Saturday, Jan 10 • Los Angeles, CA • Scheduled 7:00 AM PDT"
    // Built from the user's own prefs/delivery + timezone.
    const dateStr = gist?.date
      ? // gist.date is YYYY-MM-DD; parse into a Date in local env then format nicely
        this.prettyDateFromDateKey(gist.date)
      : '';

    const city = udoc?.prefs?.city?.trim() || gist?.newspaper?.location || '';
    const schedule = this.scheduleLabel(udoc, gist);
    const metaText =
      [dateStr, city, schedule].filter((p) => p && p.length).join(' • ') || '—';

    // Status pill — all sourced from the gist doc's delivery field.
    const method = gist?.delivery?.method ?? '—';
    const pages = gist?.delivery?.pages ?? null;

    const deliveredAt = gist?.delivery?.deliveredAt?.toDate?.() ?? null;

    const timeLabel = deliveredAt
      ? (this.datePipe.transform(deliveredAt, 'h:mm a') ?? '')
      : '';

    const baseStatus = (gist?.delivery?.status ?? '—').toString();
    const methodLower = (method ?? '').toLowerCase();
    const methodLabel =
      methodLower === 'email'
        ? 'Email'
        : methodLower === 'web'
          ? 'Web'
          : `${method}`.toUpperCase();

    const pagesLabel = pages ? `${pages} page${pages === 1 ? '' : 's'}` : '—';

    const statusText =
      timeLabel && baseStatus.toLowerCase() === 'delivered'
        ? `Delivered at ${timeLabel} • ${methodLabel} • ${pagesLabel}`
        : `${this.capitalize(baseStatus)} • ${methodLabel} • ${pagesLabel}`;

    return { metaText, statusText };
  }

  /**
   * "Scheduled 7:00 AM PDT" from the user's delivery schedule + timezone.
   * Computed client-side (proper Intl tz abbreviation); falls back to the
   * server-rendered deliveryTime only when no schedule pref is available.
   */
  private scheduleLabel(
    udoc: TodayUserDoc | null,
    gist: MorningGist | null,
  ): string {
    const sched = udoc?.delivery?.schedule;
    if (sched?.hour != null) {
      const hour24 = sched.hour;
      const minute = sched.minute ?? 0;
      const ampm = hour24 >= 12 ? 'PM' : 'AM';
      const displayHour = hour24 % 12 === 0 ? 12 : hour24 % 12;
      const abbr = tzAbbr(safeTimezone(udoc?.prefs?.timezone));
      const time = `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
      return `Scheduled ${time}${abbr ? ` ${abbr}` : ''}`;
    }

    const fromGist = gist?.newspaper?.deliveryTime?.trim();
    return fromGist ? `Scheduled ${fromGist}` : '';
  }

  prettyDateFromDateKey(dateKey: string): string {
    // dateKey: "YYYY-MM-DD"
    const [y, m, d] = dateKey.split('-').map(Number);

    // Create a local date (no UTC conversion)
    const date = new Date(y, m - 1, d);

    // Example output: "Monday, Jan 12"
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }

  private capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
