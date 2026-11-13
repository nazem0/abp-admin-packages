import { AuthService, ConfigStateService, PermissionService } from '@abp/ng.core';
import { Component, ViewEncapsulation, computed, effect, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { displayZone } from '../audit-logs/format';
import { CommandPaletteComponent } from '../shared/command-palette.component';
import { NAV, NavItem } from '../shared/nav';
import { ThemeService } from '../shared/theme';
import { ToastsComponent } from '../shared/toast';

/** Loads the admin stylesheet once: unencapsulated, but every rule is scoped under `.abp-admin`. */
@Component({
  selector: 'abp-admin-styles',
  template: '',
  styleUrl: '../../styles/abp-admin.scss',
  encapsulation: ViewEncapsulation.None,
})
export class AbpAdminStylesComponent {}

/** The admin shell (sidebar, command palette, toasts) around the routed admin pages. */
@Component({
  selector: 'abp-admin-layout',
  host: { class: 'abp-admin' },
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommandPaletteComponent, ToastsComponent, AbpAdminStylesComponent],
  template: `
    <div class="shell">
      <aside class="rail">
        <a class="brand" routerLink="." aria-label="ABP Admin home">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 3 27 7.5v8c0 6.6-4.6 11.4-11 13.5C9.6 26.9 5 22.1 5 15.5v-8Z" />
            <path d="m11 16 3.5 3.5L21.5 12" />
          </svg>
          <span>ABP<b>Admin</b></span>
        </a>

        @if (user()?.isAuthenticated) {
          <button class="find" (click)="palette().show()" aria-label="Search pages and commands (Ctrl+K)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <span>Search…</span><kbd>Ctrl K</kbd>
          </button>
        }

        <nav aria-label="Main">
          @for (g of sections(); track g.name) {
            @if (g.name) { <span class="section">{{ g.name }}</span> }
            @for (n of g.items; track n.path) {
              <a [routerLink]="n.path" routerLinkActive="active" [title]="n.label">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="n.icon" /></svg>
                <span>{{ n.label }}</span>
              </a>
            }
          }
        </nav>

        <div class="me">
          <button class="icon-btn" (click)="theme.cycle()" [title]="'Theme: ' + theme.mode()" [attr.aria-label]="'Theme: ' + theme.mode() + '. Switch theme'">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              @switch (theme.mode()) {
                @case ('light') { <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /> }
                @case ('dark') { <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /> }
                @default { <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /> }
              }
            </svg>
          </button>
          @if (user()?.isAuthenticated) {
            <span class="avatar" aria-hidden="true">{{ initial() }}</span>
            <span class="who"><b>{{ user()?.userName }}</b><small>{{ user()?.email }}</small></span>
            <button class="icon-btn" (click)="auth.logout().subscribe()" title="Sign out" aria-label="Sign out">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
            </button>
          } @else {
            <button class="btn primary" (click)="auth.navigateToLogin()">Sign in</button>
          }
        </div>
      </aside>
      <main><router-outlet /></main>
    </div>
    <abp-admin-styles />
    <abp-command-palette />
    <abp-toasts />
  `,
  styles: `
    .shell { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: 100dvh; }
    .rail { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; gap: 16px;
      padding: 20px 14px 14px; border-inline-end: 1px solid var(--border); background: var(--surface); overflow-y: auto; }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; padding: 0 8px; font-size: 17px; }
    .brand b { color: var(--accent); font-weight: 700; margin-inline-start: 2px; }
    .brand svg { width: 30px; height: 30px; fill: none; stroke: var(--accent); stroke-width: 2.2; stroke-linecap: round; }
    .find { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px 0 10px; border: 1px solid var(--border); border-radius: 9px;
      background: var(--surface-2); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
    .find:hover { color: var(--text); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
    .find span { flex: 1; text-align: start; }
    .find svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    kbd { padding: 1px 5px; border: 1px solid var(--border); border-radius: 5px; font: 10.5px var(--mono); background: var(--surface); }
    nav { display: grid; gap: 1px; }
    .section { padding: 12px 10px 4px; font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); }
    nav a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 9px; color: var(--muted); text-decoration: none; font-weight: 500; }
    nav a:hover { background: var(--surface-2); color: var(--text); }
    nav a.active { background: var(--accent-soft); color: var(--accent); }
    nav svg, .icon-btn svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .me { margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 12px 4px 0; border-top: 1px solid var(--border); }
    .who { display: grid; min-width: 0; flex: 1; }
    .who b, .who small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who small { color: var(--muted); font-size: 12px; }
    @media (max-width: 860px) {
      .shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
      .rail { position: sticky; z-index: 5; height: auto; flex-direction: row; align-items: center; padding: 10px 12px; gap: 8px;
        border-inline-end: 0; border-bottom: 1px solid var(--border); overflow: visible; }
      .brand span, nav span, .who, .find span, .find kbd { display: none; }
      .find { width: 34px; padding: 0; justify-content: center; flex: none; }
      nav { display: flex; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
      nav a { flex: none; }
      .brand { flex: none; padding: 0; }
      .me { margin: 0; border: 0; padding: 0; flex: none; }
      .me .avatar { display: none; }
    }
  `,
})
export class AbpAdminLayoutComponent {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly palette = viewChild.required(CommandPaletteComponent);
  private readonly permissions = inject(PermissionService);
  private readonly state = toSignal(inject(ConfigStateService).getAll$());
  protected readonly user = computed(() => this.state()?.currentUser);
  protected readonly initial = computed(() => (this.user()?.userName ?? '?')[0].toUpperCase());

  /** Nav grouped by section, filtered by the granted policies (recomputed when app state refreshes). */
  protected readonly sections = computed(() => {
    this.state();
    if (!this.user()?.isAuthenticated) return [];
    const groups: { name: string; items: NavItem[] }[] = [];
    for (const n of NAV.filter(n => !n.policy || this.permissions.getGrantedPolicy(n.policy))) {
      if (groups.at(-1)?.name !== n.section) groups.push({ name: n.section, items: [] });
      groups.at(-1)!.items.push(n);
    }
    return groups;
  });

  constructor() {
    // Times display in Abp.Timing.TimeZone when the server clock is UTC; otherwise in the browser's zone.
    effect(() => {
      const s = this.state();
      const zone = s?.setting?.values?.['Abp.Timing.TimeZone'];
      displayZone.set(s?.clock?.kind === 'Utc' && zone && zone !== 'Unspecified' ? zone : undefined);
    });
  }
}
