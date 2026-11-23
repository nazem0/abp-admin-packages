import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { GetSecurityLogListInput, SecurityLogDto, SecurityLogService, RANGES, RangeKey, browserName, rangeWindow, relative, stamp, describeAction, isFailure, AbpAdminRegistry , PagerComponent, keepPageInRange, savedPageSize, ExportButtonComponent } from '@nazem0/abp-admin-ng-core';


/** Identity security log: every sign-in, failure, lockout, sign-out and credential change. */
@Component({
  selector: 'abp-security-logs-page',
  imports: [ExportButtonComponent, PagerComponent, RouterLink, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::SecurityLogs:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::SecurityLogs:Subtitle' | abpLocalization }}</p>
        </div>
        <div class="top-actions">
          <div class="seg" role="radiogroup" [attr.aria-label]="'AbpAdmin::SecurityLogs:TimeRange' | abpLocalization">
            @for (r of ranges; track r.key) {
              <button role="radio" [attr.aria-checked]="range() === r.key" (click)="range.set(r.key); page.set(0)">{{ r.labelKey | abpLocalization }}</button>
            }
          </div>
          <app-export-button [source]="exportCsv" fileName="security-logs.csv" />
          <button class="icon-btn" (click)="refresh()" [attr.aria-label]="'AbpAdmin::Common:Refresh' | abpLocalization" [title]="'AbpAdmin::Common:Refresh' | abpLocalization" [class.spin]="list.isLoading()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>
          </button>
        </div>
      </header>

      <div class="tiles">
        <button class="tile card" [attr.aria-pressed]="!action() && !failedOnly()" (click)="pick(null, false)">
          <span class="muted">{{ 'AbpAdmin::SecurityLogs:AllEvents' | abpLocalization }}</span><strong>{{ totals().all }}</strong>
        </button>
        <button class="tile card tone-ok" [attr.aria-pressed]="action() === 'LoginSucceeded'" (click)="pick('LoginSucceeded', false)">
          <span class="muted">{{ 'AbpAdmin::SecurityLogs:SuccessfulSignIns' | abpLocalization }}</span><strong>{{ totals().ok }}</strong>
        </button>
        <button class="tile card tone-err" [attr.aria-pressed]="failedOnly()" (click)="pick(null, true)">
          <span class="muted">{{ 'AbpAdmin::SecurityLogs:FailedSignIns' | abpLocalization }}</span><strong>{{ totals().failed }}</strong>
        </button>
        <button class="tile card tone-warn" [attr.aria-pressed]="action() === 'LoginLockedout'" (click)="pick('LoginLockedout', false)">
          <span class="muted">{{ 'AbpAdmin::SecurityLogs:Lockouts' | abpLocalization }}</span><strong>{{ totals().lockouts }}</strong>
        </button>
      </div>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" [placeholder]="'AbpAdmin::SecurityLogs:UserNamePlaceholder' | abpLocalization" [attr.aria-label]="'AbpAdmin::SecurityLogs:FilterByUserName' | abpLocalization" [value]="userName()"
                   (change)="userName.set($any($event.target).value.trim()); page.set(0)" (search)="userName.set($any($event.target).value.trim()); page.set(0)" />
          </label>
          <input class="input ip" [placeholder]="'AbpAdmin::SecurityLogs:IpAddress' | abpLocalization" [attr.aria-label]="'AbpAdmin::SecurityLogs:FilterByIp' | abpLocalization" [value]="ip()"
                 (change)="ip.set($any($event.target).value.trim()); page.set(0)" />
          <select class="input" [attr.aria-label]="'AbpAdmin::SecurityLogs:FilterByAction' | abpLocalization" (change)="pick($any($event.target).value || null, false)">
            <option value="" [selected]="!action()">{{ 'AbpAdmin::SecurityLogs:AnyAction' | abpLocalization }}</option>
            @for (c of counts.value(); track c.action) {
              <option [value]="c.action" [selected]="action() === c.action">{{ actionLabel(c.action) }} ({{ c.count }})</option>
            }
          </select>
          @if (filtered()) { <button class="link" (click)="clear()">{{ 'AbpAdmin::SecurityLogs:ClearFilters' | abpLocalization }}</button> }
        </div>

        @if (list.error()) {
          <div class="state err">{{ 'AbpAdmin::SecurityLogs:LoadFailed' | abpLocalization }} <button class="btn" (click)="refresh()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" /></svg>
            <b>{{ 'AbpAdmin::SecurityLogs:NoEvents' | abpLocalization }}</b><span class="muted">{{ 'AbpAdmin::SecurityLogs:NoEventsHint' | abpLocalization }}</span>
          </div>
        } @else {
          <ul class="events" [class.loading]="list.isLoading()">
            @for (e of rows(); track e.id) {
              @let a = describe(e.action);
              <li [class.open]="openId() === e.id">
                <button class="ev" (click)="openId.set(openId() === e.id ? null : e.id!)" [attr.aria-expanded]="openId() === e.id">
                  <span [class]="'ico tone-' + a.tone" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="a.icon" /></svg></span>
                  <span class="what"><b>{{ actionLabel(e.action) }}</b><small>{{ e.userName || ('AbpAdmin::SecurityLogs:UnknownUser' | abpLocalization) }}</small></span>
                  <span class="client hide-sm"><span class="mono">{{ e.clientId || '—' }}</span><small>{{ e.identity }}</small></span>
                  <span class="net hide-sm"><span class="mono">{{ e.clientIpAddress || '—' }}</span><small>{{ browser(e.browserInfo) }}</small></span>
                  <time [title]="stamp(e.creationTime, full)">{{ relative(e.creationTime) }}</time>
                </button>
                @if (openId() === e.id) {
                  <dl class="details">
                    <dt>{{ 'AbpAdmin::SecurityLogs:Detail:When' | abpLocalization }}</dt><dd>{{ stamp(e.creationTime, full) }}</dd>
                    <dt>{{ 'AbpAdmin::SecurityLogs:Detail:User' | abpLocalization }}</dt><dd>{{ e.userName || '—' }} @if (e.userName) { <button class="link" (click)="userName.set(e.userName!); page.set(0)">{{ 'AbpAdmin::SecurityLogs:OnlyThisUser' | abpLocalization }}</button> }</dd>
                    <dt>{{ 'AbpAdmin::SecurityLogs:Detail:Client' | abpLocalization }}</dt><dd class="mono">{{ e.clientId || '—' }}</dd>
                    <dt>{{ 'AbpAdmin::SecurityLogs:IpAddress' | abpLocalization }}</dt><dd class="mono">{{ e.clientIpAddress || '—' }} @if (e.clientIpAddress) { <button class="link" (click)="ip.set(e.clientIpAddress!); page.set(0)">{{ 'AbpAdmin::SecurityLogs:OnlyThisIp' | abpLocalization }}</button> }</dd>
                    <dt>{{ 'AbpAdmin::SecurityLogs:Detail:Application' | abpLocalization }}</dt><dd>{{ e.applicationName || '—' }} · {{ e.identity }}</dd>
                    <dt>{{ 'AbpAdmin::SecurityLogs:Detail:Correlation' | abpLocalization }}</dt><dd class="mono">{{ e.correlationId || '—' }}
                      @if (e.correlationId && canAudit) { <a class="link" routerLink="../audit-logs" [queryParams]="{ correlation: e.correlationId }">{{ 'AbpAdmin::SecurityLogs:OpenTrace' | abpLocalization }}</a> }</dd>
                    <dt>{{ 'AbpAdmin::SecurityLogs:Detail:Browser' | abpLocalization }}</dt><dd class="mono small">{{ e.browserInfo || '—' }}</dd>
                  </dl>
                }
              </li>
            }
          </ul>
        }

        <abp-pager [total]="total()" [(page)]="page" [(size)]="size" />
      </section>
    </div>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 760px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .tile { display: grid; gap: 2px; padding: 14px 16px; text-align: start; font: inherit; color: var(--text); cursor: pointer; transition: border-color 0.15s; }
    .tile span { font-size: 12.5px; font-weight: 550; }
    .tile strong { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: var(--tone, var(--text)); font-variant-numeric: tabular-nums; }
    .tile:hover { border-color: var(--tone, var(--accent)); }
    .tile[aria-pressed='true'] { border-color: var(--tone, var(--accent)); box-shadow: 0 0 0 3px var(--tone-soft, var(--accent-soft)), var(--shadow); }
    .ip { width: 150px; }
    .events { list-style: none; margin: 0; padding: 6px 8px; transition: opacity 0.15s; }
    .events.loading { opacity: 0.55; }
    .events li { border-radius: 10px; }
    .events li.open { background: var(--surface-2); }
    .ev { width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) 96px; gap: 12px; align-items: center;
      padding: 9px 10px; border: 0; border-radius: 10px; background: none; color: var(--text); font: inherit; text-align: start; cursor: pointer; }
    .ev:hover { background: var(--surface-2); }
    .ico { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--tone-soft); color: var(--tone); }
    .ico svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .what, .client, .net { display: grid; min-width: 0; }
    .what small, .client small, .net small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .client .mono, .net .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    time { color: var(--muted); font-size: 12.5px; text-align: end; white-space: nowrap; }
    .details { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 6px 14px; margin: 0; padding: 4px 16px 14px 56px; font-size: 13px; }
    .details dt { color: var(--muted); }
    .details dd { margin: 0; overflow-wrap: anywhere; }
    .details .link { margin-inline-start: 8px; }
    .small { font-size: 11.5px; }
    @media (max-width: 720px) {
      .ev { grid-template-columns: 34px minmax(0, 1fr) auto; }
      .details { grid-template-columns: 1fr; padding-inline-start: 14px; }
    }
  `,
})
export class SecurityLogsPage {
  private readonly service = inject(SecurityLogService);
  // The request trace lives in the audit-logging package: link only when it's installed.
  protected readonly canAudit = inject(PermissionService).getGrantedPolicy('AbpAdmin.AuditLogs') && inject(AbpAdminRegistry).has('audit-logs');

  // Deep-link query params (?user=…&failed=1&ip=…), bound by the router.
  readonly user = input<string>();
  readonly failed = input<string>();

  protected readonly ranges = RANGES;
  private readonly l = inject(LocalizationService);
  protected readonly describe = describeAction;
  protected readonly browser = browserName;
  protected readonly relative = relative;
  protected readonly stamp = stamp;
  protected readonly full: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'long' };

  protected readonly range = signal<RangeKey>('7d');
  protected readonly userName = linkedSignal(() => this.user() ?? '');
  protected readonly failedOnly = linkedSignal(() => this.failed() === '1');
  protected readonly action = signal<string | null>(null);
  protected readonly ip = signal('');
  protected readonly page = signal(0);
  protected readonly size = signal(savedPageSize());
  protected readonly openId = signal<string | null>(null);
  private readonly tick = signal(0);

  private readonly window = computed(() => { this.tick(); return rangeWindow(this.range()); });

  protected readonly counts = rxResource({
    params: () => this.window(),
    stream: ({ params }) => this.service.getActionCounts(params.startTime, params.endTime),
    defaultValue: [],
  });

  protected readonly totals = computed(() => {
    const c = this.counts.value();
    const sum = (f: (a: string) => boolean) => c.filter(x => f(x.action ?? '')).reduce((n, x) => n + (x.count ?? 0), 0);
    return {
      all: sum(() => true),
      ok: sum(a => a === 'LoginSucceeded'),
      failed: sum(isFailure),
      lockouts: sum(a => a === 'LoginLockedout'),
    };
  });

  private readonly filters = computed((): Omit<GetSecurityLogListInput, 'maxResultCount'> => ({
    ...this.window(),
    actionName: this.action() || undefined,
    failedOnly: this.failedOnly() || undefined,
    userName: this.userName() || undefined,
    clientIpAddress: this.ip() || undefined,
  }));
  /** The list's filters, every page. */
  protected readonly exportCsv = () => this.service.export({ ...this.filters(), maxResultCount: 1 }); // paging is ignored by the export

  protected readonly list = rxResource({
    params: (): GetSecurityLogListInput => ({ ...this.filters(), skipCount: this.page() * this.size(), maxResultCount: this.size() }),
    stream: ({ params }) => this.service.getList(params),
  });

  protected readonly rows = computed<SecurityLogDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  private readonly pageInRange = keepPageInRange(this.page, this.size, this.total);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  protected readonly filtered = computed(() => !!(this.action() || this.failedOnly() || this.userName() || this.ip()));

  protected actionLabel(action?: string | null) {
    const a = describeAction(action);
    return a.labelKey ? this.l.instant(a.labelKey) : a.label;
  }

  protected pick(action: string | null, failedOnly: boolean) {
    this.action.set(action);
    this.failedOnly.set(failedOnly);
    this.page.set(0);
  }

  protected clear() {
    this.pick(null, false);
    this.userName.set('');
    this.ip.set('');
  }

  protected refresh() {
    this.tick.update(t => t + 1);
  }
}
