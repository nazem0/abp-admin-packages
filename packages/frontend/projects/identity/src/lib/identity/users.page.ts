import { ConfigStateService, LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { UserEdit, UserFormComponent } from './user-form.component';
import { IdentityUserDto, IdentityUserService, UserLockoutService, TenantService, TenantUserService, PermissionsService, TenantScope, provideTenantScope, Toaster, relative, PermissionsEditorComponent, PermissionTarget, apiError } from '@nazem0/abp-admin-ng-core';

const PAGE_SIZE = 20;

@Component({
  selector: 'abp-users-page',
  imports: [UserFormComponent, PermissionsEditorComponent, RouterLink, LocalizationPipe],
  // Identity, lockout and permission calls made from this page (dialogs included) go to the row's tenant.
  providers: provideTenantScope(IdentityUserService, UserLockoutService, PermissionsService),
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::Users:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::Users:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpIdentity.Users.Create')) {
          <button class="btn primary" (click)="act(createIn(), () => editing.set('new'))">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ 'AbpAdmin::Users:NewUser' | abpLocalization }}
          </button>
        }
      </header>

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

        @if (total() > PAGE_SIZE) {
          <footer class="pager">
            <span class="muted">{{ 'AbpAdmin::Users:CountMany' | abpLocalization: total().toString() }}</span>
            <div>
              <button class="btn" [disabled]="page() === 0" (click)="page.set(page() - 1)">{{ 'AbpAdmin::Common:Previous' | abpLocalization }}</button>
              <span class="muted">{{ 'AbpAdmin::Users:PageOf' | abpLocalization: (page() + 1).toString() : pages().toString() }}</span>
              <button class="btn" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">{{ 'AbpAdmin::Common:Next' | abpLocalization }}</button>
            </div>
          </footer>
        } @else if (total()) {
          <footer class="pager"><span class="muted">{{ (total() === 1 ? 'AbpAdmin::Users:CountOne' : 'AbpAdmin::Users:CountMany') | abpLocalization: total().toString() }}</span></footer>
        }
      </section>
    </div>

    <abp-user-form [user]="editing()" (closed)="editing.set(null)" (saved)="toaster.ok(l.instant('AbpAdmin::Users:Saved')); editing.set(null); list.reload()" />
    <abp-permissions-editor [target]="perms()" (closed)="perms.set(null)" />
  `,
  styles: `
    .table.loading { opacity: 0.6; }
    .ok { color: var(--ok); margin-inline-start: 4px; }
    .filters .alert { flex-basis: 100%; }
    .field.inline { display: flex; align-items: center; gap: 8px; margin: 0; white-space: nowrap; }
    .field.inline select { width: auto; min-width: 160px; }
  `,
})
export class UsersPage {
  private readonly service = inject(IdentityUserService);
  private readonly permissions = inject(PermissionService);
  private readonly lockout = inject(UserLockoutService);
  protected readonly toaster = inject(Toaster);
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

  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected readonly relative = relative;

  protected readonly filter = signal('');
  protected readonly page = signal(0);
  protected readonly editing = signal<UserEdit | null>(null);
  protected readonly perms = signal<PermissionTarget | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, skipCount: this.page() * PAGE_SIZE, maxResultCount: PAGE_SIZE, tenant: this.tenant() }),
    stream: ({ params: { tenant, ...p } }) => {
      if (!this.multi()) return this.service.getList(p).pipe(map(r => ({ ...r, tenantNames: {} as Record<string, string> })));
      return this.tenantUsers.getList({ ...p, hostOnly: tenant === 'host', tenantId: tenant && tenant !== 'host' ? tenant : undefined });
    },
  });
  protected readonly rows = computed(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

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
