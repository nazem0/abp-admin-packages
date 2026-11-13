import { PermissionService } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { BackgroundJobDto, BackgroundJobService, BackgroundJobState } from '../proxy/abp-admin/services/background-jobs';
import { BackgroundJobPriority } from '../proxy/volo/abp/background-jobs';
import { pretty, relative, shortType, stamp } from '../audit-logs/format';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

const PAGE_SIZE = 25;
const STATES = [
  { state: BackgroundJobState.Waiting, key: 'waiting', label: 'Waiting', hint: 'queued, not tried yet', tone: 'info' },
  { state: BackgroundJobState.Retrying, key: 'retrying', label: 'Retrying', hint: 'failed, will try again', tone: 'warn' },
  { state: BackgroundJobState.Abandoned, key: 'abandoned', label: 'Abandoned', hint: 'gave up after retries', tone: 'err' },
] as const;

/** ABP's persisted background job queue (AbpBackgroundJobs). */
@Component({
  selector: 'abp-background-jobs-page',
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>Background jobs</h1>
          <p class="muted">Jobs queued with <code>IBackgroundJobManager</code>. Successful jobs leave the queue; failures are retried with back-off, then abandoned.</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn" (click)="refresh()" aria-label="Refresh" title="Refresh" [class.spin]="list.isLoading()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>
          </button>
        </div>
      </header>

      <div class="tiles" role="group" aria-label="Filter by state">
        @for (s of states; track s.key) {
          <button [class]="'tile card tone-' + s.tone" [attr.aria-pressed]="state() === s.state" (click)="toggle(s.state)">
            <span class="muted">{{ s.label }}</span>
            <strong>{{ counts.value()?.[s.key] ?? '–' }}</strong>
            <small class="muted">{{ s.hint }}</small>
          </button>
        }
      </div>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="Job name…" aria-label="Filter by job name"
                   (change)="jobName.set($any($event.target).value.trim()); page.set(0)" (search)="jobName.set($any($event.target).value.trim()); page.set(0)" />
          </label>
        </div>

        @if (list.error()) {
          <div class="state err">Couldn't load jobs. <button class="btn" (click)="refresh()">Retry</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            <b>Queue is empty</b><span class="muted">{{ state() !== null || jobName() ? 'No job matches these filters.' : 'Every queued job has run.' }}</span>
          </div>
        } @else {
          <ul class="jobs">
            @for (j of rows(); track j.id) {
              @let st = stateOf(j);
              <li [class.open]="openId() === j.id">
                <div class="job">
                  <button class="main" (click)="openId.set(openId() === j.id ? null : j.id!)" [attr.aria-expanded]="openId() === j.id">
                    <span [class]="'dot tone-' + st.tone" aria-hidden="true"></span>
                    <span class="name"><b>{{ shortType(j.jobName) }}</b><small class="mono">{{ j.jobName }}</small></span>
                    <span class="meta hide-sm"><span [class]="'pill tone-' + st.tone">{{ st.label }}</span>
                      @if (j.priority !== Priority.Normal) { <span class="pill">{{ Priority[j.priority!] }} priority</span> }</span>
                    <span class="tries">{{ j.tryCount }} {{ j.tryCount === 1 ? 'try' : 'tries' }}</span>
                    <span class="when" [title]="stamp(j.nextTryTime, full)">{{ j.isAbandoned ? 'abandoned' : 'next ' + relative(j.nextTryTime) }}</span>
                  </button>
                  @if (canManage) {
                    @if (confirming() === j.id) {
                      <span class="confirm"><button class="btn sm danger" (click)="remove(j)">Delete</button><button class="btn sm" (click)="confirming.set(null)">Cancel</button></span>
                    } @else {
                      <span class="acts">
                        <button class="icon-btn" title="Run now" [attr.aria-label]="'Run ' + j.jobName + ' now'" (click)="retry(j)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg></button>
                        <button class="icon-btn" title="Delete" [attr.aria-label]="'Delete ' + j.jobName" (click)="confirming.set(j.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      </span>
                    }
                  }
                </div>
                @if (openId() === j.id) {
                  <div class="detail">
                    <dl>
                      <dt>Queued</dt><dd>{{ stamp(j.creationTime, full) }}</dd>
                      <dt>Last try</dt><dd>{{ j.lastTryTime ? stamp(j.lastTryTime, full) : 'never' }}</dd>
                      <dt>Next try</dt><dd>{{ stamp(j.nextTryTime, full) }}</dd>
                      @if (j.applicationName) { <dt>Application</dt><dd>{{ j.applicationName }}</dd> }
                    </dl>
                    <pre>{{ pretty(j.jobArgs) }}</pre>
                  </div>
                }
              </li>
            }
          </ul>
        }

        @if (total() > PAGE_SIZE) {
          <footer class="pager">
            <span class="muted">{{ total() }} jobs</span>
            <div>
              <button class="btn" [disabled]="page() === 0" (click)="page.set(page() - 1)">Previous</button>
              <span class="muted">Page {{ page() + 1 }} of {{ pages() }}</span>
              <button class="btn" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">Next</button>
            </div>
          </footer>
        }
      </section>
    </div>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .tile { display: grid; gap: 2px; padding: 14px 16px; text-align: start; font: inherit; color: var(--text); cursor: pointer; }
    .tile span { font-size: 12.5px; font-weight: 550; }
    .tile strong { font-size: 26px; font-weight: 700; color: var(--tone); font-variant-numeric: tabular-nums; }
    .tile small { font-size: 11.5px; }
    .tile:hover { border-color: var(--tone); }
    .tile[aria-pressed='true'] { border-color: var(--tone); box-shadow: 0 0 0 3px var(--tone-soft), var(--shadow); }
    @media (max-width: 560px) { .tile small { display: none; } }
    .jobs { list-style: none; margin: 0; padding: 6px 8px; }
    .jobs li { border-radius: 10px; }
    .jobs li.open { background: var(--surface-2); }
    .job { display: flex; align-items: center; gap: 6px; }
    .main { flex: 1; min-width: 0; display: grid; grid-template-columns: 12px minmax(0, 1.6fr) minmax(0, 1fr) 70px 120px; gap: 12px; align-items: center;
      padding: 10px; border: 0; border-radius: 10px; background: none; color: var(--text); font: inherit; text-align: start; cursor: pointer; }
    .main:hover { background: var(--surface-2); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--tone); box-shadow: 0 0 0 3px var(--tone-soft); }
    .name { display: grid; min-width: 0; }
    .name small { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { display: flex; gap: 4px; flex-wrap: wrap; }
    .tries, .when { color: var(--muted); font-size: 12.5px; white-space: nowrap; }
    .when { text-align: end; }
    .acts, .confirm { display: flex; gap: 2px; padding-inline-end: 6px; }
    .detail { padding: 0 16px 14px 34px; display: grid; gap: 10px; }
    dl { display: grid; grid-template-columns: 100px 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    pre { margin: 0; padding: 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); max-height: 300px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 720px) { .main { grid-template-columns: 12px minmax(0, 1fr) auto; } .tries { display: none; } .detail { padding-inline-start: 14px; } }
  `,
})
export class BackgroundJobsPage {
  private readonly service = inject(BackgroundJobService);
  private readonly toaster = inject(Toaster);
  protected readonly canManage = inject(PermissionService).getGrantedPolicy('AbpAdmin.BackgroundJobs.Manage');

  /** `?state=abandoned|retrying|waiting` deep link. */
  readonly stateParam = input<string>(undefined, { alias: 'state' });

  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected readonly states = STATES;
  protected readonly Priority = BackgroundJobPriority;
  protected readonly pretty = pretty;
  protected readonly relative = relative;
  protected readonly shortType = shortType;
  protected readonly stamp = stamp;
  protected readonly full: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'medium' };

  protected readonly state = linkedSignal<BackgroundJobState | null>(() => STATES.find(s => s.key === this.stateParam())?.state ?? null);
  protected readonly jobName = signal('');
  protected readonly page = signal(0);
  protected readonly openId = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  private readonly tick = signal(0);

  protected readonly counts = rxResource({ params: () => this.tick(), stream: () => this.service.getCounts() });
  protected readonly list = rxResource({
    params: () => ({
      tick: this.tick(),
      state: this.state() ?? undefined,
      jobName: this.jobName() || undefined,
      skipCount: this.page() * PAGE_SIZE,
      maxResultCount: PAGE_SIZE,
    }),
    stream: ({ params: { tick, ...input } }) => this.service.getList(input),
  });
  protected readonly rows = computed<BackgroundJobDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  protected stateOf(j: BackgroundJobDto) {
    return j.isAbandoned ? STATES[2] : (j.tryCount ?? 0) > 0 ? STATES[1] : STATES[0];
  }

  protected toggle(state: BackgroundJobState) {
    this.state.set(this.state() === state ? null : state);
    this.page.set(0);
  }

  protected refresh() {
    this.tick.update(t => t + 1);
  }

  protected retry(j: BackgroundJobDto) {
    this.service.retry(j.id!).subscribe({
      next: () => { this.toaster.ok(`${this.shortType(j.jobName)} queued to run now.`); this.refresh(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected remove(j: BackgroundJobDto) {
    this.service.delete(j.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok('Job deleted.'); this.refresh(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
