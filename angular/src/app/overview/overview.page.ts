import { ConfigStateService, LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { DashboardService } from '../proxy/services/dashboard';
import { CacheService } from '../proxy/services/caching';
import { Toaster } from '../shared/toast';
import { apiError } from '../shared/api-error';
import { SecurityLogService } from '../proxy/services/security-logs';
import { duration, relative } from '../audit-logs/format';
import { NAV } from '../shared/nav';
import { describeAction } from '../security-logs/actions';

interface Alert { tone: 'err' | 'warn'; text: string; link: string; query?: Record<string, string> }

@Component({
  selector: 'app-overview-page',
  imports: [RouterLink, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ greeting() }}</h1>
          <p class="muted">{{ '::Overview:Subtitle' | abpLocalization }}</p>
        </div>
        <div class="top-actions">
          @if (can('AbpAdmin.Cache')) {
            <button class="btn" (click)="clearCaches()" [disabled]="clearing()" [title]="'::Cache:ClearAllHint' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H9l-5-5 10-10 7 7-8 8M9 9l7 7" /></svg> {{ '::Cache:ClearAll' | abpLocalization }}</button>
          }
          <button class="icon-btn" (click)="data.reload(); recent.reload()" [attr.aria-label]="'::Common:Refresh' | abpLocalization" [title]="'::Common:Refresh' | abpLocalization" [class.spin]="data.isLoading()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>
          </button>
        </div>
      </header>

      @if (data.error()) {
        <div class="card state err">{{ '::Overview:LoadFailed' | abpLocalization }} <button class="btn" (click)="data.reload()">{{ '::Common:Retry' | abpLocalization }}</button></div>
      } @else if (data.value(); as d) {
        @if (alerts().length) {
          <section class="alerts" [attr.aria-label]="'::Overview:NeedsAttention' | abpLocalization">
            @for (a of alerts(); track a.text) {
              <a [class]="'alert-row tone-' + a.tone" [routerLink]="a.link" [queryParams]="a.query">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                <span>{{ a.text }}</span><b>{{ '::Overview:Review' | abpLocalization }}</b>
              </a>
            }
          </section>
        } @else {
          <div class="calm card"><span class="dot" aria-hidden="true"></span> {{ '::Overview:AllClear' | abpLocalization }}</div>
        }

        <section class="kpis">
          @if (d.users; as u) {
            <a class="kpi card" routerLink="/users">
              <span class="label">{{ '::Overview:Kpi:Users' | abpLocalization }}</span>
              <strong>{{ u.total }}</strong>
              <span class="sub"><b class="ok">{{ '::Overview:Kpi:NewThisWeek' | abpLocalization: u.newLast7Days + '' }}</b> · {{ '::Overview:Kpi:Inactive' | abpLocalization: u.inactive + '' }} · {{ '::Overview:Kpi:Locked' | abpLocalization: u.locked + '' }}</span>
            </a>
          }
          @if (d.signIns; as s) {
            <a class="kpi card" routerLink="/security-logs">
              <span class="label">{{ '::Overview:Kpi:SignIns' | abpLocalization }}</span>
              <strong>{{ s.succeeded }}</strong>
              <span class="sub"><b [class.err]="s.failed">{{ '::Overview:Kpi:Failed' | abpLocalization: s.failed + '' }}</b> · {{ '::Overview:Kpi:Lockouts' | abpLocalization: s.lockouts + '' }}</span>
            </a>
          }
          @if (d.requests; as r) {
            <a class="kpi card" routerLink="/audit-logs">
              <span class="label">{{ '::Overview:Kpi:Requests' | abpLocalization }}</span>
              <strong>{{ r.last24Hours }}</strong>
              <span class="sub"><b [class.err]="r.failed">{{ '::Overview:Kpi:Failed' | abpLocalization: r.failed + '' }}</b> · {{ '::Overview:Kpi:Avg' | abpLocalization: duration(r.averageMs ?? 0) }}</span>
            </a>
          }
          @if (d.jobs; as j) {
            <a class="kpi card" routerLink="/background-jobs">
              <span class="label">{{ '::Overview:Kpi:BackgroundJobs' | abpLocalization }}</span>
              <strong>{{ j.waiting }}</strong>
              <span class="sub">{{ '::Overview:Kpi:Queued' | abpLocalization }} · <b [class.err]="j.abandoned">{{ '::Overview:Kpi:Abandoned' | abpLocalization: j.abandoned + '' }}</b></span>
            </a>
          }
          @if (d.roles != null) {
            <a class="kpi card" routerLink="/roles"><span class="label">{{ '::Overview:Kpi:Roles' | abpLocalization }}</span><strong>{{ d.roles }}</strong><span class="sub">{{ '::Overview:Kpi:RolesSub' | abpLocalization }}</span></a>
          }
          @if (d.applications != null) {
            <a class="kpi card" routerLink="/applications"><span class="label">{{ '::Overview:Kpi:Clients' | abpLocalization }}</span><strong>{{ d.applications }}</strong><span class="sub">{{ '::Overview:Kpi:ClientsSub' | abpLocalization }}</span></a>
          }
        </section>

        <div class="cols">
          @if (canSecurity) {
            <section class="card feed" aria-labelledby="rs-h">
              <header><h2 id="rs-h">{{ '::Overview:RecentEvents' | abpLocalization }}</h2><a routerLink="/security-logs">{{ '::Common:ViewAll' | abpLocalization }}</a></header>
              <ul>
                @for (e of recentItems(); track e.id) {
                  @let a = describe(e.action);
                  <li>
                    <span [class]="'ico tone-' + a.tone" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="a.icon" /></svg></span>
                    <span class="what"><b>{{ actionLabel(e.action) }}</b><small>{{ e.userName || ('::Overview:UnknownUser' | abpLocalization) }} · {{ e.clientId || e.identity }} · {{ e.clientIpAddress }}</small></span>
                    <time class="muted">{{ relative(e.creationTime) }}</time>
                  </li>
                } @empty { <li class="muted none">{{ '::Overview:NoEvents' | abpLocalization }}</li> }
              </ul>
            </section>
          }
          <section class="card feed" aria-labelledby="go-h">
            <header><h2 id="go-h">{{ '::Overview:JumpTo' | abpLocalization }}</h2><span class="muted small">{{ '::Overview:OrPress' | abpLocalization }} <kbd>Ctrl K</kbd></span></header>
            <div class="links">
              @for (n of links(); track n.path) {
                <a [routerLink]="n.path">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="n.icon" /></svg>
                  <span>{{ n.labelKey | abpLocalization }}</span>
                </a>
              }
            </div>
          </section>
        </div>
      } @else {
        <div class="skeleton kpis">@for (i of [1, 2, 3, 4]; track i) { <i></i> }</div>
      }
    </div>
  `,
  styles: `
    .alerts { display: grid; gap: 8px; }
    .alert-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; text-decoration: none;
      background: var(--tone-soft); color: var(--tone); border: 1px solid color-mix(in srgb, var(--tone) 25%, transparent); }
    .alert-row span { flex: 1; color: var(--text); font-weight: 500; }
    .alert-row svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .alert-row b { font-size: 13px; }
    .calm { display: flex; align-items: center; gap: 10px; padding: 12px 16px; color: var(--muted); }
    .calm .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 4px var(--ok-soft); }
    .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .kpi { display: grid; gap: 2px; padding: 16px 18px; color: var(--text); text-decoration: none; transition: border-color 0.15s, transform 0.15s; }
    .kpi:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); transform: translateY(-1px); }
    .label { color: var(--muted); font-size: 12.5px; font-weight: 550; }
    .kpi strong { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .sub { color: var(--muted); font-size: 12.5px; }
    .sub b { font-weight: 600; color: var(--text); }
    .sub b.ok { color: var(--ok); }
    .sub b.err { color: var(--err); }
    .cols { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    @media (max-width: 960px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    .feed header { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 18px 8px; }
    .feed h2 { font-size: 15px; font-weight: 650; }
    .feed header a { font-size: 13px; text-decoration: none; }
    .small { font-size: 12.5px; }
    ul { list-style: none; margin: 0; padding: 0 8px 8px; }
    li { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 10px; }
    li:hover { background: var(--surface-2); }
    .ico { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 9px; background: var(--tone-soft); color: var(--tone); }
    .ico svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .what { flex: 1; display: grid; min-width: 0; }
    .what small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    time { font-size: 12.5px; white-space: nowrap; }
    .none { justify-content: center; padding: 24px; }
    .links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 4px 12px 14px; }
    .links a { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; color: var(--text); text-decoration: none; font-weight: 500; font-size: 13.5px; }
    .links a:hover { border-color: var(--accent); color: var(--accent); }
    .links svg { width: 17px; height: 17px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    kbd { padding: 1px 5px; border: 1px solid var(--border); border-radius: 5px; font: 11px var(--mono); }
    .skeleton.kpis i { height: 110px; }
  `,
})
export class OverviewPage {
  private readonly cache = inject(CacheService);
  private readonly toaster = inject(Toaster);
  protected readonly clearing = signal(false);
  protected readonly can = (policy: string) => this.permissions.getGrantedPolicy(policy);
  private readonly permissions = inject(PermissionService);
  private readonly config = toSignal(inject(ConfigStateService).getAll$());
  private readonly security = inject(SecurityLogService);
  private readonly dashboard = inject(DashboardService);

  protected readonly duration = duration;
  protected readonly relative = relative;
  private readonly l = inject(LocalizationService);
  protected readonly describe = describeAction;
  protected readonly canSecurity = this.permissions.getGrantedPolicy('AbpAdmin.SecurityLogs');

  protected readonly data = rxResource({ stream: () => this.dashboard.get() });
  protected readonly recent = rxResource({
    stream: () => this.canSecurity ? this.security.getList({ maxResultCount: 7 }) : of({ items: [], totalCount: 0 }),
    defaultValue: { items: [], totalCount: 0 },
  });
  // rxResource's value is the paged result; the template wants the items.
  protected readonly recentItems = computed(() => this.recent.value().items ?? []);

  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    const name = this.config()?.currentUser?.name || this.config()?.currentUser?.userName || '';
    const part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
    return this.l.instant(`::Overview:Greeting${part}${name ? '' : 'Anon'}`, name);
  });

  protected actionLabel(action?: string | null) {
    const a = describeAction(action);
    return a.labelKey ? this.l.instant(a.labelKey) : a.label;
  }

  protected readonly links = computed(() =>
    NAV.filter(n => n.path !== '/overview' && (!n.policy || this.permissions.getGrantedPolicy(n.policy))));

  protected readonly alerts = computed<Alert[]>(() => {
    const d = this.data.value();
    if (!d) return [];
    const list: Alert[] = [];
    const n = (count: number | undefined, one: string, many: string) => this.l.instant(count === 1 ? one : many, String(count));
    if (d.users?.locked) list.push({ tone: 'warn', text: n(d.users.locked, '::Overview:Alert:UsersLockedOne', '::Overview:Alert:UsersLockedMany'), link: '/users' });
    if (d.signIns?.failed) list.push({ tone: 'err', text: n(d.signIns.failed, '::Overview:Alert:FailedSignInsOne', '::Overview:Alert:FailedSignInsMany'), link: '/security-logs', query: { failed: '1' } });
    if (d.requests?.failed) list.push({ tone: 'err', text: n(d.requests.failed, '::Overview:Alert:RequestsFailedOne', '::Overview:Alert:RequestsFailedMany'), link: '/audit-logs' });
    if (d.jobs?.abandoned) list.push({ tone: 'warn', text: n(d.jobs.abandoned, '::Overview:Alert:JobsAbandonedOne', '::Overview:Alert:JobsAbandonedMany'), link: '/background-jobs', query: { state: 'abandoned' } });
    return list;
  });

  /** Every cached permission, setting and feature value (from the host: in every tenant too). */
  protected clearCaches() {
    this.clearing.set(true);
    this.cache.clearAll().subscribe({
      next: r => { this.clearing.set(false); this.toaster.ok(this.l.instant('::Cache:ClearedAll', `${r.users}`, `${r.roles}`, `${r.tenants}`)); },
      error: e => { this.clearing.set(false); this.toaster.error(apiError(e)); },
    });
  }
}

