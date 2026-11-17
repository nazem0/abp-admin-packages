import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { Toaster, IdentityRoleDto, IdentityRoleService, relative, PermissionsEditorComponent, PermissionTarget, SheetDirective, apiError, RoleUsersService, AbpAdminRegistry } from '@nazem0/abp-admin-ng-core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { ClaimsEditorComponent, ClaimsTarget } from './claims-editor.component';

type RoleEdit = IdentityRoleDto | 'new';

@Component({
  selector: 'abp-role-form',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!role()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="rf-title">
      @if (role()) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="rf-title">{{ (x ? 'AbpAdmin::Roles:Form:EditRole' : 'AbpAdmin::Roles:NewRole') | abpLocalization }} @if (x) { <small>{{ x.name }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            <label class="field"><span>{{ 'AbpAdmin::Common:Name' | abpLocalization }} <i>*</i></span>
              <input class="input" name="name" required maxlength="256" autocomplete="off" [value]="x?.name ?? ''" [readOnly]="x?.isStatic" />
              @if (x?.isStatic) { <small>{{ 'AbpAdmin::Roles:Form:StaticHint' | abpLocalization }}</small> }</label>
            <label class="check"><input type="checkbox" class="switch" name="isDefault" [checked]="x?.isDefault" />
              <span>{{ 'AbpAdmin::Roles:Default' | abpLocalization }} <small>{{ 'AbpAdmin::Roles:Form:DefaultHint' | abpLocalization }}</small></span></label>
            <label class="check"><input type="checkbox" class="switch" name="isPublic" [checked]="x ? x.isPublic : true" />
              <span>{{ 'AbpAdmin::Roles:Public' | abpLocalization }} <small>{{ 'AbpAdmin::Roles:Form:PublicHint' | abpLocalization }}</small></span></label>
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="saving()">{{ (saving() ? 'AbpAdmin::Common:Saving' : x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Roles:Form:CreateRole') | abpLocalization }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `.sh-foot .alert { flex: 1; }`,
})
export class RoleFormComponent {
  private readonly service = inject(IdentityRoleService);
  readonly role = input<RoleEdit | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly existing = computed(() => {
    const r = this.role();
    return r && r !== 'new' ? r : null;
  });
  protected readonly error = linkedSignal<RoleEdit | null, string | null>({ source: this.role, computation: () => null });
  protected readonly saving = signal(false);

  protected save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const dto = { name: String(fd.get('name') ?? '').trim(), isDefault: fd.has('isDefault'), isPublic: fd.has('isPublic') };
    const x = this.existing();
    this.saving.set(true);
    this.error.set(null);
    (x ? this.service.update(x.id!, { ...dto, concurrencyStamp: x.concurrencyStamp }) : this.service.create(dto)).subscribe({
      next: () => { this.saving.set(false); this.saved.emit(); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}

@Component({
  selector: 'abp-roles-page',
  imports: [RouterLink, RoleFormComponent, PermissionsEditorComponent, ClaimsEditorComponent, SheetDirective, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::Roles:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::Roles:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpIdentity.Roles.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ 'AbpAdmin::Roles:NewRole' | abpLocalization }}
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="{{ 'AbpAdmin::Roles:SearchPlaceholder' | abpLocalization }}" [attr.aria-label]="'AbpAdmin::Roles:SearchLabel' | abpLocalization"
                   (change)="search($any($event.target).value)" (search)="search($any($event.target).value)" />
          </label>
          @if (failure(); as e) { <span class="alert tone-err">{{ e }}</span> }
        </div>

        @if (list.error()) {
          <div class="state err">{{ 'AbpAdmin::Roles:LoadFailed' | abpLocalization }} <button class="btn" (click)="list.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty"><b>{{ 'AbpAdmin::Roles:NoRoles' | abpLocalization }}</b><span class="muted">{{ filter() ? ('AbpAdmin::Roles:NoMatch' | abpLocalization: filter()) : ('AbpAdmin::Roles:CreateFirst' | abpLocalization) }}</span></div>
        } @else {
          <table class="table">
            <thead><tr><th>{{ 'AbpAdmin::Roles:Col:Role' | abpLocalization }}</th><th>{{ 'AbpAdmin::Roles:Col:Flags' | abpLocalization }}</th><th class="hide-sm">{{ 'AbpAdmin::Common:Created' | abpLocalization }}</th><th><span class="sr-only">{{ 'AbpAdmin::Common:Actions' | abpLocalization }}</span></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">{{ r.name?.[0]?.toUpperCase() }}</span><b>{{ r.name }}</b></span></td>
                  <td>
                    <span class="pills">
                      @if (r.isStatic) { <span class="pill tone-accent" [title]="'AbpAdmin::Roles:StaticHint' | abpLocalization">{{ 'AbpAdmin::Roles:Static' | abpLocalization }}</span> }
                      @if (r.isDefault) { <span class="pill tone-info" [title]="'AbpAdmin::Roles:DefaultHint' | abpLocalization">{{ 'AbpAdmin::Roles:Default' | abpLocalization }}</span> }
                      @if (r.isPublic) { <span class="pill" [title]="'AbpAdmin::Roles:PublicHint' | abpLocalization">{{ 'AbpAdmin::Roles:Public' | abpLocalization }}</span> }
                    </span>
                  </td>
                  <td class="hide-sm muted">{{ relative(r.creationTime?.toString()) }}</td>
                  <td class="actions">
                    @if (confirming() === r.id) {
                      <span class="confirm">{{ 'AbpAdmin::Roles:DeleteConfirm' | abpLocalization: r.name ?? '' }}
                        <button class="btn sm danger" (click)="remove(r)">{{ 'AbpAdmin::Common:Delete' | abpLocalization }}</button>
                        <button class="btn sm" (click)="confirming.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button></span>
                    } @else {
                      @if (can('AbpIdentity.Roles.Update')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Edit' | abpLocalization" [attr.aria-label]="'AbpAdmin::Roles:EditAria' | abpLocalization: r.name ?? ''" (click)="editing.set(r)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpIdentity.Roles.ManagePermissions')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Roles:Permissions' | abpLocalization" [attr.aria-label]="'AbpAdmin::Roles:PermissionsOf' | abpLocalization: r.name ?? ''"
                                (click)="perms.set({ providerName: 'R', providerKey: r.name!, title: l.instant('AbpAdmin::Roles:RoleTitle', r.name ?? '') })">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg></button>
                      }
                      <button class="icon-btn" [title]="'AbpAdmin::Claims:Title' | abpLocalization" [attr.aria-label]="'AbpAdmin::Claims:Of' | abpLocalization: r.name ?? ''"
                              (click)="claims.set({ kind: 'role', id: r.id!, title: r.name! })">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12 12 20 4 12V4h8z" /><circle cx="8.5" cy="8.5" r="1.5" /></svg></button>
                      @if (can('AbpIdentity.Roles.Update') && can('AbpIdentity.Users.Update')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Roles:MoveUsers' | abpLocalization" [attr.aria-label]="'AbpAdmin::Roles:MoveUsersOf' | abpLocalization: r.name ?? ''" (click)="moving.set(r)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 11-4.7M16 14h6M19 11l3 3-3 3" /></svg></button>
                      }
                      @if (historyPage && can('AbpAdmin.AuditLogs')) {
                        <a class="icon-btn" [title]="'AbpAdmin::Common:ChangeHistory' | abpLocalization" [attr.aria-label]="'AbpAdmin::Common:ChangeHistoryOf' | abpLocalization: r.name ?? ''"
                           [routerLink]="historyPage" [queryParams]="{ type: 'Volo.Abp.Identity.IdentityRole', id: r.id }">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg></a>
                      }
                      @if (can('AbpIdentity.Roles.Delete') && !r.isStatic) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Delete' | abpLocalization" [attr.aria-label]="'AbpAdmin::Roles:DeleteAria' | abpLocalization: r.name ?? ''" (click)="confirming.set(r.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <footer class="pager"><span class="muted">{{ (total() === 1 ? 'AbpAdmin::Roles:CountOne' : 'AbpAdmin::Roles:CountMany') | abpLocalization: total().toString() }}</span>
            @if (total() > rows().length) { <span class="muted">{{ 'AbpAdmin::Roles:ShowingFirst' | abpLocalization: rows().length.toString() }}</span> }
          </footer>
        }
      </section>
    </div>

    <abp-role-form [role]="editing()" (closed)="editing.set(null)" (saved)="toaster.ok(l.instant('AbpAdmin::Roles:Saved')); editing.set(null); list.reload()" />
    <abp-permissions-editor [target]="perms()" (closed)="perms.set(null)" />
    <abp-claims-editor [target]="claims()" [editable]="can('AbpIdentity.Roles.Update')" (closed)="claims.set(null)" />

    <dialog [appSheet]="!!moving()" (dismiss)="moving.set(null)" class="narrow" aria-labelledby="mu-title">
      @if (moving(); as m) {
        <form #mf (submit)="$event.preventDefault(); moveUsers(m, mf)">
          <header class="sh-head">
            <h2 id="mu-title">{{ 'AbpAdmin::Roles:MoveUsers' | abpLocalization }} <small>{{ m.name }}</small></h2>
            <button type="button" class="icon-btn" (click)="moving.set(null)" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
          </header>
          <div class="sh-body form">
            <p class="muted">{{ 'AbpAdmin::Roles:MoveUsersIntro' | abpLocalization: m.name ?? '' }}</p>
            <label class="field"><span>{{ 'AbpAdmin::Roles:MoveTo' | abpLocalization }}</span>
              <select class="input" name="target">
                <option value="">{{ 'AbpAdmin::Roles:MoveToNone' | abpLocalization }}</option>
                @for (r of rows(); track r.id) { @if (r.id !== m.id) { <option [value]="r.id">{{ r.name }}</option> } }
              </select></label>
          </div>
          <footer class="sh-foot">
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="moving.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="busy()">{{ 'AbpAdmin::Roles:MoveUsersGo' | abpLocalization }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    .avatar.sq { border-radius: 9px; }
    .filters .alert { flex-basis: 100%; }
  `,
})
export class RolesPage {
  private readonly service = inject(IdentityRoleService);
  protected readonly toaster = inject(Toaster);
  protected readonly l = inject(LocalizationService);
  readonly new = input<string>();
  private readonly permissions = inject(PermissionService);
  protected readonly relative = relative;

  protected readonly filter = signal('');
  protected readonly editing = signal<RoleEdit | null>(null);
  protected readonly perms = signal<PermissionTarget | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly claims = signal<ClaimsTarget | null>(null);
  protected readonly moving = signal<IdentityRoleDto | null>(null);
  protected readonly busy = signal(false);
  /** Entity changes page (audit-logging package), when installed. */
  protected readonly historyPage = inject(AbpAdminRegistry).link('entity-changes');
  private readonly roleUsers = inject(RoleUsersService);

  // ponytail: first 100 roles only; add paging if a deployment ever has more.
  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, maxResultCount: 100 }),
    stream: ({ params }) => this.service.getList(params),
  });
  protected readonly rows = computed(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);

  constructor() {
    effect(() => { if (this.new() === '1' && this.can('AbpIdentity.Roles.Create')) this.editing.set('new'); });
  }

  protected can(policy: string) {
    return this.permissions.getGrantedPolicy(policy);
  }

  protected search(value: string) {
    this.filter.set(value.trim());
  }

  protected moveUsers(role: IdentityRoleDto, form: HTMLFormElement) {
    const target = String(new FormData(form).get('target') ?? '') || null;
    const targetName = this.rows().find(r => r.id === target)?.name;
    this.busy.set(true);
    this.roleUsers.moveAllUsers(role.id!, { targetRoleId: target }).subscribe({
      next: r => {
        this.busy.set(false);
        this.moving.set(null);
        this.toaster.ok(targetName
          ? this.l.instant('AbpAdmin::Roles:MovedTo', String(r.moved ?? 0), role.name ?? '', targetName)
          : this.l.instant('AbpAdmin::Roles:MovedOut', String(r.moved ?? 0), role.name ?? ''));
      },
      error: e => { this.busy.set(false); this.toaster.error(apiError(e)); },
    });
  }

  protected remove(r: IdentityRoleDto) {
    this.failure.set(null);
    this.service.delete(r.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('AbpAdmin::Roles:Deleted', r.name ?? '')); this.list.reload(); },
      error: e => { this.confirming.set(null); this.failure.set(apiError(e)); },
    });
  }
}
