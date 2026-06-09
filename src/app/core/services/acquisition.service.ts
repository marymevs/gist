import { Injectable } from '@angular/core';

/**
 * First-touch acquisition data captured at app load and stamped onto the user
 * doc at signup. Lets us answer "where did this user come from?" — the gap that
 * issue #220 closes (our first external signup arrived with zero attribution).
 *
 * Stored values are the *first* ones seen this browser session (sessionStorage),
 * so later in-app navigation can't overwrite the original landing context before
 * the user finishes signing up.
 */
export interface Acquisition {
  /** External referring page (same-origin referrers are dropped → null). */
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  /** Google Ads click id, if the landing URL carried one. */
  gclid: string | null;
  /** First pathname the user landed on. */
  landingPath: string | null;
}

const STORAGE_KEY = 'gist_acquisition';

@Injectable({ providedIn: 'root' })
export class AcquisitionService {
  /**
   * Capture first-touch acquisition into sessionStorage if not already present.
   * Idempotent and safe to call before routing (run from an APP_INITIALIZER).
   */
  capture(): void {
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return; // first-touch wins
      const data = this.read();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // sessionStorage unavailable (private mode / blocked) — non-fatal.
    }
  }

  /**
   * The captured acquisition payload with all-null fields removed, or null when
   * nothing meaningful was captured. Shape is ready to merge into the user doc.
   */
  snapshot(): Partial<Acquisition> | null {
    let data: Acquisition | null = null;
    try {
      const raw =
        typeof window !== 'undefined'
          ? sessionStorage.getItem(STORAGE_KEY)
          : null;
      data = raw ? (JSON.parse(raw) as Acquisition) : this.read();
    } catch {
      data = this.read();
    }
    if (!data) return null;

    const pruned: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v) pruned[k] = v;
    }
    return Object.keys(pruned).length ? (pruned as Partial<Acquisition>) : null;
  }

  /** Read acquisition signals from the current document/URL. */
  private read(): Acquisition {
    let params: URLSearchParams;
    let referrer = '';
    let landingPath: string | null = null;
    try {
      params = new URLSearchParams(window.location.search);
      landingPath = window.location.pathname || null;
      referrer = document.referrer || '';
    } catch {
      params = new URLSearchParams();
    }

    // Drop same-origin referrers — internal SPA navigation isn't acquisition.
    let ref: string | null = referrer || null;
    try {
      if (ref && new URL(ref).host === window.location.host) ref = null;
    } catch {
      // Unparseable referrer — keep the raw string.
    }

    const get = (key: string): string | null => params.get(key) || null;

    return {
      referrer: ref,
      utmSource: get('utm_source'),
      utmMedium: get('utm_medium'),
      utmCampaign: get('utm_campaign'),
      utmTerm: get('utm_term'),
      utmContent: get('utm_content'),
      gclid: get('gclid'),
      landingPath,
    };
  }
}
