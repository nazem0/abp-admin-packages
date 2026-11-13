import { EnvironmentService, PermissionService } from '@abp/ng.core';
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
  imports: [ApplicationFormComponent, PermissionsEditorComponent],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>Applications</h1>
          <p class="muted">OpenIddict clients allowed to request tokens: SPAs, mobile apps, backends and tools.</p>
        </div>
        @if (can('AbpAdmin.Applications.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> New application
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="Search client ID or name…" aria-label="Search applications"
                   (change)="filter.set($any($event.target).value.trim())" (search)="filter.set($any($event.target).value.trim())" />
          </label>
        </div>

        @if (list.error()) {
          <div class="state err">Couldn't load applications. <button class="btn" (click)="list.reload()">Retry</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 9h16" /></svg>
            <b>No applications</b><span class="muted">{{ filter() ? 'Nothing matches “' + filter() + '”.' : 'Register the first client.' }}</span>
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
                    <span [class]="'pill tone-' + (a.clientType === 'confidential' ? 'accent' : 'info')">{{ a.clientType === 'confidential' ? 'Confidential' : 'Public' }}</span>
                    @if (a.clientId === ownClient) { <span class="pill tone-warn" title="This admin UI signs in with this client">This app</span> }
                  </span>
                  <span class="mono muted">{{ a.clientId }}</span>
                  <span class="grants">
                    @for (g of a.grantTypes; track g) { <span class="tag">{{ grantLabel(g) }}</span> }
                    @if (a.requirePkce) { <span class="tag ok">PKCE</span> }
                    <span class="muted small">{{ a.scopes?.length }} scope{{ a.scopes?.length === 1 ? '' : 's' }} · {{ a.redirectUris?.length }} redirect{{ a.redirectUris?.length === 1 ? '' : 's' }} · created {{ relative(a.creationTime) }}</span>
                  </span>
                </span>
                <span class="actions">
                  @if (confirming() === a.id) {
                    <span class="confirm">Delete {{ a.clientId }}? Its tokens stop working.
                      <button class="btn sm danger" (click)="remove(a)">Delete</button>
                      <button class="btn sm" (click)="confirming.set(null)">Cancel</button></span>
                  } @else {
                    @if (can('AbpAdmin.Applications.Update')) {
                      <button class="icon-btn" title="Edit" [attr.aria-label]="'Edit ' + a.clientId" (click)="editing.set(a)">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                    }
                    @if (can('AbpAdmin.Applications.ManagePermissions')) {
                      <button class="icon-btn" title="Client permissions" [attr.aria-label]="'Permissions of ' + a.clientId"
                              (click)="perms.set({ providerName: 'C', providerKey: a.clientId!, title: (a.displayName || a.clientId) + ' (client)' })">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg></button>
                    }
                    @if (can('AbpAdmin.Applications.Delete') && a.clientId !== ownClient) {
                      <button class="icon-btn" title="Delete" [attr.aria-label]="'Delete ' + a.clientId" (click)="confirming.set(a.id!)">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                    }
                  }
                </span>
              </li>
            }
          </ul>
          <footer class="pager"><span class="muted">{{ total() }} application{{ total() === 1 ? '' : 's' }}</span></footer>
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
    return GRANTS.find(x => x.value === g)?.label ?? g;
  }

  protected remove(a: ApplicationDto) {
    this.service.delete(a.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(`Deleted ${a.clientId}.`); this.list.reload(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
