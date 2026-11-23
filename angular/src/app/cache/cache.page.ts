import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { IdentityRoleDto, IdentityRoleService, IdentityUserDto, IdentityUserService } from '../proxy/volo/abp/identity';
import { CacheScope, CacheService } from '../proxy/services/caching';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

/** Clears ABP's permission, setting and feature caches when a change made outside the admin doesn't apply. */
@Component({
  selector: 'app-cache-page',
  imports: [LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ '::Cache:Title' | abpLocalization }}</h1>
          <p class="muted">{{ '::Cache:Subtitle' | abpLocalization }}</p>
        </div>
      </header>

      <div class="grid">
        <form class="card box" (submit)="$event.preventDefault(); clear(Scope.User, user.value)">
          <h2>{{ '::Cache:User:Title' | abpLocalization }}</h2>
          <p class="muted">{{ '::Cache:User:Intro' | abpLocalization }}</p>
          <label class="field">{{ '::Cache:UserName' | abpLocalization }}
            <input #user class="input" required autocomplete="off" list="cache-users" (input)="userQuery.set($any($event.target).value.trim())" /></label>
          <datalist id="cache-users">@for (u of users.value(); track u.id) { <option [value]="u.userName">{{ u.name }} {{ u.surname }}</option> }</datalist>
          <button class="btn primary" [disabled]="busy()">{{ '::Cache:Clear' | abpLocalization }}</button>
        </form>

        <form class="card box" (submit)="$event.preventDefault(); clear(Scope.Role, $any($event.target).elements.role.value)">
          <h2>{{ '::Cache:Role:Title' | abpLocalization }}</h2>
          <p class="muted">{{ '::Cache:Role:Intro' | abpLocalization }}</p>
          <label class="field">{{ '::Cache:RoleName' | abpLocalization }}
            @if (roles.value().length) {
              <select name="role" class="input" required>@for (r of roles.value(); track r.id) { <option [value]="r.name">{{ r.name }}</option> }</select>
            } @else {
              <input name="role" class="input" required autocomplete="off" />
            }
          </label>
          <button class="btn primary" [disabled]="busy()">{{ '::Cache:Clear' | abpLocalization }}</button>
        </form>

        <div class="card box">
          <h2>{{ '::Cache:All:Title' | abpLocalization }}</h2>
          <p class="muted">{{ '::Cache:All:Intro' | abpLocalization }}</p>
          @if (confirming()) {
            <span class="confirm">
              <button class="btn danger" [disabled]="busy()" (click)="clear(Scope.Everything)">{{ '::Cache:All:Confirm' | abpLocalization }}</button>
              <button class="btn" (click)="confirming.set(false)">{{ '::Common:Cancel' | abpLocalization }}</button>
            </span>
          } @else {
            <button class="btn" [disabled]="busy()" (click)="confirming.set(true)">{{ '::Cache:All:Button' | abpLocalization }}</button>
          }
        </div>
      </div>

      @if (result(); as r) { <p class="muted" role="status">{{ r }}</p> }
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    @media (max-width: 960px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .box { display: flex; flex-direction: column; gap: 10px; padding: 20px 22px; }
    h2 { font-size: 16px; font-weight: 650; }
    .box p { margin: 0; line-height: 1.5; flex: 1; }
    .field { display: grid; gap: 4px; font-size: 13px; font-weight: 550; }
    .box .btn { align-self: flex-start; }
    .confirm { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export class CachePage {
  private readonly service = inject(CacheService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  protected readonly Scope = CacheScope;
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly result = signal('');

  // Pickers need the Identity read permissions; without them the fields stay plain text inputs.
  private readonly can = inject(PermissionService);
  private readonly userService = inject(IdentityUserService);
  private readonly roleService = inject(IdentityRoleService);
  protected readonly roles = rxResource({
    stream: () => this.can.getGrantedPolicy('AbpIdentity.Roles') ? this.roleService.getAllList().pipe(map(r => r.items ?? [])) : of([]),
    defaultValue: [] as IdentityRoleDto[],
  });
  /** Users can be many: suggest the first 20 matching what's typed. */
  protected readonly userQuery = signal('');
  protected readonly users = rxResource({
    params: () => this.userQuery(),
    stream: ({ params: filter }) => this.can.getGrantedPolicy('AbpIdentity.Users')
      ? this.userService.getList({ filter, maxResultCount: 20 }).pipe(map(r => r.items ?? []))
      : of([]),
    defaultValue: [] as IdentityUserDto[],
  });

  protected clear(scope: CacheScope, name?: string) {
    this.busy.set(true);
    this.service.clear({ scope, name: name?.trim() }).subscribe({
      next: r => {
        this.busy.set(false);
        this.confirming.set(false);
        const text = this.l.instant('::Cache:Cleared', `${r.users}`, `${r.roles}`, `${r.tenants}`, `${r.keys}`);
        this.result.set(text);
        this.toaster.ok(text);
      },
      error: e => { this.busy.set(false); this.toaster.error(apiError(e)); },
    });
  }
}
