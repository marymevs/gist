import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './today.component.html',
  styleUrls: ['./today.component.scss'],
})
export class TodayComponent {
  // UI state
  statusText = 'Delivered at 7:32 AM • Fax • 2 pages';
  isSerif = true;

  // Example data (replace with Firestore later)
  metaText = 'Saturday, Jan 10 • New York, NY • Scheduled 7:30 AM ET';
  deliveryLog = [
    { when: 'Jan 10 • 7:32', status: 'Delivered', tone: 'ok' as const },
    { when: 'Jan 09 • 7:31', status: 'Delivered', tone: 'ok' as const },
    { when: 'Jan 08 • 7:33', status: 'Delivered', tone: 'ok' as const },
  ];

  constructor(private router: Router) {}

  onPrint(): void {
    window.print();
  }

  onResend(): void {
    // Demo behavior: queued -> delivered
    this.statusText = 'Queued… • Fax';
    window.setTimeout(() => {
      this.statusText = 'Delivered • Fax • 2 pages';
    }, 900);
  }

  onEditTomorrow(): void {
    alert("Demo: this would open 'tomorrow' preferences.");
  }

  toggleSerif(): void {
    this.isSerif = !this.isSerif;
  }

  goToDelivery(): void {
    // Use real router navigation, not location.hash
    this.router.navigate(['/delivery']);
  }
}
