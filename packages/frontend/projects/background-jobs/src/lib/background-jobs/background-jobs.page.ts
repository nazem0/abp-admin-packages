import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { BackgroundJobDto, BackgroundJobService, BackgroundJobState, BackgroundJobPriority, pretty, relative, shortType, stamp, apiError, Toaster , PagerComponent, keepPageInRange, savedPageSize } from '@nazem0/abp-admin-ng-core';

const STATES = [
  { state: BackgroundJobState.Waiting, key: 'waiting', labelKey: 'AbpAdmin::BackgroundJobs:State:Waiting', hintKey: 'AbpAdmin::BackgroundJobs:State:WaitingHint', tone: 'info' },
  { state: BackgroundJobState.Retrying, key: 'retrying', labelKey: 'AbpAdmin::BackgroundJobs:State:Retrying', hintKey: 'AbpAdmin::BackgroundJobs:State:RetryingHint', tone: 'warn' },
  { state: BackgroundJobState.Abandoned, key: 'abandoned', labelKey: 'AbpAdmin::BackgroundJobs:State:Abandoned', hintKey: 'AbpAdmin::BackgroundJobs:State:AbandonedHint', tone: 'err' },
] as const;

/** ABP's persisted background job queue (AbpBackgroundJobs). */
@Component({
  selector: 'abp-background-jobs-page',
  imports: [PagerComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::BackgroundJobs:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::BackgroundJobs:Subtitle' | abpLocalization: 'IBackgroundJobManager' }}</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn" (click)="refresh()" [attr.aria-label]="'AbpAdmin::Common:Refresh' | abpLocalization" [title]="'AbpAdmin::Common:Refresh' | abpLocalization" [class.spin]="list.isLoading()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>
          </button>
        </div>
      </header>

      <div class="tiles" role="group" [attr.aria-label]="'AbpAdmin::BackgroundJobs:FilterByState' | abpLocalization">
        @for (s of states; track s.key) {
          <button [class]="'tile card tone-' + s.tone" [attr.aria-pressed]="state() === s.state" (click)="toggle(s.state)">
            <span class="muted">{{ s.labelKey | abpLocalization }}</span>
            <strong>{{ counts.value()?.[s.key] ?? '–' }}</strong>
            <small class="muted">{{ s.hintKey | abpLocalization }}</small>
          </button>
        }
      </div>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" [placeholder]="'AbpAdmin::BackgroundJobs:JobNamePlaceholder' | abpLocalization" [attr.aria-label]="'AbpAdmin::BackgroundJobs:FilterByJobName' | abpLocalization"
                   (change)="jobName.set($any($event.target).value.trim()); page.set(0)" (search)="jobName.set($any($event.target).value.trim()); page.set(0)" />
          </label>
        </div>

        @if (list.error()) {
          <div class="state err">{{ 'AbpAdmin::BackgroundJobs:LoadFailed' | abpLocalization }} <button class="btn" (click)="refresh()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            <b>{{ 'AbpAdmin::BackgroundJobs:QueueEmpty' | abpLocalization }}</b><span class="muted">{{ (state() !== null || jobName() ? 'AbpAdmin::BackgroundJobs:NoMatch' : 'AbpAdmin::BackgroundJobs:AllRun') | abpLocalization }}</span>
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
                    <span class="meta hide-sm"><span [class]="'pill tone-' + st.tone">{{ st.labelKey | abpLocalization }}</span>
                      @if (j.priority !== Priority.Normal) { <span class="pill">{{ priorityLabel(j) }}</span> }</span>
                    <span class="tries">{{ (j.tryCount === 1 ? 'AbpAdmin::BackgroundJobs:TryOne' : 'AbpAdmin::BackgroundJobs:TryMany') | abpLocalization: (j.tryCount ?? 0).toString() }}</span>
                    <span class="when" [title]="stamp(j.nextTryTime, full)">{{ j.isAbandoned ? ('AbpAdmin::BackgroundJobs:AbandonedLower' | abpLocalization) : ('AbpAdmin::BackgroundJobs:NextIn' | abpLocalization: relative(j.nextTryTime)) }}</span>
                  </button>
                  @if (canManage) {
                    @if (confirming() === j.id) {
                      <span class="confirm"><button class="btn sm danger" (click)="remove(j)">{{ 'AbpAdmin::Common:Delete' | abpLocalization }}</button><button class="btn sm" (click)="confirming.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button></span>
                    } @else {
                      <span class="acts">
                        <button class="icon-btn" [title]="'AbpAdmin::BackgroundJobs:RunNow' | abpLocalization" [attr.aria-label]="'AbpAdmin::BackgroundJobs:RunAria' | abpLocalization: j.jobName!" (click)="retry(j)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg></button>
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Delete' | abpLocalization" [attr.aria-label]="'AbpAdmin::BackgroundJobs:DeleteAria' | abpLocalization: j.jobName!" (click)="confirming.set(j.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      </span>
                    }
                  }
                </div>
                @if (openId() === j.id) {
                  <div class="detail">
                    <dl>
                      <dt>{{ 'AbpAdmin::BackgroundJobs:Queued' | abpLocalization }}</dt><dd>{{ stamp(j.creationTime, full) }}</dd>
                      <dt>{{ 'AbpAdmin::BackgroundJobs:LastTry' | abpLocalization }}</dt><dd>{{ j.lastTryTime ? stamp(j.lastTryTime, full) : ('AbpAdmin::Common:Never' | abpLocalization) }}</dd>
                      <dt>{{ 'AbpAdmin::BackgroundJobs:NextTry' | abpLocalization }}</dt><dd>{{ stamp(j.nextTryTime, full) }}</dd>
                      @if (j.applicationName) { <dt>{{ 'AbpAdmin::BackgroundJobs:Application' | abpLocalization }}</dt><dd>{{ j.applicationName }}</dd> }
                    </dl>
                    <pre>{{ pretty(j.jobArgs) }}</pre>
                  </div>
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
  private readonly l = inject(LocalizationService);
  protected readonly canManage = inject(PermissionService).getGrantedPolicy('AbpAdmin.BackgroundJobs.Manage');

  /** `?state=abandoned|retrying|waiting` deep link. */
  readonly stateParam = input<string>(undefined, { alias: 'state' });
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
  protected readonly size = signal(savedPageSize());
  protected readonly openId = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  private readonly tick = signal(0);

  protected readonly counts = rxResource({ params: () => this.tick(), stream: () => this.service.getCounts() });
  protected readonly list = rxResource({
    params: () => ({
      tick: this.tick(),
      state: this.state() ?? undefined,
      jobName: this.jobName() || undefined,
      skipCount: this.page() * this.size(),
      maxResultCount: this.size(),
    }),
    stream: ({ params: { tick, ...input } }) => this.service.getList(input),
  });
  protected readonly rows = computed<BackgroundJobDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  private readonly pageInRange = keepPageInRange(this.page, this.size, this.total);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));

  protected priorityLabel(j: BackgroundJobDto) {
    return this.l.instant('AbpAdmin::BackgroundJobs:Priority:' + BackgroundJobPriority[j.priority!]);
  }

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
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::BackgroundJobs:QueuedToRun', this.shortType(j.jobName))); this.refresh(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected remove(j: BackgroundJobDto) {
    this.service.delete(j.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('AbpAdmin::BackgroundJobs:Deleted')); this.refresh(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
