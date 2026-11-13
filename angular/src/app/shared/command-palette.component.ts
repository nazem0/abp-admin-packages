import { PermissionService } from '@abp/ng.core';
import { Component, ElementRef, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NAV } from './nav';
import { ThemeService } from './theme';

interface Command { id: string; label: string; hint: string; icon: string; keywords: string; run: () => void }

const PLUS = 'M12 5v14M5 12h14';
const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z';

/** Ctrl/⌘+K: jump to any page or run a quick action. Only shows what the user is allowed to do. */
@Component({
  selector: 'app-command-palette',
  host: { '(document:keydown)': 'onGlobalKey($event)' },
  template: `
    <dialog #dialog class="palette" (close)="open.set(false)" (click)="$event.target === dialog && dialog.close()" aria-label="Command palette">
      <div class="box">
          <label class="q">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input #input type="text" autofocus placeholder="Go to page or run a command…" aria-label="Search commands" autocomplete="off"
                   role="combobox" aria-controls="cp-list" [attr.aria-activedescendant]="'cp-' + active()"
                   [value]="q()" (input)="q.set($any($event.target).value)" (keydown)="onKey($event)" />
            <kbd>Esc</kbd>
          </label>
          <ul id="cp-list" role="listbox">
            @for (c of results(); track c.id; let i = $index) {
              <li role="option" [id]="'cp-' + i" [attr.aria-selected]="i === active()" (mousemove)="active.set(i)" (click)="run(c)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="c.icon" /></svg>
                <span>{{ c.label }}</span>
                <small>{{ c.hint }}</small>
              </li>
            } @empty {
              <li class="none">No command matches “{{ q() }}”.</li>
            }
          </ul>
          <footer><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span></footer>
      </div>
    </dialog>
  `,
  styles: `
    .palette { margin: 12vh auto auto; padding: 0; width: min(600px, calc(100vw - 24px)); max-height: 70vh; border: 1px solid var(--border);
      border-radius: 16px; background: var(--surface); color: var(--text); box-shadow: 0 30px 80px -20px rgb(0 0 0 / 0.5); overflow: hidden; }
    .palette[open] { animation: pop 0.14s ease-out; }
    .palette::backdrop { background: rgb(10 14 22 / 0.42); backdrop-filter: blur(2px); }
    @keyframes pop { from { transform: scale(0.98); opacity: 0; } }
    .box { display: flex; flex-direction: column; max-height: 70vh; }
    .q { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .q svg { width: 18px; height: 18px; flex: none; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
    .q input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--text); font: inherit; font-size: 15px; }
    ul { list-style: none; margin: 0; padding: 6px; overflow: auto; }
    li { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 9px; cursor: pointer; }
    li[aria-selected='true'] { background: var(--accent-soft); color: var(--accent); }
    li svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: 0.85; }
    li span { flex: 1; font-weight: 500; }
    li small { color: var(--muted); font-size: 12px; }
    .none { cursor: default; color: var(--muted); justify-content: center; padding: 24px; }
    footer { display: flex; gap: 16px; padding: 8px 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; }
    kbd { display: inline-block; min-width: 20px; margin-inline-end: 3px; padding: 1px 5px; border: 1px solid var(--border); border-bottom-width: 2px;
      border-radius: 5px; font: 11px var(--mono); text-align: center; color: var(--muted); background: var(--surface-2); }
  `,
})
export class CommandPaletteComponent {
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);
  private readonly theme = inject(ThemeService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly open = signal(false);
  protected readonly q = signal('');
  protected readonly active = linkedSignal({ source: this.q, computation: () => 0 });

  private readonly commands = computed<Command[]>(() => {
    this.open(); // re-evaluate grants each time it opens
    const can = (p: string) => !p || this.permissions.getGrantedPolicy(p);
    const go = (path: string, query?: Record<string, string>) => () => this.router.navigate([path], { queryParams: query });
    const pages = NAV.filter(n => can(n.policy)).map(n => ({
      id: n.path, label: n.label, hint: n.section || 'Page', icon: n.icon, keywords: n.keywords ?? '', run: go(n.path),
    }));
    const actions: (Command & { policy: string })[] = [
      { id: 'new-user', label: 'New user', hint: 'Action', icon: PLUS, keywords: 'create add account', policy: 'AbpIdentity.Users.Create', run: go('/users', { new: '1' }) },
      { id: 'new-role', label: 'New role', hint: 'Action', icon: PLUS, keywords: 'create add', policy: 'AbpIdentity.Roles.Create', run: go('/roles', { new: '1' }) },
      { id: 'new-app', label: 'New application', hint: 'Action', icon: PLUS, keywords: 'create client oauth', policy: 'AbpAdmin.Applications.Create', run: go('/applications', { new: '1' }) },
      { id: 'new-scope', label: 'New scope', hint: 'Action', icon: PLUS, keywords: 'create api', policy: 'AbpAdmin.Scopes.Create', run: go('/scopes', { new: '1' }) },
      { id: 'failed', label: 'Failed sign-ins', hint: 'Security logs', icon: NAV.find(n => n.path === '/security-logs')!.icon, keywords: 'login invalid password', policy: 'AbpAdmin.SecurityLogs', run: go('/security-logs', { failed: '1' }) },
      { id: 'theme', label: 'Switch theme', hint: 'Appearance', icon: MOON, keywords: 'dark light mode', policy: '', run: () => this.theme.cycle() },
    ];
    return [...pages, ...actions.filter(a => can(a.policy))];
  });

  protected readonly results = computed(() => {
    const words = this.q().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.commands().filter(c => words.every(w => `${c.label} ${c.hint} ${c.keywords}`.toLowerCase().includes(w)));
  });

  show() {
    this.q.set('');
    this.open.set(true);
    this.dialog().nativeElement.showModal();
    this.input()?.nativeElement.focus(); // autofocus covers most browsers; this covers the rest
  }

  protected onGlobalKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (this.open()) this.dialog().nativeElement.close(); else this.show();
    }
  }

  protected onKey(e: KeyboardEvent) {
    const n = this.results().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.active.set((this.active() + 1) % Math.max(n, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.active.set((this.active() - 1 + n) % Math.max(n, 1)); }
    else if (e.key === 'Enter') { const c = this.results()[this.active()]; if (c) this.run(c); }
  }

  protected run(c: Command) {
    this.dialog().nativeElement.close();
    c.run();
  }
}
