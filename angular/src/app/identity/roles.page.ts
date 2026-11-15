import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { Toaster } from '../shared/toast';
import { rxResource } from '@angular/core/rxjs-interop';
import { IdentityRoleDto, IdentityRoleService } from '../proxy/volo/abp/identity';
import { relative } from '../audit-logs/format';
import { PermissionsEditorComponent, PermissionTarget } from '../permissions/permissions-editor.component';
import { SheetDirective } from '../shared/sheet.directive';
import { apiError } from '../shared/api-error';

type RoleEdit = IdentityRoleDto | 'new';

@Component({
  selector: 'app-role-form',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!role()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="rf-title">
      @if (role()) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="rf-title">{{ (x ? '::Roles:Form:EditRole' : '::Roles:NewRole') | abpLocalization }} @if (x) { <small>{{ x.name }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            <label class="field"><span>{{ '::Common:Name' | abpLocalization }} <i>*</i></span>
              <input class="input" name="name" required maxlength="256" autocomplete="off" [value]="x?.name ?? ''" [readOnly]="x?.isStatic" />
              @if (x?.isStatic) { <small>{{ '::Roles:Form:StaticHint' | abpLocalization }}</small> }</label>
            <label class="check"><input type="checkbox" class="switch" name="isDefault" [checked]="x?.isDefault" />
              <span>{{ '::Roles:Default' | abpLocalization }} <small>{{ '::Roles:Form:DefaultHint' | abpLocalization }}</small></span></label>
            <label class="check"><input type="checkbox" class="switch" name="isPublic" [checked]="x ? x.isPublic : true" />
              <span>{{ '::Roles:Public' | abpLocalization }} <small>{{ '::Roles:Form:PublicHint' | abpLocalization }}</small></span></label>
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ '::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="saving()">{{ (saving() ? '::Common:Saving' : x ? '::Common:Save' : '::Roles:Form:CreateRole') | abpLocalization }}</button>
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
  selector: 'app-roles-page',
  imports: [RoleFormComponent, PermissionsEditorComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ '::Roles:Title' | abpLocalization }}</h1>
          <p class="muted">{{ '::Roles:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpIdentity.Roles.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ '::Roles:NewRole' | abpLocalization }}
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="{{ '::Roles:SearchPlaceholder' | abpLocalization }}" [attr.aria-label]="'::Roles:SearchLabel' | abpLocalization"
                   (change)="search($any($event.target).value)" (search)="search($any($event.target).value)" />
          </label>
          @if (failure(); as e) { <span class="alert tone-err">{{ e }}</span> }
        </div>

        @if (list.error()) {
          <div class="state err">{{ '::Roles:LoadFailed' | abpLocalization }} <button class="btn" (click)="list.reload()">{{ '::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty"><b>{{ '::Roles:NoRoles' | abpLocalization }}</b><span class="muted">{{ filter() ? ('::Roles:NoMatch' | abpLocalization: filter()) : ('::Roles:CreateFirst' | abpLocalization) }}</span></div>
        } @else {
          <table class="table">
            <thead><tr><th>{{ '::Roles:Col:Role' | abpLocalization }}</th><th>{{ '::Roles:Col:Flags' | abpLocalization }}</th><th class="hide-sm">{{ '::Common:Created' | abpLocalization }}</th><th><span class="sr-only">{{ '::Common:Actions' | abpLocalization }}</span></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">{{ r.name?.[0]?.toUpperCase() }}</span><b>{{ r.name }}</b></span></td>
                  <td>
                    <span class="pills">
                      @if (r.isStatic) { <span class="pill tone-accent" [title]="'::Roles:StaticHint' | abpLocalization">{{ '::Roles:Static' | abpLocalization }}</span> }
                      @if (r.isDefault) { <span class="pill tone-info" [title]="'::Roles:DefaultHint' | abpLocalization">{{ '::Roles:Default' | abpLocalization }}</span> }
                      @if (r.isPublic) { <span class="pill" [title]="'::Roles:PublicHint' | abpLocalization">{{ '::Roles:Public' | abpLocalization }}</span> }
                    </span>
                  </td>
                  <td class="hide-sm muted">{{ relative(r.creationTime?.toString()) }}</td>
                  <td class="actions">
                    @if (confirming() === r.id) {
                      <span class="confirm">{{ '::Roles:DeleteConfirm' | abpLocalization: r.name ?? '' }}
                        <button class="btn sm danger" (click)="remove(r)">{{ '::Common:Delete' | abpLocalization }}</button>
                        <button class="btn sm" (click)="confirming.set(null)">{{ '::Common:Cancel' | abpLocalization }}</button></span>
                    } @else {
                      @if (can('AbpIdentity.Roles.Update')) {
                        <button class="icon-btn" [title]="'::Common:Edit' | abpLocalization" [attr.aria-label]="'::Roles:EditAria' | abpLocalization: r.name ?? ''" (click)="editing.set(r)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpIdentity.Roles.ManagePermissions')) {
                        <button class="icon-btn" [title]="'::Roles:Permissions' | abpLocalization" [attr.aria-label]="'::Roles:PermissionsOf' | abpLocalization: r.name ?? ''"
                                (click)="perms.set({ providerName: 'R', providerKey: r.name!, title: l.instant('::Roles:RoleTitle', r.name ?? '') })">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg></button>
                      }
                      @if (can('AbpIdentity.Roles.Delete') && !r.isStatic) {
                        <button class="icon-btn" [title]="'::Common:Delete' | abpLocalization" [attr.aria-label]="'::Roles:DeleteAria' | abpLocalization: r.name ?? ''" (click)="confirming.set(r.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <footer class="pager"><span class="muted">{{ (total() === 1 ? '::Roles:CountOne' : '::Roles:CountMany') | abpLocalization: total().toString() }}</span>
            @if (total() > rows().length) { <span class="muted">{{ '::Roles:ShowingFirst' | abpLocalization: rows().length.toString() }}</span> }
          </footer>
        }
      </section>
    </div>

    <app-role-form [role]="editing()" (closed)="editing.set(null)" (saved)="toaster.ok(l.instant('::Roles:Saved')); editing.set(null); list.reload()" />
    <app-permissions-editor [target]="perms()" (closed)="perms.set(null)" />
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

  protected remove(r: IdentityRoleDto) {
    this.failure.set(null);
    this.service.delete(r.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('::Roles:Deleted', r.name ?? '')); this.list.reload(); },
      error: e => { this.confirming.set(null); this.failure.set(apiError(e)); },
    });
  }
}
