import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { signOut } from 'firebase/auth';
import { AccountDataService } from '../../core/services/account-data.service';
import { GistUser } from '../../core/models/user.model';
import { Observable } from 'rxjs';

type Plan = 'web' | 'paper' | 'loop';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
})
export class AccountComponent {
  userDoc$: Observable<GistUser | null> = this.accountData.currentUserDoc$();
  authUser$ = user(this.auth);

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

  constructor(private auth: Auth, private accountData: AccountDataService) {}

  // --- Click handlers (wire these later) ---

  onManageConnections(): void {
    // Later: route to a Connections page or open a modal
    alert('Demo: Manage connections (Calendar / Weather / News sources).');
  }

  planLabel(plan: GistUser['plan']): string {
    if (plan === 'web') return 'Web';
    if (plan === 'print') return 'Print';
    return 'Loop';
  }

  planPrice(plan: GistUser['plan']): string {
    if (plan === 'web') return '$12/mo';
    if (plan === 'print') return '$25/mo';
    return '$45/mo';
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

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  // Optional: call this from template if you detect missing doc
  async ensureDoc(uid: string, email: string | null): Promise<void> {
    await this.accountData.ensureUserDoc({ uid, email });
  }

  // Optional: if you want to navigate instead of alerts, use these patterns:
  // this.router.navigate(['/delivery']);
  // this.router.navigate(['/account/preferences']);
}
