import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { Auth, authState } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
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

import { ToastService } from '../../shared/services/toast.service';

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
  private functions = inject(Functions);
  private router = inject(Router);
  private datePipe = inject(DatePipe);
  private toast = inject(ToastService);

  isResending = false;

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
      ? this.datePipe.transform(createdAtDate, 'MMM d, h:mm a') ?? '—'
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
      ['delivered', 'received', 'complete', 'completed', 'done', 'ok'].includes(s)
    ) {
      return 'ok';
    }
    if (['failed', 'error'].includes(s)) return 'bad';

    return 'warn';
  }

  /** Button handlers — call resendMorningGist Cloud Function */

  async resend(log: DeliveryLogRow): Promise<void> {
    if (this.isResending) return;
    this.isResending = true;

    try {
      const fn = httpsCallable(this.functions, 'resendMorningGist');
      await fn({});
      this.toast.show('Gist resend queued.', 'success');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to resend — try again later.';
      this.toast.show(message, 'error');
    } finally {
      this.isResending = false;
    }
  }

  async retry(log: DeliveryLogRow): Promise<void> {
    // Retry uses the same resend logic — regenerate and re-deliver
    await this.resend(log);
  }

  view(log: DeliveryLogRow) {
    this.router.navigate(['/archive']);
  }

  editSchedule() {
    this.router.navigate(['/account']);
  }

  updateFax() {
    this.router.navigate(['/account']);
  }
}
