import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';

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

import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

type DeliveryLog = {
  id: string;
  type: 'morning' | 'evening' | string;
  method: string;
  status: string;
  pages?: number | null;
  createdAt?: Timestamp; // Firestore Timestamp
};

type DeliveryLogRow = DeliveryLog & {
  createdAtLabel: string;
  statusClass: 'ok' | 'warn' | 'bad';
};

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery.component.html',
  styleUrls: ['./delivery.component.scss'],
  providers: [DatePipe],
})
export class DeliveryComponent {
  private auth = inject(Auth);
  private db = inject(Firestore);
  private router = inject(Router);
  private datePipe = inject(DatePipe);

  logs$: Observable<DeliveryLogRow[]> = authState(this.auth).pipe(
    switchMap((user) => {
      if (!user) return of([] as DeliveryLogRow[]);

      const logsCol = collection(this.db, `users/${user.uid}/deliveryLogs`);
      const q = query(logsCol, orderBy('createdAt', 'desc'), limit(50));

      return collectionData(q, { idField: 'id' }).pipe(
        map((rows) => (rows as DeliveryLog[]).map((r) => this.toRow(r)))
      );
    })
  );

  /** UI helpers */

  private toRow(log: DeliveryLog): DeliveryLogRow {
    const createdAt = log.createdAt;
    const createdAtDate = createdAt?.toDate ? createdAt.toDate() : undefined;

    const createdAtLabel = createdAtDate
      ? // Example: "Jan 12, 7:30 AM"
        this.datePipe.transform(createdAtDate, 'MMM d, h:mm a') ?? '—'
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

    if (
      ['delivered', 'received', 'complete', 'completed', 'done', 'ok'].includes(
        s
      )
    ) {
      return 'ok';
    }
    if (['failed', 'error'].includes(s)) return 'bad';

    // queued, pending, parsing, executing, etc.
    return 'warn';
  }

  /** Button handlers (MVP stubs; wire to callable functions later) */

  resend(log: DeliveryLogRow) {
    // Later: call a Cloud Function to re-send by referencing the gist/dateKey
    console.log('Resend requested', log);
    alert('Demo: resend will be wired to a Cloud Function next.');
  }

  retry(log: DeliveryLogRow) {
    console.log('Retry requested', log);
    alert('Demo: retry will be wired to a Cloud Function next.');
  }

  view(log: DeliveryLogRow) {
    console.log('View requested', log);

    // Example: send them to today or archive; adjust as you prefer.
    // If you store references like gistId/dateKey later, you can deep-link.
    this.router.navigate(['/archive']);
  }

  editSchedule() {
    // For now, route to Account or Delivery settings section later
    this.router.navigate(['/account']);
  }

  updateFax() {
    this.router.navigate(['/account']);
  }
}
