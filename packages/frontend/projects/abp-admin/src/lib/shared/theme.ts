import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'abp-admin.theme';

/** Light (default) / dark / follow-the-OS, remembered per browser. Drives `data-abp-admin-theme` on <html> (its own attribute, so the host app's theme is untouched). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(read());

  constructor() {
    effect(() => {
      const mode = this.mode();
      if (mode === 'system') document.documentElement.removeAttribute('data-abp-admin-theme');
      else document.documentElement.setAttribute('data-abp-admin-theme', mode);
      try { localStorage.setItem(KEY, mode); } catch { /* storage blocked: still works for this tab */ }
    });
  }

  cycle() {
    this.mode.update(m => (m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light'));
  }
}

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'system' || v === 'dark' ? v : 'light'; // light unless the user picked another
  } catch {
    return 'light';
  }
}
