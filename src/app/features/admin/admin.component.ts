import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Subscription } from 'rxjs';

/** Mirror of the AdminStats payload returned by the getAdminStats callable. */
type DeliveryBucket = { total: number; delivered: number; failed: number; queued: number };

interface AdminUserRow {
  uid: string;
  email: string | null;
  onboardingComplete: boolean;
  deliveryMethod: string | null;
  calendarConnected: boolean;
  gmailConnected: boolean;
  lastGeneratedDate: string | null;
  gistIssueCount: number;
  createdAt: number | null;
  daysSinceActive: number | null;
}

interface AdminGistRow {
  userId: string;
  email: string | null;
  date: string;
  method: string | null;
  status: string | null;
  createdAt: number | null;
  editorialVoice: number | null;
  crossReferenceDepth: number | null;
  personalizationDepth: number | null;
}

interface AdminStats {
  generatedAt: string;
  totals: {
    users: number;
    onboarded: number;
    active7d: number;
    active30d: number;
    gistsAllTime: number;
  };
  delivery: {
    windowSize: number;
    successRate: number | null;
    byMethod: Record<string, DeliveryBucket>;
    failed: number;
  };
  quality: {
    sampleCount: number;
    editorialVoice: number;
    crossReferenceDepth: number;
    personalizationDepth: number;
  };
  users: AdminUserRow[];
  recentGists: AdminGistRow[];
}

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit, OnDestroy {
  private auth = inject(Auth);
  private functions = inject(Functions);
  private router = inject(Router);

  loading = true;
  errorMessage: string | null = null;
  stats: AdminStats | null = null;

  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = user(this.auth).subscribe((u) => {
      if (!u) {
        this.router.navigate(['/login']);
        return;
      }
      this.loadStats();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async loadStats(): Promise<void> {
    this.loading = true;
    this.errorMessage = null;
    try {
      const fn = httpsCallable<unknown, AdminStats>(this.functions, 'getAdminStats');
      const result = await fn({});
      this.stats = result.data;
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code ?? '';
      // Server is the real gate — non-owners are bounced back to their brief.
      if (code.includes('permission-denied') || code.includes('unauthenticated')) {
        this.router.navigate(['/today']);
        return;
      }
      this.errorMessage =
        error instanceof Error ? error.message : 'Unable to load admin stats.';
    } finally {
      this.loading = false;
    }
  }

  /** Ordered delivery methods for the breakdown table. */
  deliveryKeys(): string[] {
    return this.stats ? Object.keys(this.stats.delivery.byMethod) : [];
  }

  onboardedPct(): number {
    const t = this.stats?.totals;
    if (!t || t.users === 0) return 0;
    return Math.round((t.onboarded / t.users) * 100);
  }
}
