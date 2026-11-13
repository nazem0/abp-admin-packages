import { ConfigStateService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { IdentityUserDto, IdentityUserService } from '../proxy/volo/abp/identity';
import { UserLockoutService } from '../proxy/services/identity';
import { Toaster } from '../shared/toast';
import { relative } from '../audit-logs/format';
import { PermissionsEditorComponent, PermissionTarget } from '../permissions/permissions-editor.component';
import { apiError } from '../shared/api-error';
import { UserEdit, UserFormComponent } from './user-form.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-users-page',
  imports: [UserFormComponent, PermissionsEditorComponent, RouterLink],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>Users</h1>
          <p class="muted">Accounts that can sign in, their roles and their individual permissions.</p>
        </div>
        @if (can('AbpIdentity.Users.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> New user
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="Search name, user name, email or phone…" aria-label="Search users"
                   (change)="search($any($event.target).value)" (search)="search($any($event.target).value)" />
          </label>
          @if (failure(); as e) { <span class="alert tone-err">{{ e }}</span> }
        </div>

        @if (list.error()) {
          <div class="state err">Couldn't load users. <button class="btn" (click)="list.reload()">Retry</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3, 4, 5]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
            <b>No users</b><span class="muted">{{ filter() ? 'Nobody matches “' + filter() + '”.' : 'Create the first user.' }}</span>
          </div>
        } @else {
          <table class="table" [class.loading]="list.isLoading()">
            <thead><tr><th>User</th><th class="hide-sm">Email</th><th class="hide-sm">Phone</th><th>Status</th><th class="hide-sm">Created</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (u of rows(); track u.id) {
                <tr>
                  <td>
                    <span class="who-cell">
                      <span class="avatar" aria-hidden="true">{{ initials(u) }}</span>
                      <span><b>{{ fullName(u) || u.userName }}</b><small>&#64;{{ u.userName }}</small></span>
                    </span>
                  </td>
                  <td class="hide-sm">{{ u.email }}
                    @if (u.emailConfirmed) { <span class="ok" title="Email confirmed" aria-label="confirmed">✓</span> }</td>
                  <td class="hide-sm muted">{{ u.phoneNumber || '—' }}</td>
                  <td>
                    <span class="pills">
                      <span [class]="'pill tone-' + (u.isActive ? 'ok' : 'warn')">{{ u.isActive ? 'Active' : 'Inactive' }}</span>
                      @if (locked(u)) { <span class="pill tone-err" [title]="'Locked until ' + u.lockoutEnd">Locked</span> }
                    </span>
                  </td>
                  <td class="hide-sm muted">{{ relative(u.creationTime?.toString()) }}</td>
                  <td class="actions">
                    @if (confirming() === u.id) {
                      <span class="confirm">Delete {{ u.userName }}?
                        <button class="btn sm danger" (click)="remove(u)">Delete</button>
                        <button class="btn sm" (click)="confirming.set(null)">Cancel</button></span>
                    } @else {
                      @if (can('AbpIdentity.Users.Update')) {
                        <button class="icon-btn" title="Edit" [attr.aria-label]="'Edit ' + u.userName" (click)="editing.set(u)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpIdentity.Users.Update')) {
                        @if (locked(u)) {
                          <button class="icon-btn" title="Unlock" [attr.aria-label]="'Unlock ' + u.userName" (click)="unlock(u)">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 9.6-2M5 11h14v10H5z" /></svg></button>
                        } @else if (u.id !== me) {
                          <button class="icon-btn" title="Lock for 24 hours" [attr.aria-label]="'Lock ' + u.userName" (click)="lock(u)">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" /></svg></button>
                        }
                      }
                      @if (can('AbpAdmin.SecurityLogs')) {
                        <a class="icon-btn" title="Sign-in history" [attr.aria-label]="'Sign-in history of ' + u.userName"
                           routerLink="/security-logs" [queryParams]="{ user: u.userName }">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" /></svg></a>
                      }
                      @if (can('AbpIdentity.Users.ManagePermissions')) {
                        <button class="icon-btn" title="Permissions" [attr.aria-label]="'Permissions of ' + u.userName"
                                (click)="perms.set({ providerName: 'U', providerKey: u.id!, title: u.userName! })">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg></button>
                      }
                      @if (can('AbpIdentity.Users.Delete')) {
                        <button class="icon-btn" title="Delete" [attr.aria-label]="'Delete ' + u.userName" (click)="confirming.set(u.id!)">
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
            <span class="muted">{{ total() }} users</span>
            <div>
              <button class="btn" [disabled]="page() === 0" (click)="page.set(page() - 1)">Previous</button>
              <span class="muted">Page {{ page() + 1 }} of {{ pages() }}</span>
              <button class="btn" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">Next</button>
            </div>
          </footer>
        } @else if (total()) {
          <footer class="pager"><span class="muted">{{ total() }} user{{ total() === 1 ? '' : 's' }}</span></footer>
        }
      </section>
    </div>

    <app-user-form [user]="editing()" (closed)="editing.set(null)" (saved)="toaster.ok('User saved.'); editing.set(null); list.reload()" />
    <app-permissions-editor [target]="perms()" (closed)="perms.set(null)" />
  `,
  styles: `
    .table.loading { opacity: 0.6; }
    .ok { color: var(--ok); margin-inline-start: 4px; }
    .filters .alert { flex-basis: 100%; }
  `,
})
export class UsersPage {
  private readonly service = inject(IdentityUserService);
  private readonly permissions = inject(PermissionService);
  private readonly lockout = inject(UserLockoutService);
  protected readonly toaster = inject(Toaster);
  protected readonly me = inject(ConfigStateService).getOne('currentUser')?.id;

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
    params: () => ({ filter: this.filter() || undefined, skipCount: this.page() * PAGE_SIZE, maxResultCount: PAGE_SIZE }),
    stream: ({ params }) => this.service.getList(params),
  });
  protected readonly rows = computed(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  constructor() {
    effect(() => { if (this.new() === '1' && this.can('AbpIdentity.Users.Create')) this.editing.set('new'); });
  }

  protected lock(u: IdentityUserDto) {
    const until = new Date(Date.now() + 24 * 3600_000).toISOString();
    this.lockout.lock(u.id!, { until }).subscribe({
      next: () => { this.toaster.ok(`${u.userName} is locked for 24 hours.`); this.list.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected unlock(u: IdentityUserDto) {
    this.lockout.unlock(u.id!).subscribe({
      next: () => { this.toaster.ok(`${u.userName} is unlocked.`); this.list.reload(); },
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
    this.service.delete(u.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(`Deleted ${u.userName}.`); this.list.reload(); },
      error: e => { this.confirming.set(null); this.failure.set(apiError(e)); },
    });
  }
}
