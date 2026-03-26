import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Toast, ToastService } from '../../services/toast.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
})
export class ToastComponent implements OnDestroy {
  toasts: Toast[] = [];
  private subs: Subscription[] = [];

  constructor(private toastService: ToastService) {
    this.subs.push(
      this.toastService.toast$.subscribe((toast) => {
        this.toasts.push(toast);
      }),
      this.toastService.dismiss$.subscribe((id) => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }),
    );
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }
}
