import { EnvironmentService, LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ApplicationDto, ApplicationService } from '../proxy/services/open-iddict';
import { relative } from '../audit-logs/format';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';
import { ApplicationEdit, ApplicationFormComponent, GRANTS } from './application-form.component';
import { PermissionsEditorComponent, PermissionTarget } from '../permissions/permissions-editor.component';

/** OpenIddict client applications: who may ask this server for tokens, and how. */
@Component({
  selector: 'app-applications-page',
  imports: [ApplicationFormComponent, PermissionsEditorComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ '::Applications:Title' | abpLocalization }}</h1>
          <p class="muted">{{ '::Applications:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpAdmin.Applications.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ '::Applications:New' | abpLocalization }}
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="{{ '::Applications:SearchPlaceholder' | abpLocalization }}" [attr.aria-label]="'::Applications:Search' | abpLocalization"
                   (change)="filter.set($any($event.target).value.trim())" (search)="filter.set($any($event.target).value.trim())" />
          </label>
        </div>

        @if (list.error()) {
          <div class="state err">{{ '::Applications:LoadError' | abpLocalization }} <button class="btn" (click)="list.reload()">{{ '::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 9h16" /></svg>
            <b>{{ '::Applications:Empty' | abpLocalization }}</b><span class="muted">{{ filter() ? ('::Applications:NoMatch' | abpLocalization: filter()) : ('::Applications:RegisterFirst' | abpLocalization) }}</span>
          </div>
        } @else {
          <ul class="apps">
            @for (a of rows(); track a.id) {
              <li class="app">
                <span class="logo" aria-hidden="true">
                  @if (a.logoUri) { <img [src]="a.logoUri" alt="" /> } @else { {{ (a.displayName || a.clientId || '?')[0].toUpperCase() }} }
                </span>
                <span class="main">
                  <span class="name"><b>{{ a.displayName || a.clientId }}</b>
                    <span [class]="'pill tone-' + (a.clientType === 'confidential' ? 'accent' : 'info')">{{ (a.clientType === 'confidential' ? '::Applications:Confidential' : '::Applications:Public') | abpLocalization }}</span>
                    @if (a.clientId === ownClient) { <span class="pill tone-warn" [title]="'::Applications:ThisAppHint' | abpLocalization">{{ '::Applications:ThisApp' | abpLocalization }}</span> }
                  </span>
                  <span class="mono muted">{{ a.clientId }}</span>
                  <span class="grants">
                    @for (g of a.grantTypes; track g) { <span class="tag">{{ grantLabel(g) }}</span> }
                    @if (a.requirePkce) { <span class="tag ok">PKCE</span> }
                    <span class="muted small">{{ summary(a) }}</span>
                  </span>
                </span>
                <span class="actions">
                  @if (confirming() === a.id) {
                    <span class="confirm">{{ '::Applications:DeleteConfirm' | abpLocalization: a.clientId! }}
                      <button class="btn sm danger" (click)="remove(a)">{{ '::Common:Delete' | abpLocalization }}</button>
                      <button class="btn sm" (click)="confirming.set(null)">{{ '::Common:Cancel' | abpLocalization }}</button></span>
                  } @else {
                    @if (can('AbpAdmin.Applications.Update')) {
                      <button class="icon-btn" [title]="'::Common:Edit' | abpLocalization" [attr.aria-label]="'::Applications:EditAria' | abpLocalization: a.clientId!" (click)="editing.set(a)">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                    }
                    @if (can('AbpAdmin.Applications.ManagePermissions')) {
                      <button class="icon-btn" [title]="'::Applications:PermissionsTitle' | abpLocalization" [attr.aria-label]="'::Applications:PermissionsAria' | abpLocalization: a.clientId!"
                              (click)="perms.set({ providerName: 'C', providerKey: a.clientId!, title: clientTitle(a) })">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg></button>
                    }
                    @if (can('AbpAdmin.Applications.Delete') && a.clientId !== ownClient) {
                      <button class="icon-btn" [title]="'::Common:Delete' | abpLocalization" [attr.aria-label]="'::Applications:DeleteAria' | abpLocalization: a.clientId!" (click)="confirming.set(a.id!)">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                    }
                  }
                </span>
              </li>
            }
          </ul>
          <footer class="pager"><span class="muted">{{ (total() === 1 ? '::Applications:CountOne' : '::Applications:CountMany') | abpLocalization: total().toString() }}</span></footer>
        }
      </section>
    </div>

    <app-application-form [app]="editing()" (closed)="editing.set(null)" (saved)="editing.set(null); list.reload()" />
    <app-permissions-editor [target]="perms()" (closed)="perms.set(null)" />
  `,
  styles: `
    .apps { list-style: none; margin: 0; padding: 6px 8px; }
    .app { display: flex; align-items: flex-start; gap: 14px; padding: 14px 10px; border-radius: 12px; }
    .app + .app { border-top: 1px solid var(--border); }
    .app:hover { background: var(--surface-2); }
    .logo { display: grid; place-items: center; width: 42px; height: 42px; flex: none; border-radius: 11px; background: var(--accent-soft);
      color: var(--accent); font-weight: 700; overflow: hidden; }
    .logo img { width: 100%; height: 100%; object-fit: cover; }
    .main { flex: 1; display: grid; gap: 3px; min-width: 0; }
    .name { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .name b { font-weight: 650; }
    .main > .mono { font-size: 12px; overflow-wrap: anywhere; }
    .grants { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 4px; }
    .tag { padding: 1px 8px; border-radius: 6px; background: var(--surface-2); border: 1px solid var(--border); font-size: 11.5px; color: var(--muted); }
    .app:hover .tag { background: var(--surface); }
    .tag.ok { color: var(--ok); }
    .small { font-size: 12px; margin-inline-start: 4px; }
    .actions { display: flex; align-items: center; gap: 2px; flex: none; }
    @media (max-width: 640px) { .app { flex-wrap: wrap; } .actions { margin-inline-start: 56px; } }
  `,
})
export class ApplicationsPage {
  private readonly service = inject(ApplicationService);
  private readonly permissions = inject(PermissionService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);

  /** `?new=1` opens the create sheet (used by the command palette). */
  readonly new = input<string>();

  protected readonly relative = relative;
  protected readonly ownClient = inject(EnvironmentService).getEnvironment().oAuthConfig?.clientId;
  protected readonly filter = signal('');
  protected readonly editing = signal<ApplicationEdit | null>(null);
  protected readonly confirming = signal<string | null>(null);
  /** Client permissions apply to tokens the client gets for itself (client_credentials), not to signed-in users. */
  protected readonly perms = signal<PermissionTarget | null>(null);

  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, maxResultCount: 200 }),
    stream: ({ params }) => this.service.getList(params),
  });
  protected readonly rows = computed<ApplicationDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);

  constructor() {
    effect(() => { if (this.new() === '1' && this.can('AbpAdmin.Applications.Create')) this.editing.set('new'); });
  }

  protected can(policy: string) {
    return this.permissions.getGrantedPolicy(policy);
  }

  protected grantLabel(g: string) {
    const k = GRANTS.find(x => x.value === g);
    return k ? this.l.instant(k.labelKey) : g;
  }

  protected summary(a: ApplicationDto) {
    const n = a.scopes?.length ?? 0;
    const r = a.redirectUris?.length ?? 0;
    return [
      this.l.instant(n === 1 ? '::Applications:ScopeOne' : '::Applications:ScopeMany', String(n)),
      this.l.instant(r === 1 ? '::Applications:RedirectOne' : '::Applications:RedirectMany', String(r)),
      this.l.instant('::Applications:CreatedAgo', relative(a.creationTime)),
    ].join(' · ');
  }

  protected clientTitle(a: ApplicationDto) {
    return this.l.instant('::Applications:ClientTitle', (a.displayName || a.clientId)!);
  }

  protected remove(a: ApplicationDto) {
    this.service.delete(a.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('::Applications:Deleted', a.clientId!)); this.list.reload(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
