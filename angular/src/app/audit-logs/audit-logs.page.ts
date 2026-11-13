import { Component, ElementRef, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuditLogDto, AuditLogService, GetAuditLogListInput } from '../proxy/services/audit-logs';
import { AuditLogDetailComponent } from './audit-log-detail.component';
import { AuditStatsComponent, StatsPick } from './audit-stats.component';
import { RANGES, RangeKey, clock, dayLabel, duration, failed, methodTone, relative, splitUrl, statusTone, rangeWindow } from './format';

type Outcome = 'all' | 'ok' | 'failed';

const PAGE_SIZE = 30;

@Component({
  selector: 'app-audit-logs-page',
  imports: [AuditStatsComponent, AuditLogDetailComponent],
  templateUrl: './audit-logs.page.html',
  styleUrl: './audit-logs.page.scss',
})
export class AuditLogsPage {
  private readonly service = inject(AuditLogService);
  private readonly listTop = viewChild<ElementRef<HTMLElement>>('listTop');

  protected readonly ranges = RANGES;
  protected readonly methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  protected readonly f = { clock, duration, methodTone, relative, splitUrl, statusTone, failed };

  /** `?correlation=…` (e.g. from a security log event): filter to that request and open its trace. */
  readonly correlation = input<string>();

  // Filters
  protected readonly range = signal<RangeKey>('7d');
  protected readonly correlationId = linkedSignal(() => this.correlation() ?? '');
  protected readonly url = signal('');
  protected readonly user = signal('');
  protected readonly method = signal('');
  protected readonly status = signal<number | null>(null);
  protected readonly outcome = signal<Outcome>('all');
  protected readonly minDuration = signal<number | null>(null);
  protected readonly page = signal(0);
  /** Bumped by the refresh button to refetch with identical filters. */
  private readonly tick = signal(0);

  protected readonly selected = signal<AuditLogDto | null>(null);

  private readonly window = computed(() => {
    this.tick();
    return rangeWindow(this.range());
  });

  protected readonly stats = rxResource({
    params: () => this.window(),
    stream: ({ params }) => this.service.getStatistics(params),
  });

  private readonly query = computed<GetAuditLogListInput>(() => ({
    ...this.window(),
    url: this.url() || undefined,
    userName: this.user() || undefined,
    correlationId: this.correlationId() || undefined,
    httpMethod: this.method() || undefined,
    httpStatusCode: this.status() ?? undefined,
    hasException: this.outcome() === 'all' ? undefined : this.outcome() === 'failed',
    minExecutionDuration: this.minDuration() ?? undefined,
    skipCount: this.page() * PAGE_SIZE,
    maxResultCount: PAGE_SIZE,
  }));

  protected readonly logs = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.service.getList(params),
  });

  constructor() {
    // Deep link from a correlation id: open the matching request as soon as it is loaded.
    effect(() => {
      const id = this.correlation();
      const first = this.logs.value()?.items?.[0];
      if (id && first?.correlationId === id) untracked(() => this.selected.set(first));
    });
  }

  protected readonly total = computed(() => this.logs.value()?.totalCount ?? 0);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  private readonly maxDuration = computed(() => Math.max(1, ...(this.logs.value()?.items ?? []).map(l => l.executionDuration)));

  protected readonly groups = computed(() => {
    const groups: { day: string; items: AuditLogDto[] }[] = [];
    for (const log of this.logs.value()?.items ?? []) {
      const day = dayLabel(log.executionTime);
      if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
      groups.at(-1)!.items.push(log);
    }
    return groups;
  });

  protected readonly activeFilters = computed(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (this.correlationId()) chips.push({ label: `Correlation ${this.correlationId().slice(0, 8)}…`, clear: () => this.set(this.correlationId, '') });
    if (this.url()) chips.push({ label: `URL ~ ${this.url()}`, clear: () => this.set(this.url, '') });
    if (this.user()) chips.push({ label: `User: ${this.user()}`, clear: () => this.set(this.user, '') });
    if (this.method()) chips.push({ label: `Method: ${this.method()}`, clear: () => this.set(this.method, '') });
    if (this.status() !== null) chips.push({ label: `Status: ${this.status()}`, clear: () => this.set(this.status, null) });
    if (this.outcome() !== 'all') chips.push({ label: this.outcome() === 'failed' ? 'Failed only' : 'Succeeded only', clear: () => this.set(this.outcome, 'all') });
    if (this.minDuration()) chips.push({ label: `≥ ${this.minDuration()} ms`, clear: () => this.set(this.minDuration, null) });
    return chips;
  });

  /** Update a filter and go back to the first page. */
  protected set<T>(sig: { set(v: T): void }, value: T) {
    sig.set(value);
    this.page.set(0);
  }

  protected text(e: Event) {
    return (e.target as HTMLInputElement).value.trim();
  }

  protected numberOrNull(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    return v === '' ? null : Number(v);
  }

  protected clearAll() {
    this.url.set(''); this.user.set(''); this.correlationId.set(''); this.method.set(''); this.status.set(null);
    this.outcome.set('all'); this.minDuration.set(null); this.page.set(0);
  }

  protected refresh() {
    this.tick.update(t => t + 1);
  }

  protected onPick(p: StatsPick) {
    this.clearAll();
    if (p.url) this.url.set(p.url.replace(/\/\{id\}.*$/, ''));
    if (p.method) this.method.set(p.method);
    if (p.status) this.status.set(p.status);
    this.listTop()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected durationWidth(ms: number) {
    // sqrt scale: a 2 s outlier must not flatten every 40 ms request to nothing
    return Math.max(4, Math.sqrt(ms / this.maxDuration()) * 100);
  }

  protected tone(log: AuditLogDto) {
    return statusTone(log.httpStatusCode, !!log.exceptions);
  }
}
