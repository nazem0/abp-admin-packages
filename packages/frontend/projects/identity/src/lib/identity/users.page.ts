import { ConfigStateService, LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { IdentityUserDto, IdentityUserService, IdentityClaimsService, UserImportResultDto, UserLockoutService, UserTransferService, TenantService, TenantUserService, PermissionsService, TenantScope, provideTenantScope, Toaster, relative, PermissionsEditorComponent, PermissionTarget, apiError, AbpAdminRegistry, PagerComponent, keepPageInRange, savedPageSize, download, ICONS, IconLegendComponent, LegendItem, CacheService } from '@nazem0/abp-admin-ng-core';
import { UserEdit, UserFormComponent } from './user-form.component';
import { ClaimsEditorComponent, ClaimsTarget } from './claims-editor.component';


@Component({
  selector: 'abp-users-page',
  imports: [IconLegendComponent, PagerComponent, UserFormComponent, PermissionsEditorComponent, ClaimsEditorComponent, RouterLink, LocalizationPipe],
  // Identity, lockout and permission calls made from this page (dialogs included) go to the row's tenant.
  providers: provideTenantScope(IdentityUserService, UserLockoutService, PermissionsService, IdentityClaimsService, UserTransferService),
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::Users:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::Users:Subtitle' | abpLocalization }}</p>
        </div>
        <span class="tools">
        <button class="btn" (click)="exportCsv()" [disabled]="transferring()" [title]="'AbpAdmin::Users:ExportHint' | abpLocalization">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg> {{ 'AbpAdmin::Users:Export' | abpLocalization }}</button>
        @if (can('AbpIdentity.Users.Create')) {
          <label class="btn" [class.disabled]="transferring()" [title]="'AbpAdmin::Users:ImportHint' | abpLocalization">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M5 20h14" /></svg> {{ 'AbpAdmin::Users:Import' | abpLocalization }}
            <input type="file" accept=".csv,text/csv" hidden [disabled]="transferring()" (change)="importCsv($any($event.target))" /></label>
        }
        @if (can('AbpIdentity.Users.Create')) {
          <button class="btn primary" (click)="act(createIn(), () => editing.set('new'))">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ 'AbpAdmin::Users:NewUser' | abpLocalization }}
          </button>
        }
        </span>
      </header>
      <app-icon-legend [items]="legend" />

      @if (imported(); as r) {
        <section class="card import" role="status">
          <b>{{ 'AbpAdmin::Users:ImportResult' | abpLocalization: (r.created ?? 0).toString() : (r.skipped?.length ?? 0).toString() : (r.errors?.length ?? 0).toString() }}</b>
          @if (r.skipped?.length) { <small class="muted">{{ 'AbpAdmin::Users:ImportSkipped' | abpLocalization: r.skipped!.join(', ') }}</small> }
          @for (e of r.errors; track $index) { <small class="err">{{ 'AbpAdmin::Users:ImportLine' | abpLocalization: (e.line ?? 0).toString() }} {{ e.message }}</small> }
          <button class="icon-btn close" (click)="imported.set(null)" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </section>
      }

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="{{ 'AbpAdmin::Users:SearchPlaceholder' | abpLocalization }}" [attr.aria-label]="'AbpAdmin::Users:SearchLabel' | abpLocalization"
                   (change)="search($any($event.target).value)" (search)="search($any($event.target).value)" />
          </label>
          @if (multi()) {
            <label class="field inline"><span>{{ 'AbpAdmin::Users:TenantFilter' | abpLocalization }}</span>
              <select class="input" [value]="tenant()" (change)="pickTenant($any($event.target).value)">
                <option value="">{{ 'AbpAdmin::Users:AllTenants' | abpLocalization }}</option>
                <option value="host">{{ 'AbpAdmin::Users:Host' | abpLocalization }}</option>
                @for (t of tenants.value(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }
              </select></label>
          }
          @if (failure(); as e) { <span class="alert tone-err">{{ e }}</span> }
        </div>

        @if (list.error()) {
          <div class="state err">{{ 'AbpAdmin::Users:LoadFailed' | abpLocalization }} <button class="btn" (click)="list.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3, 4, 5]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            <b>{{ 'AbpAdmin::Users:NoUsers' | abpLocalization }}</b><span class="muted">{{ filter() ? ('AbpAdmin::Users:NoMatch' | abpLocalization: filter()) : ('AbpAdmin::Users:CreateFirst' | abpLocalization) }}</span>
          </div>
        } @else {
          <table class="table" [class.loading]="list.isLoading()">
            <thead><tr><th>{{ 'AbpAdmin::Users:Col:User' | abpLocalization }}</th>@if (multi()) { <th>{{ 'AbpAdmin::Users:Tenant' | abpLocalization }}</th> }<th class="hide-sm">{{ 'AbpAdmin::Users:Email' | abpLocalization }}</th><th class="hide-sm">{{ 'AbpAdmin::Users:Phone' | abpLocalization }}</th><th>{{ 'AbpAdmin::Common:Status' | abpLocalization }}</th><th class="hide-sm">{{ 'AbpAdmin::Common:Created' | abpLocalization }}</th><th><span class="sr-only">{{ 'AbpAdmin::Common:Actions' | abpLocalization }}</span></th></tr></thead>
            <tbody>
              @for (u of rows(); track u.id) {
                <tr>
                  <td>
                    <span class="who-cell">
                      <span class="avatar" aria-hidden="true">{{ initials(u) }}</span>
                      <span><b>{{ fullName(u) || u.userName }}</b><small>&#64;{{ u.userName }}</small></span>
                    </span>
                  </td>
                  @if (multi()) { <td>@if (u.tenantId) { <span class="pill">{{ tenantName(u) }}</span> } @else { <span class="muted">{{ 'AbpAdmin::Users:Host' | abpLocalization }}</span> }</td> }
                  <td class="hide-sm">{{ u.email }}
                    @if (u.emailConfirmed) { <span class="ok" [title]="'AbpAdmin::Users:EmailConfirmed' | abpLocalization" [attr.aria-label]="'AbpAdmin::Users:Confirmed' | abpLocalization">✓</span> }</td>
                  <td class="hide-sm muted">{{ u.phoneNumber || '—' }}</td>
                  <td>
                    <span class="pills">
                      <span [class]="'pill tone-' + (u.isActive ? 'ok' : 'warn')">{{ (u.isActive ? 'AbpAdmin::Common:Active' : 'AbpAdmin::Users:Inactive') | abpLocalization }}</span>
                      @if (locked(u)) { <span class="pill tone-err" [title]="'AbpAdmin::Users:LockedUntil' | abpLocalization: u.lockoutEnd + ''">{{ 'AbpAdmin::Users:Locked' | abpLocalization }}</span> }
                    </span>
                  </td>
                  <td class="hide-sm muted">{{ relative(u.creationTime?.toString()) }}</td>
                  <td class="actions">
                    @if (confirming() === u.id) {
                      <span class="confirm">{{ 'AbpAdmin::Users:DeleteConfirm' | abpLocalization: u.userName ?? '' }}
                        <button class="btn sm danger" (click)="remove(u)">{{ 'AbpAdmin::Common:Delete' | abpLocalization }}</button>
                        <button class="btn sm" (click)="confirming.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button></span>
                    } @else {
                      @if (can('AbpIdentity.Users.Update')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Edit' | abpLocalization" [attr.aria-label]="'AbpAdmin::Users:EditAria' | abpLocalization: u.userName ?? ''" (click)="act(u.tenantId, () => editing.set(u))">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpIdentity.Users.Update')) {
                        @if (locked(u)) {
                          <button class="icon-btn" [title]="'AbpAdmin::Users:Unlock' | abpLocalization" [attr.aria-label]="'AbpAdmin::Users:UnlockAria' | abpLocalization: u.userName ?? ''" (click)="unlock(u)">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 9.6-2M5 11h14v10H5z" /></svg></button>
                        } @else if (u.id !== me) {
                          <button class="icon-btn" [title]="'AbpAdmin::Users:LockFor24h' | abpLocalization" [attr.aria-label]="'AbpAdmin::Users:LockAria' | abpLocalization: u.userName ?? ''" (click)="lock(u)">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" /></svg></button>
                        }
                      }
                      @if (can('AbpAdmin.SecurityLogs') && !u.tenantId) {
                        <a class="icon-btn" [title]="'AbpAdmin::Users:SignInHistory' | abpLocalization" [attr.aria-label]="'AbpAdmin::Users:SignInHistoryOf' | abpLocalization: u.userName ?? ''"
                           routerLink="../security-logs" [queryParams]="{ user: u.userName }">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" /></svg></a>
                      }
                      <button class="icon-btn" [title]="'AbpAdmin::Claims:Title' | abpLocalization" [attr.aria-label]="'AbpAdmin::Claims:Of' | abpLocalization: u.userName ?? ''"
                              (click)="act(u.tenantId, () => claims.set({ kind: 'user', id: u.id!, title: u.userName! }))">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12 12 20 4 12V4h8z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg></button>
                      @if (can('AbpAdmin.Cache')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Cache:ClearUser' | abpLocalization" [attr.aria-label]="'AbpAdmin::Cache:ClearFor' | abpLocalization: u.userName ?? ''" (click)="clearCache(u)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H9l-5-5 10-10 7 7-8 8M9 9l7 7" /></svg></button>
                      }
                      @if (historyPage && can('AbpAdmin.AuditLogs') && (!multi() || !u.tenantId)) {
                        <a class="icon-btn" [title]="'AbpAdmin::Common:ChangeHistory' | abpLocalization" [attr.aria-label]="'AbpAdmin::Common:ChangeHistoryOf' | abpLocalization: u.userName ?? ''"
                           [routerLink]="historyPage" [queryParams]="{ type: 'Volo.Abp.Identity.IdentityUser', id: u.id }">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg></a>
                      }
                      @if (can('AbpIdentity.Users.ManagePermissions')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Users:Permissions' | abpLocalization" [attr.aria-label]="'AbpAdmin::Users:PermissionsOf' | abpLocalization: u.userName ?? ''"
                                (click)="act(u.tenantId, () => perms.set({ providerName: 'U', providerKey: u.id!, title: u.userName! }))">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg></button>
                      }
                      @if (can('AbpIdentity.Users.Delete')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Delete' | abpLocalization" [attr.aria-label]="'AbpAdmin::Users:DeleteAria' | abpLocalization: u.userName ?? ''" (click)="confirming.set(u.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        <abp-pager [total]="total()" [(page)]="page" [(size)]="size" />
      </section>
    </div>

    <abp-user-form [user]="editing()" (closed)="editing.set(null)" (saved)="toaster.ok(l.instant('AbpAdmin::Users:Saved')); editing.set(null); list.reload()" />
    <abp-permissions-editor [target]="perms()" (closed)="perms.set(null)" />
    <abp-claims-editor [target]="claims()" [editable]="can('AbpIdentity.Users.Update')" (closed)="claims.set(null)" />
  `,
  styles: `
    .table.loading { opacity: 0.6; }
    .ok { color: var(--ok); margin-inline-start: 4px; }
    .filters .alert { flex-basis: 100%; }
    .field.inline { display: flex; align-items: center; gap: 8px; margin: 0; white-space: nowrap; }
    .field.inline select { width: auto; min-width: 160px; }
    .tools { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn.disabled { opacity: 0.5; pointer-events: none; }
    .import { position: relative; display: grid; gap: 4px; padding: 14px 44px 14px 18px; margin-bottom: 16px; }
    .import .err { color: var(--err); }
    .import .close { position: absolute; top: 8px; inset-inline-end: 8px; }
  `,
})
export class UsersPage {
  protected readonly legend: LegendItem[] = [
    { svg: ICONS.edit, labelKey: 'AbpAdmin::Common:Edit', hintKey: 'AbpAdmin::Legend:Users:Edit' },
    { svg: ICONS.lock, labelKey: 'AbpAdmin::Users:LockFor24h', hintKey: 'AbpAdmin::Legend:Users:Lock' },
    { svg: ICONS.unlock, labelKey: 'AbpAdmin::Users:Unlock', hintKey: 'AbpAdmin::Legend:Users:Unlock' },
    { svg: ICONS.signIns, labelKey: 'AbpAdmin::Users:SignInHistory', hintKey: 'AbpAdmin::Legend:Users:SignIns' },
    { svg: ICONS.claims, labelKey: 'AbpAdmin::Claims:Title', hintKey: 'AbpAdmin::Legend:Claims' },
    { svg: ICONS.cache, labelKey: 'AbpAdmin::Cache:ClearUser', hintKey: 'AbpAdmin::Legend:Users:Cache' },
    { svg: ICONS.history, labelKey: 'AbpAdmin::Common:ChangeHistory', hintKey: 'AbpAdmin::Legend:History' },
    { svg: ICONS.permissions, labelKey: 'AbpAdmin::Users:Permissions', hintKey: 'AbpAdmin::Legend:Users:Permissions' },
    { svg: ICONS.delete, labelKey: 'AbpAdmin::Common:Delete', hintKey: 'AbpAdmin::Legend:Users:Delete' },
  ];
  private readonly service = inject(IdentityUserService);
  private readonly permissions = inject(PermissionService);
  private readonly lockout = inject(UserLockoutService);
  protected readonly toaster = inject(Toaster);
  private readonly cache = inject(CacheService);
  protected readonly l = inject(LocalizationService);
  private readonly config = inject(ConfigStateService);
  protected readonly me = this.config.getOne('currentUser')?.id;
  private readonly scope = inject(TenantScope);
  private readonly tenantUsers = inject(TenantUserService);
  private readonly tenantService = inject(TenantService);

  /** Host admin with multi-tenancy on: users of every tenant, each managed inside its own tenant. */
  protected readonly multi = signal(!!this.config.getOne('multiTenancy')?.isEnabled
    && !this.config.getOne('currentUser')?.tenantId && this.can('AbpAdmin.Tenants.ManageUsers'));
  /** '' = all, 'host', or a tenant id. */
  protected readonly tenant = signal('');
  protected readonly tenants = rxResource({
    stream: () => this.multi() ? this.tenantService.getList({ maxResultCount: 1000 }).pipe(map(r => r.items ?? [])) : of([]),
    defaultValue: [],
  });

  /** `?new=1` opens the create sheet (used by the command palette). */
  readonly new = input<string>();
  protected readonly relative = relative;

  protected readonly filter = signal('');
  protected readonly page = signal(0);
  protected readonly size = signal(savedPageSize());
  protected readonly editing = signal<UserEdit | null>(null);
  protected readonly perms = signal<PermissionTarget | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly claims = signal<ClaimsTarget | null>(null);
  protected readonly imported = signal<UserImportResultDto | null>(null);
  protected readonly transferring = signal(false);
  /** Entity changes page (audit-logging package), when installed. */
  protected readonly historyPage = inject(AbpAdminRegistry).link('entity-changes');
  private readonly transfer = inject(UserTransferService);

  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, skipCount: this.page() * this.size(), maxResultCount: this.size(), tenant: this.tenant() }),
    stream: ({ params: { tenant, ...p } }) => {
      if (!this.multi()) return this.service.getList(p).pipe(map(r => ({ ...r, tenantNames: {} as Record<string, string> })));
      return this.tenantUsers.getList({ ...p, hostOnly: tenant === 'host', tenantId: tenant && tenant !== 'host' ? tenant : undefined });
    },
  });
  protected readonly rows = computed(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  private readonly pageInRange = keepPageInRange(this.page, this.size, this.total);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));

  constructor() {
    effect(() => { if (this.new() === '1' && this.can('AbpIdentity.Users.Create')) this.editing.set('new'); });
  }

  /** Runs `fn` with this page's identity calls going to `tenantId` (null: the host). */
  protected act(tenantId: string | null | undefined, fn: () => void) {
    this.scope.tenantId = this.multi() ? tenantId ?? null : null;
    fn();
  }

  /** New users go to the tenant picked in the filter, else the host. */
  protected createIn() {
    const t = this.tenant();
    return t && t !== 'host' ? t : null;
  }

  protected pickTenant(value: string) {
    this.tenant.set(value);
    this.page.set(0);
  }

  /** Users of the tenant picked in the filter (else the host) as CSV. */
  protected exportCsv() {
    this.act(this.createIn(), () => {
      this.transferring.set(true);
      this.transfer.export().subscribe({
        next: blob => {
          this.transferring.set(false);
          download(blob, 'users.csv');
        },
        error: e => { this.transferring.set(false); this.toaster.error(apiError(e)); },
      });
    });
  }

  /** Adds the users of a CSV file to the tenant picked in the filter (else the host); existing user names are skipped. */
  protected importCsv(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file, file.name);
    this.act(this.createIn(), () => {
      this.transferring.set(true);
      this.transfer.import(form).subscribe({
        next: r => { this.transferring.set(false); this.imported.set(r); this.list.reload(); },
        error: e => { this.transferring.set(false); this.toaster.error(apiError(e)); },
      });
    });
  }

  protected tenantName(u: IdentityUserDto) {
    return this.list.value()?.tenantNames?.[u.tenantId!] ?? u.tenantId;
  }

  protected lock(u: IdentityUserDto) {
    this.scope.tenantId = this.multi() ? u.tenantId ?? null : null;
    const until = new Date(Date.now() + 24 * 3600_000).toISOString();
    this.lockout.lock(u.id!, { until }).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::Users:LockedFor24h', u.userName ?? '')); this.list.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  /** The user's cached permissions and settings (and their roles'), in the user's tenant. */
  protected clearCache(u: IdentityUserDto) {
    this.cache.clearUser(u.id!, u.tenantId as string).subscribe({ // a null tenant (host user) is not sent
      next: () => this.toaster.ok(this.l.instant('AbpAdmin::Cache:Cleared', u.userName ?? '')),
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected unlock(u: IdentityUserDto) {
    this.scope.tenantId = this.multi() ? u.tenantId ?? null : null;
    this.lockout.unlock(u.id!).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::Users:Unlocked', u.userName ?? '')); this.list.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected can(policy: string) {
    return this.permissions.getGrantedPolicy(policy);
  }

  protected search(value: string) {
    this.filter.set(value.trim());
    this.page.set(0);
  }

  protected fullName(u: IdentityUserDto) {
    return [u.name, u.surname].filter(Boolean).join(' ');
  }

  protected initials(u: IdentityUserDto) {
    const n = this.fullName(u) || u.userName || '?';
    return n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  protected locked(u: IdentityUserDto) {
    return !!u.lockoutEnd && new Date(u.lockoutEnd).getTime() > Date.now();
  }

  protected remove(u: IdentityUserDto) {
    this.failure.set(null);
    this.scope.tenantId = this.multi() ? u.tenantId ?? null : null;
    this.service.delete(u.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('AbpAdmin::Users:Deleted', u.userName ?? '')); this.list.reload(); },
      error: e => { this.confirming.set(null); this.failure.set(apiError(e)); },
    });
  }
}
