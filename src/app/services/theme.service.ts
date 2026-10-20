import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { readStorage, writeStorage } from '../lib/storage';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Light / Dark / System theme (THEME-02). Toggles `.dark` on <html>. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly preference = signal<ThemePreference>(readStorage<ThemePreference>('theme', 'system'));
  private readonly systemDark = signal(false);
  readonly resolved = computed<'light' | 'dark'>(() => {
    const pref = this.preference();
    return pref === 'system' ? (this.systemDark() ? 'dark' : 'light') : pref;
  });

  constructor() {
    const media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (media) {
      this.systemDark.set(media.matches);
      media.addEventListener('change', (e) => this.systemDark.set(e.matches));
    }
    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.resolved() === 'dark');
      this.document.documentElement.style.colorScheme = this.resolved();
    });
    effect(() => writeStorage('theme', this.preference()));
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
  }
}
