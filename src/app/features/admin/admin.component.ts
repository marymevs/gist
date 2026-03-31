import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  query,
  orderBy,
  limit,
  where,
} from '@angular/fire/firestore';
import { Observable, of, switchMap, map, Subscription } from 'rxjs';

/** Hardcoded founder UID — only this user can access /admin */
const ADMIN_UID = ''; // Set to your Firebase UID before deploying

type UserRow = {
  uid: string;
  email: string | null;
  plan: string;
  onboardingComplete?: boolean;
  stripeSubscriptionStatus?: string;
  lastGeneratedDate?: string;
  createdAt?: any;
};

type GistRow = {
  userId: string;
  date: string;
  qualityScore?: {
    editorialVoice: number;
    crossReferenceDepth: number;
    personalizationDepth: number;
  };
  delivery: {
    method: string;
    status: string;
  };
  createdAt?: any;
};

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit, OnDestroy {
  isAuthorized = false;
  loading = true;

  // Metrics
  totalUsers = 0;
  activeUsers = 0; // generated in last 7 days
  onboardedUsers = 0;
  planBreakdown: Record<string, number> = {};
  subscriptionBreakdown: Record<string, number> = {};

  // Quality
  avgEditorialVoice = 0;
  avgCrossRef = 0;
  avgPersonalization = 0;
  qualitySampleCount = 0;

  // Recent gists
  recentGists: GistRow[] = [];

  // Delivery stats
  deliveryStats: Record<string, { total: number; delivered: number; failed: number }> = {};

  private sub?: Subscription;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.sub = user(this.auth).subscribe((u) => {
      if (!u) {
        this.router.navigate(['/login']);
        return;
      }

      // Allow any authenticated user in demo mode (ADMIN_UID empty)
      // In production, set ADMIN_UID to restrict access
      if (ADMIN_UID && u.uid !== ADMIN_UID) {
        this.router.navigate(['/today']);
        return;
      }

      this.isAuthorized = true;
      this.loadMetrics();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async loadMetrics(): Promise<void> {
    try {
      await Promise.all([
        this.loadUserMetrics(),
        this.loadRecentGists(),
      ]);
    } finally {
      this.loading = false;
    }
  }

  private async loadUserMetrics(): Promise<void> {
    const usersCol = collection(this.firestore, 'users');
    const usersSnap = await collectionData(query(usersCol), { idField: 'uid' })
      .pipe(
        map((docs) => docs as UserRow[]),
      )
      .toPromise();

    if (!usersSnap) return;

    this.totalUsers = usersSnap.length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const plans: Record<string, number> = {};
    const subs: Record<string, number> = {};
    let onboarded = 0;
    let active = 0;

    for (const u of usersSnap) {
      // Plan breakdown
      const plan = u.plan || 'web';
      plans[plan] = (plans[plan] || 0) + 1;

      // Subscription breakdown
      const status = u.stripeSubscriptionStatus || 'demo';
      subs[status] = (subs[status] || 0) + 1;

      // Onboarding
      if (u.onboardingComplete) onboarded++;

      // Active (generated in last 7 days)
      if (u.lastGeneratedDate && u.lastGeneratedDate >= sevenDaysAgoStr) {
        active++;
      }
    }

    this.planBreakdown = plans;
    this.subscriptionBreakdown = subs;
    this.onboardedUsers = onboarded;
    this.activeUsers = active;
  }

  private async loadRecentGists(): Promise<void> {
    // Query recent gists across all users via collection group
    const gistsGroup = collectionGroup(this.firestore, 'morningGists');
    const recentQuery = query(gistsGroup, orderBy('createdAt', 'desc'), limit(20));

    const gists = await collectionData(recentQuery)
      .pipe(
        map((docs) => docs as GistRow[]),
      )
      .toPromise();

    if (!gists) return;

    this.recentGists = gists;

    // Compute quality averages
    let totalVoice = 0, totalCrossRef = 0, totalPersonal = 0, count = 0;
    const delivery: Record<string, { total: number; delivered: number; failed: number }> = {};

    for (const g of gists) {
      if (g.qualityScore) {
        totalVoice += g.qualityScore.editorialVoice;
        totalCrossRef += g.qualityScore.crossReferenceDepth;
        totalPersonal += g.qualityScore.personalizationDepth;
        count++;
      }

      // Delivery stats
      const method = g.delivery?.method || 'web';
      if (!delivery[method]) delivery[method] = { total: 0, delivered: 0, failed: 0 };
      delivery[method].total++;
      if (g.delivery?.status === 'delivered') delivery[method].delivered++;
      if (g.delivery?.status === 'failed') delivery[method].failed++;
    }

    if (count > 0) {
      this.avgEditorialVoice = Math.round((totalVoice / count) * 10) / 10;
      this.avgCrossRef = Math.round((totalCrossRef / count) * 10) / 10;
      this.avgPersonalization = Math.round((totalPersonal / count) * 10) / 10;
      this.qualitySampleCount = count;
    }

    this.deliveryStats = delivery;
  }

  planKeys(): string[] {
    return Object.keys(this.planBreakdown);
  }

  subKeys(): string[] {
    return Object.keys(this.subscriptionBreakdown);
  }

  deliveryKeys(): string[] {
    return Object.keys(this.deliveryStats);
  }
}
