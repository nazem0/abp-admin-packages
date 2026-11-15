import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TenantDto, TenantService, relative, SheetDirective, apiError, Toaster } from '@nazem0/abp-admin-ng-core';

type TenantEdit = TenantDto | 'new';

/** Connection string textarea (posted as `connectionString`) with a "Test connection" button. */
@Component({
  selector: 'abp-connection-string-field',
  imports: [LocalizationPipe],
  template: `
    <label class="field"><span>{{ 'AbpAdmin::Tenants:Connection:Label' | abpLocalization }} <i>*</i></span>
      <textarea #cs class="input mono" name="connectionString" rows="3" required maxlength="1024" spellcheck="false"
                placeholder="Server=…;Database=acme;…" (input)="result.set(null)">{{ value() }}</textarea>
      <small>{{ 'AbpAdmin::Tenants:Connection:Hint' | abpLocalization }}</small></label>
    <div class="test">
      <button type="button" class="btn sm" [disabled]="testing()" (click)="test(cs.value)">{{ (testing() ? 'AbpAdmin::Tenants:Connection:Testing' : 'AbpAdmin::Tenants:Connection:Test') | abpLocalization }}</button>
      @if (result(); as r) { <span [class]="'pill ' + r.tone">{{ r.text }}</span> }
    </div>
  `,
  styles: `
    textarea.input { height: auto; padding: 8px 11px; resize: vertical; line-height: 1.5; font-size: 12.5px; }
    :host { display: grid; gap: 10px; }
    .test { display: flex; align-items: center; gap: 10px; }
  `,
})
export class ConnectionStringFieldComponent {
  private readonly service = inject(TenantService);
  private readonly l = inject(LocalizationService);
  readonly value = input('');
  protected readonly testing = signal(false);
  protected readonly result = signal<{ text: string; tone: string } | null>(null);

  protected test(connectionString: string) {
    this.testing.set(true);
    this.service.checkConnectionString({ connectionString }).subscribe({
      next: r => {
        this.testing.set(false);
        this.result.set(!r.connected ? { text: this.l.instant('AbpAdmin::Tenants:Connection:CantConnect'), tone: 'tone-err' }
          : r.databaseExists ? { text: this.l.instant('AbpAdmin::Tenants:Connection:ConnectedExists'), tone: 'tone-ok' }
          : { text: this.l.instant('AbpAdmin::Tenants:Connection:ConnectedCreate'), tone: 'tone-ok' });
      },
      error: e => { this.testing.set(false); this.result.set({ text: apiError(e), tone: 'tone-err' }); },
    });
  }
}

/** Choose between the shared database and the tenant's own. */
@Component({
  selector: 'abp-database-choice',
  imports: [LocalizationPipe],
  template: `
    <div class="field" role="radiogroup" [attr.aria-label]="'AbpAdmin::Tenants:Database' | abpLocalization">
      <span>{{ 'AbpAdmin::Tenants:Database' | abpLocalization }}</span>
      <div class="seg">
        <label><input type="radio" name="db" value="shared" [checked]="!own()" (change)="own.set(false)" /> {{ 'AbpAdmin::Tenants:Shared' | abpLocalization }}</label>
        <label><input type="radio" name="db" value="own" [checked]="own()" (change)="own.set(true)" /> {{ 'AbpAdmin::Tenants:ItsOwn' | abpLocalization }}</label>
      </div>
    </div>
  `,
  styles: `
    .seg { display: inline-flex; gap: 4px; padding: 3px; border: 1px solid var(--border); border-radius: 10px; width: fit-content; }
    .seg label { display: flex; align-items: center; padding: 5px 12px; border-radius: 7px; cursor: pointer; font-size: 13px; }
    .seg label:has(:checked) { background: var(--accent-soft, var(--hover)); color: var(--accent); font-weight: 600; }
    .seg input { position: absolute; opacity: 0; pointer-events: none; }
    .seg label:has(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
  `,
})
export class DatabaseChoiceComponent {
  readonly own = model(false);
}

@Component({
  selector: 'abp-tenant-form',
  imports: [SheetDirective, ConnectionStringFieldComponent, DatabaseChoiceComponent, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!tenant()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="tf-title">
      @if (tenant()) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="tf-title">{{ (x ? 'AbpAdmin::Tenants:Form:Rename' : 'AbpAdmin::Tenants:Form:New') | abpLocalization }} @if (x) { <small>{{ x.name }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            <label class="field"><span>{{ 'AbpAdmin::Common:Name' | abpLocalization }} <i>*</i></span>
              <input class="input" name="name" required maxlength="64" autocomplete="off" [value]="x?.name ?? ''" placeholder="acme" />
              <small>{{ 'AbpAdmin::Tenants:Form:NameHint' | abpLocalization }}</small></label>
            @if (!x) {
              <label class="field"><span>{{ 'AbpAdmin::Tenants:Form:AdminEmail' | abpLocalization }} <i>*</i></span>
                <input class="input" name="adminEmailAddress" type="email" required maxlength="256" autocomplete="off" placeholder="admin@acme.com" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Tenants:Form:AdminPassword' | abpLocalization }} <i>*</i></span>
                <input class="input" name="adminPassword" type="password" required maxlength="128" autocomplete="new-password" />
                <small>{{ 'AbpAdmin::Tenants:Form:AdminPasswordHint' | abpLocalization: 'admin' }}</small></label>
              @if (canManageDb()) {
                <abp-database-choice [(own)]="ownDb" />
                @if (ownDb()) { <abp-connection-string-field /> }
              }
            }
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="saving()">{{ saving() ? ('AbpAdmin::Common:Saving' | abpLocalization) : x ? ('AbpAdmin::Common:Save' | abpLocalization) : ('AbpAdmin::Tenants:Form:CreateTenant' | abpLocalization) }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `.sh-foot .alert { flex: 1; }`,
})
export class TenantFormComponent {
  private readonly service = inject(TenantService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  readonly tenant = input<TenantEdit | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly existing = computed(() => { const t = this.tenant(); return t && t !== 'new' ? t : null; });
  protected readonly error = linkedSignal<TenantEdit | null, string | null>({ source: this.tenant, computation: () => null });
  protected readonly ownDb = linkedSignal<TenantEdit | null, boolean>({ source: this.tenant, computation: () => false });
  protected readonly saving = signal(false);
  private readonly permissions = inject(PermissionService);
  protected readonly canManageDb = () => this.permissions.getGrantedPolicy('AbpAdmin.Tenants.ManageConnectionStrings');

  protected save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? '').trim();
    const name = text('name');
    const x = this.existing();
    this.saving.set(true);
    this.error.set(null);
    (x
      ? this.service.update(x.id!, { name })
      : this.service.create({
          name, adminEmailAddress: text('adminEmailAddress'), adminPassword: String(fd.get('adminPassword') ?? ''),
          connectionString: this.ownDb() ? text('connectionString') : null,
        })
    ).subscribe({
      next: () => { this.saving.set(false); this.toaster.ok(this.l.instant(x ? 'AbpAdmin::Tenants:Form:Renamed' : 'AbpAdmin::Tenants:Form:Created', name)); this.saved.emit(); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}

/** A tenant's database: the shared one or its own (connection string), with a connection test. */
@Component({
  selector: 'abp-tenant-database',
  imports: [SheetDirective, ConnectionStringFieldComponent, DatabaseChoiceComponent, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!tenant()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="td-title">
      @if (tenant(); as t) {
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="td-title">{{ 'AbpAdmin::Tenants:Database' | abpLocalization }} <small>{{ t.name }}</small></h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            @if (current.isLoading()) {
              <div class="skeleton rows"><i></i></div>
            } @else if (current.error()) {
              <div class="state err">{{ 'AbpAdmin::Tenants:Db:LoadError' | abpLocalization }} <button type="button" class="btn" (click)="current.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
            } @else {
              <abp-database-choice [(own)]="own" />
              @if (own()) {
                <abp-connection-string-field [value]="current.value()?.connectionString ?? ''" />
                <details class="admin" [open]="!t.hasOwnDatabase">
                  <summary>{{ 'AbpAdmin::Tenants:Db:AdminSummary' | abpLocalization }}</summary>
                  <p class="muted">{{ 'AbpAdmin::Tenants:Db:AdminNote' | abpLocalization: 'admin@abp.io': '1q2w3E*' }}</p>
                  <label class="field"><span>{{ 'AbpAdmin::Tenants:Form:AdminEmail' | abpLocalization }}</span>
                    <input class="input" name="adminEmailAddress" type="email" maxlength="256" autocomplete="off" /></label>
                  <label class="field"><span>{{ 'AbpAdmin::Tenants:Form:AdminPassword' | abpLocalization }}</span>
                    <input class="input" name="adminPassword" type="password" maxlength="128" autocomplete="new-password" /></label>
                </details>
              }
              <p class="alert tone-warn">{{ (own() ? 'AbpAdmin::Tenants:Db:WarnOwn' : 'AbpAdmin::Tenants:Db:WarnShared') | abpLocalization }}</p>
            }
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="saving() || current.isLoading()">{{ (saving() ? 'AbpAdmin::Tenants:Db:SettingUp' : 'AbpAdmin::Common:Save') | abpLocalization }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    .sh-foot .alert { flex: 1; }
    .admin { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .admin[open] { display: grid; gap: 12px; padding-bottom: 14px; }
    .admin summary { cursor: pointer; font-size: 13px; font-weight: 600; }
    .admin p { font-size: 12.5px; margin: 0; }
  `,
})
export class TenantDatabaseComponent {
  private readonly service = inject(TenantService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  readonly tenant = input<TenantDto | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly current = rxResource({
    params: () => this.tenant()?.id,
    stream: ({ params: id }) => this.service.getConnectionString(id),
  });
  protected readonly own = linkedSignal(() => !!this.tenant()?.hasOwnDatabase);
  protected readonly error = linkedSignal<TenantDto | null, string | null>({ source: this.tenant, computation: () => null });
  protected readonly saving = signal(false);

  protected save(form: HTMLFormElement) {
    const t = this.tenant()!;
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? '').trim() || null;
    this.saving.set(true);
    this.error.set(null);
    this.service.updateConnectionString(t.id!, {
      connectionString: this.own() ? text('connectionString') : null,
      adminEmailAddress: this.own() ? text('adminEmailAddress') : null,
      adminPassword: this.own() ? (String(fd.get('adminPassword') ?? '') || null) : null,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toaster.ok(this.l.instant(this.own() ? 'AbpAdmin::Tenants:Db:UsesOwn' : 'AbpAdmin::Tenants:Db:UsesShared', t.name!));
        this.saved.emit();
      },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}

/** Tenants: create, rename, enable/disable and delete tenants, and switch multi-tenancy itself on or off. */
@Component({
  selector: 'abp-tenants-page',
  imports: [TenantFormComponent, TenantDatabaseComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::Tenants:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::Tenants:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpAdmin.Tenants.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ 'AbpAdmin::Tenants:New' | abpLocalization }}
          </button>
        }
      </header>

      <section class="card mt" [class.off]="!enabled()">
        <label class="check">
          <input type="checkbox" class="switch" role="switch" [checked]="enabled()"
                 [disabled]="!can('AbpAdmin.Tenants.ManageMultiTenancy') || mode.isLoading() || switching()"
                 (change)="setMultiTenancy($any($event.target))" />
          <span><b>{{ (enabled() ? 'AbpAdmin::Tenants:MultiOn' : 'AbpAdmin::Tenants:MultiOff') | abpLocalization }}</b>
            <small>{{ (enabled() ? 'AbpAdmin::Tenants:MultiOnHint' : 'AbpAdmin::Tenants:MultiOffHint') | abpLocalization }}</small></span>
        </label>
      </section>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="{{ 'AbpAdmin::Tenants:SearchPlaceholder' | abpLocalization }}" [attr.aria-label]="'AbpAdmin::Tenants:Search' | abpLocalization"
                   (change)="filter.set($any($event.target).value.trim())" (search)="filter.set($any($event.target).value.trim())" />
          </label>
        </div>
        @if (list.error()) {
          <div class="state err">{{ 'AbpAdmin::Tenants:LoadError' | abpLocalization }} <button class="btn" (click)="list.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty"><b>{{ 'AbpAdmin::Tenants:Empty' | abpLocalization }}</b><span class="muted">{{ filter() ? ('AbpAdmin::Tenants:NoMatch' | abpLocalization: filter()) : ('AbpAdmin::Tenants:CreateFirst' | abpLocalization) }}</span></div>
        } @else {
          <table class="table">
            <thead><tr><th>{{ 'AbpAdmin::Tenants:Tenant' | abpLocalization }}</th><th>{{ 'AbpAdmin::Common:Status' | abpLocalization }}</th><th>{{ 'AbpAdmin::Tenants:Database' | abpLocalization }}</th><th class="hide-sm">{{ 'AbpAdmin::Common:Created' | abpLocalization }}</th><th><span class="sr-only">{{ 'AbpAdmin::Common:Actions' | abpLocalization }}</span></th></tr></thead>
            <tbody>
              @for (t of rows(); track t.id) {
                <tr [class.inactive]="!t.isActive">
                  <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">{{ (t.name || '?')[0].toUpperCase() }}</span>
                    <b>{{ t.name }}</b></span></td>
                  <td>
                    <label class="status">
                      <input type="checkbox" class="switch" role="switch" [checked]="t.isActive"
                             [disabled]="!can('AbpAdmin.Tenants.Update') || busy() === t.id"
                             [attr.aria-label]="(t.isActive ? 'AbpAdmin::Tenants:DisableAria' : 'AbpAdmin::Tenants:EnableAria') | abpLocalization: t.name!"
                             (change)="setActive(t, $any($event.target))" />
                      <span [class]="'pill ' + (t.isActive ? 'tone-ok' : 'tone-warn')">{{ (t.isActive ? 'AbpAdmin::Common:Active' : 'AbpAdmin::Common:Disabled') | abpLocalization }}</span>
                    </label>
                  </td>
                  <td><span [class]="'pill ' + (t.hasOwnDatabase ? 'tone-accent' : '')">{{ (t.hasOwnDatabase ? 'AbpAdmin::Tenants:Own' : 'AbpAdmin::Tenants:Shared') | abpLocalization }}</span></td>
                  <td class="hide-sm muted">{{ relative(t.creationTime) }}</td>
                  <td class="actions">
                    @if (confirming() === t.id) {
                      <span class="confirm">{{ 'AbpAdmin::Tenants:DeleteConfirm' | abpLocalization: t.name! }}
                        <button class="btn sm danger" (click)="remove(t)">{{ 'AbpAdmin::Common:Delete' | abpLocalization }}</button>
                        <button class="btn sm" (click)="confirming.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button></span>
                    } @else {
                      @if (can('AbpAdmin.Tenants.ManageConnectionStrings')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Tenants:Database' | abpLocalization" [attr.aria-label]="'AbpAdmin::Tenants:DatabaseAria' | abpLocalization: t.name!" (click)="database.set(t)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></svg></button>
                      }
                      @if (can('AbpAdmin.Tenants.Update')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Tenants:Rename' | abpLocalization" [attr.aria-label]="'AbpAdmin::Tenants:RenameAria' | abpLocalization: t.name!" (click)="editing.set(t)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpAdmin.Tenants.Delete')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Delete' | abpLocalization" [attr.aria-label]="'AbpAdmin::Tenants:DeleteAria' | abpLocalization: t.name!" (click)="confirming.set(t.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <footer class="pager"><span class="muted">{{ (total() === 1 ? 'AbpAdmin::Tenants:CountOne' : 'AbpAdmin::Tenants:CountMany') | abpLocalization: total().toString() }}</span></footer>
        }
      </section>
    </div>

    <abp-tenant-form [tenant]="editing()" (closed)="editing.set(null)" (saved)="editing.set(null); list.reload()" />
    <abp-tenant-database [tenant]="database()" (closed)="database.set(null)" (saved)="database.set(null); list.reload()" />
  `,
  styles: `
    .avatar.sq { border-radius: 9px; }
    .mt { padding: 14px 18px; margin-bottom: 16px; }
    .mt b { font-weight: 600; }
    .status { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
    tr.inactive .who-cell { opacity: 0.6; }
  `,
})
export class TenantsPage {
  private readonly service = inject(TenantService);
  private readonly permissions = inject(PermissionService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);

  readonly new = input<string>();
  protected readonly relative = relative;
  protected readonly filter = signal('');
  protected readonly editing = signal<TenantEdit | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly database = signal<TenantDto | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly switching = signal(false);

  protected readonly mode = rxResource({ stream: () => this.service.getMultiTenancy() });
  protected readonly enabled = linkedSignal(() => !!this.mode.value()?.isEnabled);

  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, maxResultCount: 200 }),
    stream: ({ params }) => this.service.getList(params),
  });
  protected readonly rows = computed<TenantDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);

  constructor() {
    effect(() => { if (this.new() === '1' && this.can('AbpAdmin.Tenants.Create')) this.editing.set('new'); });
  }

  protected can(policy: string) {
    return this.permissions.getGrantedPolicy(policy);
  }

  protected setMultiTenancy(box: HTMLInputElement) {
    const isEnabled = box.checked;
    this.switching.set(true);
    this.service.updateMultiTenancy({ isEnabled }).subscribe({
      next: () => { this.switching.set(false); this.enabled.set(isEnabled); this.toaster.ok(this.l.instant(isEnabled ? 'AbpAdmin::Tenants:MultiOnToast' : 'AbpAdmin::Tenants:MultiOffToast')); },
      error: e => { this.switching.set(false); box.checked = !isEnabled; this.toaster.error(apiError(e)); },
    });
  }

  protected setActive(t: TenantDto, box: HTMLInputElement) {
    const active = box.checked;
    this.busy.set(t.id!);
    (active ? this.service.activate(t.id!) : this.service.deactivate(t.id!)).subscribe({
      next: () => {
        this.busy.set(null);
        this.toaster.ok(this.l.instant(active ? 'AbpAdmin::Tenants:Enabled' : 'AbpAdmin::Tenants:Disabled', t.name!));
        this.list.reload();
      },
      error: e => { this.busy.set(null); box.checked = !active; this.toaster.error(apiError(e)); },
    });
  }

  protected remove(t: TenantDto) {
    this.service.delete(t.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('AbpAdmin::Tenants:Deleted', t.name!)); this.list.reload(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
