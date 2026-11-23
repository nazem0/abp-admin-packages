import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { EventBoxDto, EventBoxKind, EventBoxService, EventRecordDto, EventRecordStatus } from '../proxy/services/event-bus';
import { pretty, relative, shortType, stamp } from '../audit-logs/format';
import { PagerComponent, keepPageInRange, savedPageSize } from '../shared/pager.component';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

const STATES = [
  { status: EventRecordStatus.Waiting, key: 'waiting', labelKey: '::Events:State:Waiting', tone: 'info' },
  { status: EventRecordStatus.Retrying, key: 'retrying', labelKey: '::Events:State:Retrying', tone: 'warn' },
  { status: EventRecordStatus.Discarded, key: 'discarded', labelKey: '::Events:State:Discarded', tone: 'err' },
  { status: EventRecordStatus.Processed, key: 'processed', labelKey: '::Events:State:Processed', tone: 'ok' },
] as const;

/** The distributed event bus outbox (waiting to be sent) and inbox (received, waiting to be handled). */
@Component({
  selector: 'app-events-page',
  imports: [PagerComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ '::Events:Title' | abpLocalization }}</h1>
          <p class="muted">{{ '::Events:Subtitle' | abpLocalization }}</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn" (click)="refresh()" [attr.aria-label]="'::Common:Refresh' | abpLocalization" [title]="'::Common:Refresh' | abpLocalization" [class.spin]="list.isLoading()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg>
          </button>
        </div>
      </header>

      @if (boxes.error()) {
        <div class="card state err">{{ '::Events:LoadFailed' | abpLocalization }} <button class="btn" (click)="refresh()">{{ '::Common:Retry' | abpLocalization }}</button></div>
      } @else if (boxes.isLoading() && !boxes.value().length) {
        <div class="card skeleton rows">@for (i of [1, 2]; track i) { <i></i> }</div>
      } @else if (!boxes.value().length) {
        <div class="card state empty">
          <b>{{ '::Events:NoBoxes' | abpLocalization }}</b>
          <span class="muted">{{ '::Events:NoBoxesHint' | abpLocalization }}</span>
          <code class="mono">options.Outboxes.Configure(box => box.UseDbContext&lt;MyDbContext&gt;());</code>
        </div>
      } @else {
        <nav class="tabs" [attr.aria-label]="'::Events:Boxes' | abpLocalization">
          @for (b of boxes.value(); track $index) {
            <button [class.active]="b === box()" [attr.aria-pressed]="b === box()" (click)="pick(b)">
              {{ (b.kind === Kind.Outbox ? '::Events:Outbox' : '::Events:Inbox') | abpLocalization }}
              <small class="muted">{{ b.name === 'Default' ? b.dbContext : b.name }}</small>
              @if (b.waiting! + b.retrying!) { <span class="pill tone-info">{{ b.waiting! + b.retrying! }}</span> }
              @if (b.discarded) { <span class="pill tone-err">{{ b.discarded }}</span> }
            </button>
          }
        </nav>

        @if (box(); as b) {
          @if (b.kind === Kind.Inbox) {
            <div class="tiles" role="group" [attr.aria-label]="'::Events:FilterByState' | abpLocalization">
              @for (s of states; track s.key) {
                <button [class]="'tile card tone-' + s.tone" [attr.aria-pressed]="status() === s.status" (click)="toggle(s.status)">
                  <span class="muted">{{ s.labelKey | abpLocalization }}</span>
                  <strong>{{ b[s.key] }}</strong>
                </button>
              }
            </div>
          } @else {
            <p class="muted hint">{{ '::Events:OutboxHint' | abpLocalization }}</p>
          }

          <section class="card stream">
            <div class="filters">
              <label class="search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input class="input" type="search" [placeholder]="'::Events:EventNamePlaceholder' | abpLocalization" [attr.aria-label]="'::Events:EventNamePlaceholder' | abpLocalization"
                       (change)="eventName.set($any($event.target).value.trim()); page.set(0)" (search)="eventName.set($any($event.target).value.trim()); page.set(0)" />
              </label>
            </div>

            @if (list.error()) {
              <div class="state err">{{ '::Events:LoadFailed' | abpLocalization }} <button class="btn" (click)="refresh()">{{ '::Common:Retry' | abpLocalization }}</button></div>
            } @else if (list.isLoading() && !rows().length) {
              <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
            } @else if (!rows().length) {
              <div class="state empty">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                <b>{{ '::Events:Empty' | abpLocalization }}</b>
              </div>
            } @else {
              <ul class="events">
                @for (e of rows(); track e.id) {
                  @let st = stateOf(e);
                  <li [class.open]="openId() === e.id">
                    <div class="row">
                      <button class="main" (click)="openId.set(openId() === e.id ? null : e.id!)" [attr.aria-expanded]="openId() === e.id">
                        <span [class]="'dot tone-' + st.tone" aria-hidden="true"></span>
                        <span class="name"><b>{{ shortType(e.eventName) }}</b><small class="mono">{{ e.eventName }}</small></span>
                        <span class="hide-sm"><span [class]="'pill tone-' + st.tone">{{ st.labelKey | abpLocalization }}</span></span>
                        <span class="when" [title]="stamp(e.creationTime, full)">{{ relative(e.creationTime) }}</span>
                      </button>
                      @if (canManage) {
                        @if (confirming() === e.id) {
                          <span class="acts"><button class="btn sm danger" (click)="remove(e)">{{ '::Common:Delete' | abpLocalization }}</button><button class="btn sm" (click)="confirming.set(null)">{{ '::Common:Cancel' | abpLocalization }}</button></span>
                        } @else {
                          <span class="acts">
                            @if (b.kind === Kind.Inbox && e.status !== Status.Waiting) {
                              <button class="icon-btn" [title]="'::Events:Retry' | abpLocalization" [attr.aria-label]="'::Events:RetryAria' | abpLocalization: e.eventName!" (click)="retry(e)">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg></button>
                            }
                            <button class="icon-btn" [title]="'::Common:Delete' | abpLocalization" [attr.aria-label]="'::Events:DeleteAria' | abpLocalization: e.eventName!" (click)="confirming.set(e.id!)">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                          </span>
                        }
                      }
                    </div>
                    @if (openId() === e.id) {
                      <div class="detail">
                        <dl>
                          <dt>{{ '::Events:Created' | abpLocalization }}</dt><dd>{{ stamp(e.creationTime, full) }}</dd>
                          @if (e.messageId) { <dt>{{ '::Events:MessageId' | abpLocalization }}</dt><dd class="mono">{{ e.messageId }}</dd> }
                          @if (e.retryCount) { <dt>{{ '::Events:Retries' | abpLocalization }}</dt><dd>{{ e.retryCount }}</dd> }
                          @if (e.nextRetryTime) { <dt>{{ '::Events:NextRetry' | abpLocalization }}</dt><dd>{{ stamp(e.nextRetryTime, full) }}</dd> }
                          @if (e.handledTime) { <dt>{{ '::Events:Handled' | abpLocalization }}</dt><dd>{{ stamp(e.handledTime, full) }}</dd> }
                        </dl>
                        <pre>{{ pretty(e.eventData) }}</pre>
                      </div>
                    }
                  </li>
                }
              </ul>
            }
            <app-pager [total]="total()" [(page)]="page" [(size)]="size" />
          </section>
        }
      }
    </div>
  `,
  styles: `
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
    .tabs button { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px;
      background: var(--surface); color: var(--text); font: inherit; font-weight: 550; cursor: pointer; }
    .tabs button.active { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .tabs small { font-weight: 400; }
    .hint { margin: 0; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 720px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .tile { display: grid; gap: 2px; padding: 14px 16px; text-align: start; font: inherit; color: var(--text); cursor: pointer; }
    .tile span { font-size: 12.5px; font-weight: 550; }
    .tile strong { font-size: 26px; font-weight: 700; color: var(--tone); font-variant-numeric: tabular-nums; }
    .tile:hover { border-color: var(--tone); }
    .tile[aria-pressed='true'] { border-color: var(--tone); box-shadow: 0 0 0 3px var(--tone-soft), var(--shadow); }
    .state.empty code { margin-top: 6px; font-size: 12px; }
    .events { list-style: none; margin: 0; padding: 6px 8px; }
    .events li { border-radius: 10px; }
    .events li.open { background: var(--surface-2); }
    .row { display: flex; align-items: center; gap: 6px; }
    .main { flex: 1; min-width: 0; display: grid; grid-template-columns: 12px minmax(0, 1.6fr) minmax(0, 1fr) 120px; gap: 12px; align-items: center;
      padding: 10px; border: 0; border-radius: 10px; background: none; color: var(--text); font: inherit; text-align: start; cursor: pointer; }
    .main:hover { background: var(--surface-2); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--tone); box-shadow: 0 0 0 3px var(--tone-soft); }
    .name { display: grid; min-width: 0; }
    .name small { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .when { color: var(--muted); font-size: 12.5px; white-space: nowrap; text-align: end; }
    .acts { display: flex; gap: 2px; padding-inline-end: 6px; }
    .detail { padding: 0 16px 14px 34px; display: grid; gap: 10px; }
    dl { display: grid; grid-template-columns: 110px 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; overflow-wrap: anywhere; }
    pre { margin: 0; padding: 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); max-height: 300px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 720px) { .main { grid-template-columns: 12px minmax(0, 1fr) auto; } .detail { padding-inline-start: 14px; } }
  `,
})
export class EventsPage {
  private readonly service = inject(EventBoxService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  protected readonly canManage = inject(PermissionService).getGrantedPolicy('AbpAdmin.EventBoxes.Manage');
  protected readonly Kind = EventBoxKind;
  protected readonly Status = EventRecordStatus;
  protected readonly states = STATES;
  protected readonly pretty = pretty;
  protected readonly relative = relative;
  protected readonly shortType = shortType;
  protected readonly stamp = stamp;
  protected readonly full: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'medium' };

  private readonly tick = signal(0);
  protected readonly boxes = rxResource({ params: () => this.tick(), stream: () => this.service.getBoxes(), defaultValue: [] as EventBoxDto[] });
  private readonly picked = signal<{ kind: EventBoxKind; name: string } | null>(null);
  /** The picked box (kept across refreshes by kind + name), else the first one. */
  protected readonly box = computed(() => {
    const p = this.picked();
    return this.boxes.value().find(b => p && b.kind === p.kind && b.name === p.name) ?? this.boxes.value()[0];
  });
  protected readonly status = linkedSignal<EventBoxDto | undefined, EventRecordStatus | null>({ source: () => this.box(), computation: () => null });
  protected readonly eventName = signal('');
  protected readonly page = signal(0);
  protected readonly size = signal(savedPageSize());
  protected readonly openId = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);

  protected readonly list = rxResource({
    params: () => {
      const b = this.box();
      return b && {
        tick: this.tick(), kind: b.kind!, box: b.name!, status: this.status() ?? undefined,
        eventName: this.eventName() || undefined, skipCount: this.page() * this.size(), maxResultCount: this.size(),
      };
    },
    stream: ({ params: { tick, ...input } }) => this.service.getList(input),
  });
  protected readonly rows = computed<EventRecordDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);
  private readonly pageInRange = keepPageInRange(this.page, this.size, this.total);

  protected stateOf(e: EventRecordDto) {
    return STATES.find(s => s.status === e.status) ?? STATES[0];
  }

  protected pick(b: EventBoxDto) {
    this.picked.set({ kind: b.kind!, name: b.name! });
    this.page.set(0);
  }

  protected toggle(status: EventRecordStatus) {
    this.status.set(this.status() === status ? null : status);
    this.page.set(0);
  }

  protected refresh() {
    this.tick.update(t => t + 1);
  }

  protected retry(e: EventRecordDto) {
    this.service.retry(this.box()!.name!, e.id!).subscribe({
      next: () => { this.toaster.ok(this.l.instant('::Events:Requeued', this.shortType(e.eventName))); this.refresh(); },
      error: err => this.toaster.error(apiError(err)),
    });
  }

  protected remove(e: EventRecordDto) {
    const b = this.box()!;
    this.service.delete(b.kind!, b.name!, e.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('::Events:Deleted')); this.refresh(); },
      error: err => { this.confirming.set(null); this.toaster.error(apiError(err)); },
    });
  }
}
