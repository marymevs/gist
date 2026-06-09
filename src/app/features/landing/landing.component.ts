import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

/** A labelled feature in the annotated "anatomy of an edition" specimen. */
interface NpFeature {
  n: number;
  side: 'left' | 'right';
  /** Top offset (px) of the label block within the 1500×1210 stage. */
  top: number;
  /** Top offset (px) of the leader line — pinned to the section it points at. */
  leader: number;
  title: string;
  desc: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent {
  /** Native dimensions of the annotated stage (page + gutters + page-2 sliver). */
  private static readonly STAGE_W = 1500;
  private static readonly STAGE_H = 1210;
  /** Native dimensions of the front-page sheet on its own (for the mobile thumb). */
  private static readonly PAGE_W = 672;
  private static readonly PAGE_H = 980;
  /** Below this viewport width the leader lines get cramped → stacked layout. */
  private static readonly COMPACT_BELOW = 1200;

  /** Wide (annotated) mode: scale + reserved height for the breakout stage. */
  npScale = 1;
  npStageHeight = LandingComponent.STAGE_H;

  /** Compact (stacked) mode: a scaled thumbnail of the sheet above a feature list. */
  npCompact = false;
  npThumbScale = 1;
  npThumbWidth = LandingComponent.PAGE_W;
  npThumbHeight = LandingComponent.PAGE_H;

  /** Single source of truth for both the annotations (wide) and the list (compact). */
  readonly npFeatures: NpFeature[] = [
    {
      n: 1, side: 'left', top: 91, leader: 115,
      title: 'Your masthead',
      desc: 'Your name, your issue number, the date. Every edition is numbered — yours, no one else’s.',
    },
    {
      n: 2, side: 'right', top: 206, leader: 230,
      title: 'Weather & rhythms',
      desc: 'Today and the week ahead — plus moon, season, daylight, and any countdown you’re keeping.',
    },
    {
      n: 3, side: 'left', top: 290, leader: 314,
      title: 'The lede',
      desc: 'About a hundred warm words on the shape of your day, by an editor who knows your week.',
    },
    {
      n: 4, side: 'left', top: 436, leader: 460,
      title: 'Your calendar, set in type',
      desc: 'Today’s events, with a one-line coaching note where it matters. Nothing to swipe.',
    },
    {
      n: 5, side: 'right', top: 446, leader: 470,
      title: 'The six emails that need you',
      desc: 'Gist scores every Gmail thread on signal — replies waiting, people you flagged. The rest stays in the inbox.',
    },
    {
      n: 6, side: 'left', top: 616, leader: 640,
      title: 'Good news, world only',
      desc: 'Three stories filtered through who you are and what you’re working on. Then it stops.',
    },
    {
      n: 7, side: 'right', top: 640, leader: 664,
      title: 'The people you can’t lose track of',
      desc: 'Name who matters — your collaborator, your gallerist, your mom — and they thread through the morning.',
    },
    {
      n: 8, side: 'right', top: 1066, leader: 1090,
      title: 'And a second page',
      desc: 'A quiet spread that asks nothing of you — body & mind, a practice arc, and ruled lines for your morning intention.',
    },
  ];

  constructor(private router: Router) {
    // Compute synchronously before first render so the height binding is
    // correct on the first change-detection pass (avoids NG0100). This is a
    // client-only app, so `window` is always available here.
    this.recomputeLayout();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.recomputeLayout();
  }

  private recomputeLayout(): void {
    if (typeof window === 'undefined') return;
    const vw = document.documentElement.clientWidth || window.innerWidth;

    if (vw >= LandingComponent.COMPACT_BELOW) {
      this.npCompact = false;
      const avail = Math.min(vw - 40, LandingComponent.STAGE_W);
      this.npScale = Math.min(1, avail / LandingComponent.STAGE_W);
      this.npStageHeight = Math.ceil(LandingComponent.STAGE_H * this.npScale);
    } else {
      this.npCompact = true;
      const colInner = Math.min(vw - 32, 560);
      this.npThumbScale = Math.min(1, colInner / LandingComponent.PAGE_W);
      this.npThumbWidth = Math.ceil(LandingComponent.PAGE_W * this.npThumbScale);
      this.npThumbHeight = Math.ceil(LandingComponent.PAGE_H * this.npThumbScale);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  goToWaitlist(): void {
    this.router.navigate(['/waitlist']);
  }
}
