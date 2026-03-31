import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { doc, docData } from '@angular/fire/firestore';

import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  orderBy,
  limit,
  collectionData,
  Timestamp,
} from '@angular/fire/firestore';

import { Observable, of, combineLatest, tap } from 'rxjs';
import { map, switchMap, startWith } from 'rxjs/operators';

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
  schedule?: Array<{ time?: string; emoji?: string; name?: string; note?: string }>;
  notifications?: Array<{ emoji?: string; source?: string; body?: string }>;
  goodNews?: Array<{ headline?: string; summary?: string }>;
  people?: Array<{ name?: string; nudge?: string }>;
  quote?: { text?: string; attribution?: string };
  bodyMind?: { sectionLabel?: string; title?: string; paragraphs?: string[]; coachingNote?: string };
  practiceArc?: { sectionLabel?: string; title?: string; items?: Array<{ label?: string; text?: string }>; closingNote?: string };
  moonHighlight?: { title?: string; paragraph?: string };
  closingThought?: string;
  faxBackQuestions?: Array<{ prompt?: string; options?: string[] }>;
  personalQuote?: { text?: string; attribution?: string };
};

type NewspaperMeta = {
  subscriberName?: string;
  location?: string;
  dateFormatted?: string;
  deliveryTime?: string;
  volumeIssue?: string;
  weather?: { tempNow?: string; conditions?: string; forecast?: Array<{ day?: string; high?: string; condition?: string }> };
  rhythms?: { moon?: string; season?: string; light?: string; countdown?: string };
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
  gistBullets: string[];
  oneThing: string;

  newspaper?: NewspaperData & NewspaperMeta;

  delivery?: {
    method: 'web' | 'email' | 'fax';
    pages: number;
    status: 'queued' | 'delivered' | 'failed' | string;
    deliveredAt?: Timestamp;
  };

  createdAt?: Timestamp;
};

type DeliveryLog = {
  id: string;
  type: string; // 'morning'|'evening'
  method: string; // 'fax'|'web'|'email'
  status: string; // queued|delivered|failed|received...
  pages?: number | null;
  createdAt?: Timestamp;
};

type DeliveryLogRow = DeliveryLog & {
  createdAtLabel: string;
  statusClass: 'ok' | 'warn' | 'bad';
};

function todayDateKeyNY(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

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

  // UI state
  hasGistToday = false;
  pdfLoading = false;

  // Toolbar / sidebar text — derived from gist$ + deliveryLogs$ in constructor
  metaText = '—';
  statusText = '—';

  // === Firestore-backed streams for template ===
  gist$: Observable<MorningGist | null> = authState(this.auth).pipe(
    tap((u) => console.log('authState emitted:', u?.uid ?? null)),
    switchMap((user) => {
      if (!user) return of(null);

      const dateKey = todayDateKeyNY(); // 'YYYY-MM-DD'
      const gistDocRef = doc(
        this.db,
        `users/${user.uid}/morningGists/${dateKey}`,
      );

      return docData(gistDocRef, { idField: 'id' }).pipe(
        map((data) => (data as MorningGist) ?? null),
      );
    }),
  );

  deliveryLogs$: Observable<DeliveryLogRow[]> = authState(this.auth).pipe(
    switchMap((user) => {
      if (!user) return of([] as DeliveryLogRow[]);

      const logsCol = collection(this.db, `users/${user.uid}/deliveryLogs`);
      const q = query(logsCol, orderBy('createdAt', 'desc'), limit(4));

      return collectionData(q, { idField: 'id' }).pipe(
        map((rows) => (rows as DeliveryLog[]).map((r) => this.toLogRow(r))),
      );
    }),
  );

  constructor() {
    // Keep your existing template bindings (metaText/statusText as strings)
    // by deriving them from gist$ + deliveryLogs$.
    combineLatest([
      this.gist$.pipe(startWith(null)),
      this.deliveryLogs$.pipe(startWith([] as DeliveryLogRow[])),
    ])
      .pipe(map(([gist, logs]) => this.computeHeaderText(gist, logs)))
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
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        alert('PDF couldn\'t be generated.');
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
      alert('PDF couldn\'t be generated.');
    } finally {
      this.pdfLoading = false;
    }
  }

  onResend(): void {
    // For now keep demo behavior. Later we’ll call a Cloud Function.
    this.statusText = 'Queued…';
    window.setTimeout(() => {
      this.statusText = 'Delivered';
    }, 900);
  }

  onEditTomorrow(): void {
    this.router.navigate(['/account'], { queryParams: { section: 'preferences' } });
  }

  goToDelivery(): void {
    this.router.navigate(['/delivery']);
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
        faxBackQuestions: n.faxBackQuestions || [],
        personalQuote: n.personalQuote,
        moonFooter: n.moonFooter || '',
        seasonFooter: n.seasonFooter || '',
        intentionPrompt: n.intentionPrompt || 'What would make today feel complete — not just productive, but good?',
        hasPage2: !!(n.bodyMind || n.practiceArc || n.faxBackQuestions?.length),
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
        forecast: [] as Array<{ day?: string; high?: string; condition?: string }>,
      },
      rhythms: { moon: gist.moonPhase || '', season: '', light: '' } as { moon: string; season: string; light: string; countdown?: string },
      lede: {
        kicker: 'Good Morning',
        headline: gist.oneThing || 'Your Daily Briefing',
        paragraph: gist.gistBullets?.join(' ') || '',
      },
      schedule: (gist.dayItems || []).map(d => ({
        time: d.time || '',
        emoji: '',
        name: d.title,
        note: d.note || '',
      })),
      goodNews: (gist.worldItems || []).map(w => ({
        headline: w.headline,
        summary: w.implication,
      })),
      notifications: (gist.emailCards || []).map(e => ({
        emoji: e.category === 'Action' ? '📧' : e.category === 'WaitingOn' ? '⏳' : '📋',
        source: e.fromName || e.fromEmail || e.subject,
        body: e.snippet + (e.suggestedNextStep ? ` → ${e.suggestedNextStep}` : ''),
      })),
      people: [] as Array<{ name: string; nudge: string }>,
      quote: null as { text: string; attribution: string } | null,
      bodyMind: null as { sectionLabel: string; title: string; paragraphs: string[]; coachingNote?: string } | null,
      practiceArc: null as { sectionLabel: string; title: string; items: Array<{ label: string; text: string }>; closingNote?: string } | null,
      moonHighlight: null as { title: string; paragraph: string } | null,
      closingThought: '',
      faxBackQuestions: [] as Array<{ prompt: string; options: string[] }>,
      personalQuote: null as { text: string; attribution: string } | null,
      moonFooter: gist.moonPhase || '',
      seasonFooter: '',
      intentionPrompt: 'What would make today feel complete — not just productive, but good?',
      hasPage2: false,
    };
  }

  // === Helpers ===
  private toLogRow(log: DeliveryLog): DeliveryLogRow {
    const createdAtDate = log.createdAt?.toDate?.() ?? null;

    const createdAtLabel = createdAtDate
      ? // ex: "Jan 12 • 7:32 AM"
        (this.datePipe.transform(createdAtDate, 'MMM d • h:mm a') ?? '—')
      : '—';

    const statusClass = this.statusToClass(log.status);

    return {
      ...log,
      createdAtLabel,
      statusClass,
    };
  }

  private statusToClass(status?: string): 'ok' | 'warn' | 'bad' {
    const s = (status ?? '').toLowerCase();
    if (['delivered', 'received', 'complete', 'completed', 'done'].includes(s))
      return 'ok';
    if (['failed', 'error'].includes(s)) return 'bad';
    return 'warn';
  }

  private computeHeaderText(
    gist: MorningGist | null,
    logs: DeliveryLogRow[],
  ): { metaText: string; statusText: string } {
    // Meta line: "Saturday, Jan 10 • New York, NY • Scheduled 7:30 AM ET"
    // MVP: use gist.date, gist.timezone, and a default schedule string.
    const dateStr = gist?.date
      ? // gist.date is YYYY-MM-DD; parse into a Date in local env then format nicely
        this.prettyDateFromDateKey(gist.date)
      : '—';

    // Later we’ll pull city + schedule from user prefs/delivery. For now:
    const city = 'New York, NY';
    const schedule = 'Scheduled 7:30 AM ET';
    const metaText = `${dateStr} • ${city} • ${schedule}`;

    // Status pill: prefer gist.delivery if present, otherwise latest delivery log
    const method = gist?.delivery?.method ?? logs[0]?.method ?? '—';
    const pages = gist?.delivery?.pages ?? logs[0]?.pages ?? null;

    // If you store deliveredAt, show it; else show most recent log time.
    const deliveredAt =
      gist?.delivery?.deliveredAt?.toDate?.() ??
      logs[0]?.createdAt?.toDate?.() ??
      null;

    const timeLabel = deliveredAt
      ? (this.datePipe.transform(deliveredAt, 'h:mm a') ?? '')
      : '';

    const baseStatus = (
      gist?.delivery?.status ??
      logs[0]?.status ??
      '—'
    ).toString();
    const methodLower = (method ?? '').toLowerCase();
    const methodLabel =
      methodLower === 'fax' ? 'Fax' :
      methodLower === 'email' ? 'Email' :
      methodLower === 'web' ? 'Web' :
      `${method}`.toUpperCase();

    const pagesLabel = pages ? `${pages} page${pages === 1 ? '' : 's'}` : '—';

    const statusText =
      timeLabel && baseStatus.toLowerCase() === 'delivered'
        ? `Delivered at ${timeLabel} • ${methodLabel} • ${pagesLabel}`
        : `${this.capitalize(baseStatus)} • ${methodLabel} • ${pagesLabel}`;

    return { metaText, statusText };
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
