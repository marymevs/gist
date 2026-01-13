import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { doc, docData } from '@angular/fire/firestore';

import { Auth, authState } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  collectionData,
  Timestamp,
} from '@angular/fire/firestore';

import { Observable, of, combineLatest } from 'rxjs';
import { map, switchMap, startWith } from 'rxjs/operators';

type DayItem = { time?: string; title: string; note?: string };
type WorldItem = { headline: string; implication: string };

type MorningGist = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  timezone: string;

  weatherSummary: string;
  firstEvent?: string;

  dayItems: DayItem[];
  worldItems: WorldItem[];
  gistBullets: string[];
  oneThing: string;

  delivery?: {
    method: 'web' | 'fax';
    pages: number;
    status: 'queued' | 'delivered' | 'failed' | string;
    deliveredAt?: Timestamp;
  };

  createdAt?: Timestamp;
};

type DeliveryLog = {
  id: string;
  type: string; // 'morning'|'evening'
  method: string; // 'fax'|'web'
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
  isSerif = true;

  // If you want to keep these as strings (not Observables), we can set them imperatively.
  // Cleaner: expose metaText$ and statusText$ and use async in template.
  // But your HTML currently expects metaText/statusText strings — so we keep strings
  // and update them via subscriptions below.
  metaText = '—';
  statusText = '—';

  // === Firestore-backed streams for template ===
  gist$: Observable<MorningGist | null> = authState(this.auth).pipe(
    switchMap((user) => {
      if (!user) return of(null);

      const dateKey = todayDateKeyNY(); // 'YYYY-MM-DD'
      const gistDocRef = doc(
        this.db,
        `users/${user.uid}/morningGists/${dateKey}`
      );

      return docData(gistDocRef, { idField: 'id' }).pipe(
        map((data) => (data as MorningGist) ?? null)
      );
    })
  );

  deliveryLogs$: Observable<DeliveryLogRow[]> = authState(this.auth).pipe(
    switchMap((user) => {
      if (!user) return of([] as DeliveryLogRow[]);

      const logsCol = collection(this.db, `users/${user.uid}/deliveryLogs`);
      const q = query(logsCol, orderBy('createdAt', 'desc'), limit(4));

      return collectionData(q, { idField: 'id' }).pipe(
        map((rows) => (rows as DeliveryLog[]).map((r) => this.toLogRow(r)))
      );
    })
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
  }

  // === UI actions ===
  onPrint(): void {
    window.print();
  }

  onResend(): void {
    // For now keep demo behavior. Later we’ll call a Cloud Function.
    this.statusText = 'Queued…';
    window.setTimeout(() => {
      this.statusText = 'Delivered';
    }, 900);
  }

  onEditTomorrow(): void {
    alert("Demo: this would open 'tomorrow' preferences.");
  }

  toggleSerif(): void {
    this.isSerif = !this.isSerif;
  }

  goToDelivery(): void {
    this.router.navigate(['/delivery']);
  }

  // === Helpers ===
  private toLogRow(log: DeliveryLog): DeliveryLogRow {
    const createdAtDate = log.createdAt?.toDate?.() ?? null;

    const createdAtLabel = createdAtDate
      ? // ex: "Jan 12 • 7:32 AM"
        this.datePipe.transform(createdAtDate, 'MMM d • h:mm a') ?? '—'
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
    logs: DeliveryLogRow[]
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
      ? this.datePipe.transform(deliveredAt, 'h:mm a') ?? ''
      : '';

    const baseStatus = (
      gist?.delivery?.status ??
      logs[0]?.status ??
      '—'
    ).toString();
    const methodLabel =
      (method ?? '').toLowerCase() === 'fax'
        ? 'Fax'
        : (method ?? '').toLowerCase() === 'web'
        ? 'Web'
        : `${method}`.toUpperCase();

    const pagesLabel = pages ? `${pages} page${pages === 1 ? '' : 's'}` : '—';

    const statusText =
      timeLabel && baseStatus.toLowerCase() === 'delivered'
        ? `Delivered at ${timeLabel} • ${methodLabel} • ${pagesLabel}`
        : `${this.capitalize(baseStatus)} • ${methodLabel} • ${pagesLabel}`;

    return { metaText, statusText };
  }

  // private prettyDateFromDateKey(dateKey: string, timeZone: string): string {
  //   // dateKey: "YYYY-MM-DD"
  //   // Create a Date that represents that day, then format in the given TZ.
  //   const [y, m, d] = dateKey.split('-').map((x) => Number(x));
  //   const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));

  //   // Example output: "Saturday, Jan 10"
  //   const weekday = new Intl.DateTimeFormat('en-US', {
  //     timeZone,
  //     weekday: 'long',
  //   }).format(date);
  //   const monthDay = new Intl.DateTimeFormat('en-US', {
  //     timeZone,
  //     month: 'short',
  //     day: 'numeric',
  //   }).format(date);
  //   return `${weekday}, ${monthDay}`;
  // }

  private prettyDateFromDateKey(dateKey: string): string {
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
