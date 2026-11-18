import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { TenantAdminService, TenantDto, TenantInvitationDto, TenantService, FeaturesPage, relative, SheetDirective, apiError, Toaster, AbpAdminRegistry , PagerComponent, keepPageInRange, savedPageSize } from '@nazem0/abp-admin-ng-core';

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

/** A tenant's administrators: set a user's password, or invite a new administrator by email. */
@Component({
  selector: 'abp-tenant-admin',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!tenant()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="ta-title">
      @if (tenant(); as t) {
        <header class="sh-head">
          <h2 id="ta-title">{{ 'AbpAdmin::Tenants:Admins' | abpLocalization }} <small>{{ t.name }}</small></h2>
          <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </header>
        <div class="sh-body form">
          <form #pw class="block" (submit)="$event.preventDefault(); setPassword(t, pw)">
            <h3>{{ 'AbpAdmin::Tenants:SetPassword' | abpLocalization }}</h3>
            <label class="field"><span>{{ 'AbpAdmin::Tenants:UserName' | abpLocalization }}</span>
              <input class="input" name="userName" required maxlength="256" value="admin" autocomplete="off" /></label>
            <label class="field"><span>{{ 'AbpAdmin::Users:Form:Password' | abpLocalization }} <i>*</i></span>
              <input class="input" name="password" type="password" required maxlength="128" autocomplete="new-password" /></label>
            <button class="btn" [disabled]="busy()">{{ 'AbpAdmin::Tenants:SetPassword' | abpLocalization }}</button>
          </form>

          <form #inv class="block" (submit)="$event.preventDefault(); invite(t, inv)">
            <h3>{{ 'AbpAdmin::Tenants:Invite' | abpLocalization }}</h3>
            <p class="muted">{{ 'AbpAdmin::Tenants:InviteIntro' | abpLocalization }}</p>
            <label class="field"><span>{{ 'AbpAdmin::Users:Email' | abpLocalization }} <i>*</i></span>
              <input class="input" name="email" type="email" required maxlength="256" autocomplete="off" placeholder="owner@example.com" /></label>
            <button class="btn" [disabled]="busy()">{{ 'AbpAdmin::Tenants:InviteSend' | abpLocalization }}</button>
            @if (invitation(); as i) {
              <div class="alert" [class.tone-ok]="i.emailSent" [class.tone-warn]="!i.emailSent" role="status">
                {{ (i.emailSent ? 'AbpAdmin::Tenants:InviteSent' : 'AbpAdmin::Tenants:InviteNotSent') | abpLocalization: (i.userName ?? '') }}
                <span class="link"><input class="input mono" readonly [value]="i.link" (focus)="$any($event.target).select()" />
                  <button type="button" class="btn sm" (click)="copy(i.link!)">{{ 'AbpAdmin::Common:Copy' | abpLocalization }}</button></span>
                <small class="muted">{{ 'AbpAdmin::Tenants:InviteExpires' | abpLocalization: expiry(i.expiresAt) }}</small>
              </div>
            }
          </form>
          @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
        </div>
      }
    </dialog>
  `,
  styles: `
    .block { display: grid; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    .block:last-of-type { border-bottom: 0; }
    .block .btn { justify-self: start; }
    h3 { font-size: 14px; font-weight: 650; }
    .link { display: flex; gap: 6px; margin: 8px 0 4px; }
    .alert { display: grid; }
  `,
})
export class TenantAdminComponent {
  private readonly service = inject(TenantAdminService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  readonly tenant = input<TenantDto | null>(null);
  readonly closed = output<void>();
  protected readonly busy = signal(false);
  protected readonly error = linkedSignal<TenantDto | null, string | null>({ source: this.tenant, computation: () => null });
  protected readonly invitation = linkedSignal<TenantDto | null, TenantInvitationDto | null>({ source: this.tenant, computation: () => null });

  protected setPassword(t: TenantDto, form: HTMLFormElement) {
    const fd = new FormData(form);
    const userName = String(fd.get('userName') ?? '').trim();
    this.run(this.service.setPassword(t.id!, { userName, password: String(fd.get('password') ?? '') }), () => {
      form.reset();
      this.toaster.ok(this.l.instant('AbpAdmin::Tenants:PasswordSet', userName, t.name!));
    });
  }

  protected invite(t: TenantDto, form: HTMLFormElement) {
    this.run(this.service.inviteAdmin(t.id!, { email: String(new FormData(form).get('email') ?? '').trim() }), i => this.invitation.set(i));
  }

  protected expiry(iso?: string) {
    return iso ? new Date(iso).toLocaleString(document.documentElement.lang || undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
  }

  protected copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => this.toaster.ok(this.l.instant('AbpAdmin::Common:Copied')));
  }

  private run<T>(req: Observable<T>, done: (value: T) => void) {
    this.busy.set(true);
    this.error.set(null);
    req.subscribe({
      next: v => { this.busy.set(false); done(v); },
      error: e => { this.busy.set(false); this.error.set(apiError(e)); },
    });
  }
}

/** Tenants: create, rename, enable/disable and delete tenants, and switch multi-tenancy itself on or off. */
@Component({
  selector: 'abp-tenants-page',
  imports: [PagerComponent, RouterLink, TenantFormComponent, TenantDatabaseComponent, TenantAdminComponent, FeaturesPage, SheetDirective, LocalizationPipe],
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
                      @if (can('AbpAdmin.Tenants.ManageFeatures')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Tenants:Features' | abpLocalization" [attr.aria-label]="'AbpAdmin::Tenants:FeaturesOf' | abpLocalization: t.name!" (click)="features.set(t)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4" /></svg></button>
                      }
                      @if (can('AbpAdmin.Tenants.ManageUsers')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Tenants:Admins' | abpLocalization" [attr.aria-label]="'AbpAdmin::Tenants:AdminsOf' | abpLocalization: t.name!" (click)="admins.set(t)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 8h5M19.5 5.5v5" /></svg></button>
                      }
                      @if (historyPage && can('AbpAdmin.AuditLogs')) {
                        <a class="icon-btn" [title]="'AbpAdmin::Common:ChangeHistory' | abpLocalization" [attr.aria-label]="'AbpAdmin::Common:ChangeHistoryOf' | abpLocalization: t.name!"
                           [routerLink]="historyPage" [queryParams]="{ type: 'Volo.Abp.TenantManagement.Tenant', id: t.id }">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg></a>
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
          <abp-pager [total]="total()" [(page)]="page" [(size)]="size" />
        }
      </section>
    </div>

    <abp-tenant-form [tenant]="editing()" (closed)="editing.set(null)" (saved)="editing.set(null); list.reload()" />
    <abp-tenant-database [tenant]="database()" (closed)="database.set(null)" (saved)="database.set(null); list.reload()" />
    <abp-tenant-admin [tenant]="admins()" (closed)="admins.set(null)" />
    <dialog [appSheet]="!!features()" (dismiss)="features.set(null)" aria-labelledby="tf-title">
      @if (features(); as f) {
        <header class="sh-head">
          <h2 id="tf-title">{{ 'AbpAdmin::Tenants:Features' | abpLocalization }} <small>{{ f.name }}</small></h2>
          <button type="button" class="icon-btn" (click)="features.set(null)" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </header>
        <div class="sh-body"><abp-features-page [providerKey]="f.id!" /></div>
      }
    </dialog>
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
  protected readonly page = linkedSignal({ source: this.filter, computation: () => 0 });
  protected readonly size = signal(savedPageSize());
  protected readonly editing = signal<TenantEdit | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly database = signal<TenantDto | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly switching = signal(false);
  protected readonly features = signal<TenantDto | null>(null);
  protected readonly admins = signal<TenantDto | null>(null);
  /** Entity changes page (audit-logging package), when installed. */
  protected readonly historyPage = inject(AbpAdminRegistry).link('entity-changes');

  protected readonly mode = rxResource({ stream: () => this.service.getMultiTenancy() });
  protected readonly enabled = linkedSignal(() => !!this.mode.value()?.isEnabled);

  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, skipCount: this.page() * this.size(), maxResultCount: this.size() }),
    stream: ({ params }) => this.service.getList(params),
  });
  protected readonly rows = computed<TenantDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  private readonly pageInRange = keepPageInRange(this.page, this.size, this.total);

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
