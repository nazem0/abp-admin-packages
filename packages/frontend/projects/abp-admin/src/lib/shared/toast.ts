import { Component, Injectable, inject, signal } from '@angular/core';

export interface Toast { id: number; text: string; tone: 'ok' | 'err' | 'info' }

/** App-wide toasts: `inject(Toaster).ok('Saved')`. */
@Injectable({ providedIn: 'root' })
export class Toaster {
  readonly toasts = signal<Toast[]>([]);
  private next = 0;

  ok(text: string) { this.show(text, 'ok'); }
  error(text: string) { this.show(text, 'err'); }
  info(text: string) { this.show(text, 'info'); }

  dismiss(id: number) {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  private show(text: string, tone: Toast['tone']) {
    const id = ++this.next;
    this.toasts.update(list => [...list.slice(-3), { id, text, tone }]);
    setTimeout(() => this.dismiss(id), tone === 'err' ? 7000 : 3500);
  }
}

@Component({
  selector: 'abp-toasts',
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toaster.toasts(); track t.id) {
        <div [class]="'toast tone-' + t.tone">
          <span class="dot" aria-hidden="true"></span>
          <span class="txt">{{ t.text }}</span>
          <button class="icon-btn" (click)="toaster.dismiss(t.id)" aria-label="Dismiss">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; inset: auto 16px 16px auto; z-index: 1000; display: grid; gap: 8px; width: min(380px, calc(100vw - 32px)); }
    .toast { display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 14px; border-radius: 12px;
      background: var(--text); color: var(--bg); box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.45);
      animation: rise 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tone); flex: none; }
    .txt { flex: 1; font-size: 13.5px; }
    .icon-btn { width: 26px; height: 26px; color: inherit; opacity: 0.7; }
    .icon-btn:hover { background: transparent; color: inherit; opacity: 1; }
    @keyframes rise { from { transform: translateY(8px); opacity: 0; } }
  `,
})
export class ToastsComponent {
  protected readonly toaster = inject(Toaster);
}
