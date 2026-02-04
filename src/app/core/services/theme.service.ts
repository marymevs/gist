import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'gist-theme';
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  private readonly systemTheme = signal<Theme>(
    this.mediaQuery?.matches ? 'dark' : 'light'
  );
  private readonly storedTheme = signal<Theme | null>(this.readStoredTheme());

  readonly theme = computed<Theme>(
    () => this.storedTheme() ?? this.systemTheme()
  );

  constructor() {
    this.syncThemeAttribute();

    if (this.mediaQuery) {
      const handler = (event: MediaQueryListEvent) => {
        this.systemTheme.set(event.matches ? 'dark' : 'light');
        if (!this.storedTheme()) {
          this.syncThemeAttribute();
        }
      };

      this.mediaQuery.addEventListener('change', handler);
    }
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  setTheme(theme: Theme): void {
    this.storedTheme.set(theme);
    this.persistTheme(theme);
    this.applyThemeAttribute(theme);
  }

  clearTheme(): void {
    this.storedTheme.set(null);
    this.removePersistedTheme();
    this.removeThemeAttribute();
  }

  private readStoredTheme(): Theme | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(this.storageKey);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
      return null;
    }
  }

  private persistTheme(theme: Theme): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(this.storageKey, theme);
    } catch {
      // Ignore storage failures (e.g., private mode).
    }
  }

  private removePersistedTheme(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore storage failures.
    }
  }

  private syncThemeAttribute(): void {
    const stored = this.storedTheme();
    if (stored) {
      this.applyThemeAttribute(stored);
    } else {
      this.removeThemeAttribute();
    }
  }

  private applyThemeAttribute(theme: Theme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
  }

  private removeThemeAttribute(): void {
    this.document.documentElement.removeAttribute('data-theme');
  }
}
