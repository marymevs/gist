import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

type Plan = 'web' | 'paper' | 'loop';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
})
export class AccountComponent {
  // --- View model (stubbed for now; later comes from Firestore/Auth/Stripe) ---

  inputs = {
    calendarStatus: 'Not connected',
    weatherLocation: 'New York, NY',
    newsDomains: 'Tech, Business, Culture',
  };

  prefs = {
    lengthLabel: 'Standard (2 pages)',
    toneLabel: 'Calm, direct',
    quietDays: 'Sat, Sun',
  };

  billing = {
    plan: 'paper' as Plan,
    planLabel: 'Print',
    nextInvoiceLabel: 'Feb 10',
    includedSendsLabel: '30 / month',
  };

  security = {
    email: 'you@domain.com',
    twoFaStatus: 'Not enabled',
    dataStatus: 'Export available',
  };

  constructor(private router: Router) {}

  // --- Click handlers (wire these later) ---

  onManageConnections(): void {
    // Later: route to a Connections page or open a modal
    alert('Demo: Manage connections (Calendar / Weather / News sources).');
  }

  onEditPreferences(): void {
    // Later: route to Preferences page
    alert('Demo: Edit tone, length, quiet days.');
  }

  onChangePlan(): void {
    // Later: open Stripe Checkout or customer portal
    alert('Demo: Change plan (Stripe).');
  }

  onViewInvoices(): void {
    // Later: open Stripe customer portal invoices view
    alert('Demo: View invoices (Stripe).');
  }

  onManageSecurity(): void {
    // Later: route to security settings; 2FA depends on auth provider
    alert('Demo: Manage security (email / 2FA / export).');
  }

  // Optional: if you want to navigate instead of alerts, use these patterns:
  // this.router.navigate(['/delivery']);
  // this.router.navigate(['/account/preferences']);
}
