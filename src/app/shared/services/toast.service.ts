import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  message: string;
  type: ToastType;
  id: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toast$ = new Subject<Toast>();
  readonly dismiss$ = new Subject<number>();

  show(message: string, type: ToastType = 'info'): void {
    const id = this.nextId++;
    this.toast$.next({ message, type, id });

    // Auto-dismiss after 3s
    setTimeout(() => this.dismiss$.next(id), 3000);
  }
}
