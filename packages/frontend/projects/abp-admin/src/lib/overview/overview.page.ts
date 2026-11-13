import { ConfigStateService, PermissionService } from '@abp/ng.core';
import { Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { DashboardService } from '../proxy/abp-admin/services/dashboard';
import { SecurityLogService } from '../proxy/abp-admin/services/security-logs';
import { duration, relative } from '../audit-logs/format';
import { NAV } from '../shared/nav';
import { describeAction } from '../security-logs/actions';

interface Alert { tone: 'err' | 'warn'; text: string; link: string; query?: Record<string, string> }

@Component({
  selector: 'abp-overview-page',
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ greeting() }}</h1>
          <p class="muted">What's happening in your ABP application over the last 24 hours.</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn" (click)="data.reload(); recent.reload()" aria-label="Refresh" title="Refresh" [class.spin]="data.isLoading()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>
          </button>
        </div>
      </header>

      @if (data.error()) {
        <div class="card state err">Couldn't load the overview. <button class="btn" (click)="data.reload()">Retry</button></div>
      } @else if (data.value(); as d) {
        @if (alerts().length) {
          <section class="alerts" aria-label="Needs attention">
            @for (a of alerts(); track a.text) {
              <a [class]="'alert-row tone-' + a.tone" [routerLink]="a.link" [queryParams]="a.query">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                <span>{{ a.text }}</span><b>Review →</b>
              </a>
            }
          </section>
        } @else {
          <div class="calm card"><span class="dot" aria-hidden="true"></span> All clear: no lockouts, failed sign-ins, failing requests or stuck jobs.</div>
        }

        <section class="kpis">
          @if (d.users; as u) {
            <a class="kpi card" routerLink="../users">
              <span class="label">Users</span>
              <strong>{{ u.total }}</strong>
              <span class="sub"><b class="ok">+{{ u.newLast7Days }}</b> this week · {{ u.inactive }} inactive · {{ u.locked }} locked</span>
            </a>
          }
          @if (d.signIns; as s) {
            <a class="kpi card" routerLink="../security-logs">
              <span class="label">Sign-ins · 24h</span>
              <strong>{{ s.succeeded }}</strong>
              <span class="sub"><b [class.err]="s.failed">{{ s.failed }} failed</b> · {{ s.lockouts }} lockouts</span>
            </a>
          }
          @if (d.requests; as r) {
            <a class="kpi card" routerLink="../audit-logs">
              <span class="label">Requests · 24h</span>
              <strong>{{ r.last24Hours }}</strong>
              <span class="sub"><b [class.err]="r.failed">{{ r.failed }} failed</b> · {{ duration(r.averageMs ?? 0) }} avg</span>
            </a>
          }
          @if (d.jobs; as j) {
            <a class="kpi card" routerLink="../background-jobs">
              <span class="label">Background jobs</span>
              <strong>{{ j.waiting }}</strong>
              <span class="sub">queued · <b [class.err]="j.abandoned">{{ j.abandoned }} abandoned</b></span>
            </a>
          }
          @if (d.roles != null) {
            <a class="kpi card" routerLink="../roles"><span class="label">Roles</span><strong>{{ d.roles }}</strong><span class="sub">permission bundles</span></a>
          }
          @if (d.applications != null) {
            <a class="kpi card" routerLink="../applications"><span class="label">OpenIddict clients</span><strong>{{ d.applications }}</strong><span class="sub">applications that can get tokens</span></a>
          }
        </section>

        <div class="cols">
          @if (canSecurity) {
            <section class="card feed" aria-labelledby="rs-h">
              <header><h2 id="rs-h">Recent security events</h2><a routerLink="../security-logs">View all</a></header>
              <ul>
                @for (e of recentItems(); track e.id) {
                  @let a = describe(e.action);
                  <li>
                    <span [class]="'ico tone-' + a.tone" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="a.icon" /></svg></span>
                    <span class="what"><b>{{ a.label }}</b><small>{{ e.userName || 'unknown user' }} · {{ e.clientId || e.identity }} · {{ e.clientIpAddress }}</small></span>
                    <time class="muted">{{ relative(e.creationTime) }}</time>
                  </li>
                } @empty { <li class="muted none">No security events yet.</li> }
              </ul>
            </section>
          }
          <section class="card feed" aria-labelledby="go-h">
            <header><h2 id="go-h">Jump to</h2><span class="muted small">or press <kbd>Ctrl K</kbd></span></header>
            <div class="links">
              @for (n of links(); track n.path) {
                <a [routerLink]="'../' + n.path">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="n.icon" /></svg>
                  <span>{{ n.label }}</span>
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
  private readonly permissions = inject(PermissionService);
  private readonly config = toSignal(inject(ConfigStateService).getAll$());
  private readonly security = inject(SecurityLogService);
  private readonly dashboard = inject(DashboardService);

  protected readonly duration = duration;
  protected readonly relative = relative;
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
    return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${name ? ', ' + name : ''}`;
  });

  protected readonly links = computed(() =>
    NAV.filter(n => n.path !== 'overview' && (!n.policy || this.permissions.getGrantedPolicy(n.policy))));

  protected readonly alerts = computed<Alert[]>(() => {
    const d = this.data.value();
    if (!d) return [];
    const list: Alert[] = [];
    const n = (count: number | undefined, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
    if (d.users?.locked) list.push({ tone: 'warn', text: `${n(d.users.locked, 'user is', 'users are')} locked out`, link: '../users' });
    if (d.signIns?.failed) list.push({ tone: 'err', text: `${n(d.signIns.failed, 'failed sign-in', 'failed sign-ins')} in the last 24 hours`, link: '../security-logs', query: { failed: '1' } });
    if (d.requests?.failed) list.push({ tone: 'err', text: `${n(d.requests.failed, 'request', 'requests')} failed in the last 24 hours`, link: '../audit-logs' });
    if (d.jobs?.abandoned) list.push({ tone: 'warn', text: `${n(d.jobs.abandoned, 'background job was', 'background jobs were')} abandoned`, link: '../background-jobs', query: { state: 'abandoned' } });
    return list;
  });
}
