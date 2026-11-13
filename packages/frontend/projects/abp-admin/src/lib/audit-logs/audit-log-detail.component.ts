import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { AccordionContent, AccordionGroup, AccordionPanel, AccordionTrigger } from '@angular/aria/accordion';
import { Tab, TabContent, TabList, TabPanel, Tabs } from '@angular/aria/tabs';
import { AuditLogActionDto, AuditLogDto, AuditLogService, EntityChangeDto, EntityChangeListItemDto } from '../proxy/abp-admin/services/audit-logs';
import {
  actionLabel, browserName, changeLabel, changeTone, clock, duration, flatParams, methodTone, plainValue, pretty, relative,
  shortType, splitUrl, stamp, statusTone, toMs,
} from './format';
import { ChangeDiffComponent } from '../entity-changes/change-diff.component';
import { EntityTimelineComponent } from '../entity-changes/entity-timeline.component';

interface TraceRow {
  kind: 'action' | 'change';
  id: string;
  label: string;
  sub: string;
  left: number;   // % offset on the time axis
  width: number;  // % of total
  tone: string;
  depth: number;
  last: boolean;
  guides: number[]; // ancestor depths whose vertical connector passes through this row
  badge?: 'API' | 'Service';
  service?: string;
  params?: string;
  args?: { path: string; value: string | null }[];
  step?: number;
  offset?: number; // ms after the request started
  share?: number;  // % of the request's duration
  change?: EntityChangeDto;
}

@Component({
  selector: 'abp-audit-log-detail',
  imports: [ChangeDiffComponent, EntityTimelineComponent, Tabs, TabList, Tab, TabPanel, TabContent, AccordionGroup, AccordionTrigger, AccordionPanel, AccordionContent],
  templateUrl: './audit-log-detail.component.html',
  styleUrl: './audit-log-detail.component.scss',
})
export class AuditLogDetailComponent {
  private readonly service = inject(AuditLogService);

  readonly log = input<AuditLogDto | null>(null);
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly tab = signal('trace');
  protected readonly copied = signal(false);
  protected readonly history = signal<Record<string, EntityChangeListItemDto[] | 'loading'>>({});

  protected readonly f = { actionLabel, browserName, changeLabel, changeTone, clock, duration, flatParams, methodTone, plainValue, pretty, relative, shortType, splitUrl, stamp, statusTone };
  protected readonly short: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  protected readonly full: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'long' };

  constructor() {
    // Open/close the native modal dialog as the selected log changes.
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.log()) {
        this.tab.set('trace');
        this.history.set({});
        if (!el.open) el.showModal();
        el.scrollTop = 0;
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected readonly tone = computed(() => {
    const l = this.log();
    return l ? statusTone(l.httpStatusCode, !!l.exceptions) : 'ok';
  });

  protected readonly firstExceptionLine = computed(() => {
    const ex = this.log()?.exceptions ?? '';
    const m = ex.match(/"message"\s*:\s*"([^"]+)"/i);
    return m?.[1] ?? ex.split('\n')[0].slice(0, 220);
  });

  /** Axis ticks for the waterfall. */
  protected readonly ticks = computed(() => {
    const total = this.total();
    return [0, 0.25, 0.5, 0.75, 1].map(p => ({ left: p * 100, label: duration(total * p) }));
  });

  protected readonly rootWidth = computed(() => ((this.log()?.executionDuration ?? 0) / this.total()) * 100);

  private readonly total = computed(() => {
    const l = this.log();
    if (!l) return 1;
    // The request's own duration, stretched if a nested event lands after it (clock skew, deferred saves).
    const start = toMs(l.executionTime);
    const ends = [
      l.executionDuration,
      ...l.actions.map(a => toMs(a.executionTime) - start + a.executionDuration),
      ...l.entityChanges.map(c => toMs(c.changeTime) - start),
    ];
    return Math.max(1, ...ends);
  });

  /**
   * Request → actions → entity changes as a tree, flattened for the waterfall.
   * - An action is the child of the action whose time window contains it (controller → app service).
   * - A change belongs to the deepest action containing its timestamp, else the last action that started
   *   before it (EF saves at the end of the unit of work, after the action returns).
   */
  protected readonly rows = computed<TraceRow[]>(() => {
    const l = this.log();
    if (!l) return [];
    const origin = toMs(l.executionTime);
    const total = this.total();
    const pct = (ms: number) => Math.min(100, Math.max(0, (ms / total) * 100));
    const SLACK = 2; // ms; timestamps are rounded

    interface Node { action: AuditLogActionDto; start: number; end: number; children: Node[]; changes: EntityChangeDto[] }
    const roots: Node[] = [];
    const rootChanges: EntityChangeDto[] = [];
    const all: Node[] = [];
    const stack: Node[] = [];

    const sorted = [...l.actions].sort((a, b) =>
      toMs(a.executionTime) - toMs(b.executionTime) || b.executionDuration - a.executionDuration);
    for (const action of sorted) {
      const start = toMs(action.executionTime);
      const node: Node = { action, start, end: start + action.executionDuration, children: [], changes: [] };
      while (stack.length && !(start >= stack.at(-1)!.start && node.end <= stack.at(-1)!.end + SLACK)) stack.pop();
      (stack.at(-1)?.children ?? roots).push(node);
      stack.push(node);
      all.push(node);
    }

    for (const c of [...l.entityChanges].sort((a, b) => toMs(a.changeTime) - toMs(b.changeTime))) {
      const t = toMs(c.changeTime);
      const containing = all.filter(n => t >= n.start - SLACK && t <= n.end + SLACK);
      // deepest container = the one that started last; otherwise the latest-started action before the change
      const owner = containing.at(-1) ?? all.filter(n => n.start <= t).at(-1);
      (owner?.changes ?? rootChanges).push(c);
    }

    const rows: TraceRow[] = [];
    let step = 0;
    // trail[k] = the ancestor at depth k+1 still has siblings below → keep its vertical guide running.
    const guidesOf = (trail: boolean[]) => trail.flatMap((open, k) => (open ? [k + 1] : []));
    const changeRow = (c: EntityChangeDto, depth: number, last: boolean, trail: boolean[]): TraceRow => ({
      kind: 'change', id: c.id!, depth, last, guides: guidesOf(trail),
      label: shortType(c.entityTypeFullName),
      sub: `${changeLabel[c.changeType]} · ${c.propertyChanges.length} propert${c.propertyChanges.length === 1 ? 'y' : 'ies'}`,
      left: pct(toMs(c.changeTime) - origin), width: 0, tone: changeTone[c.changeType], change: c,
    });
    const walk = (nodes: Node[], changes: EntityChangeDto[], depth: number, trail: boolean[]) => {
      const count = nodes.length + changes.length;
      nodes.forEach((n, i) => {
        const isApi = /Controller$/.test(n.action.serviceName ?? '');
        const last = i === count - 1;
        rows.push({
          kind: 'action', id: n.action.id!, depth, last, guides: guidesOf(trail),
          label: actionLabel(n.action.serviceName, n.action.methodName),
          sub: duration(n.action.executionDuration), badge: isApi ? 'API' : 'Service',
          left: pct(n.start - origin), width: Math.max(0.8, pct(n.action.executionDuration)),
          tone: isApi ? 'info' : 'accent', params: pretty(n.action.parameters), service: n.action.serviceName ?? '',
          args: flatParams(n.action.parameters), step: ++step, offset: n.start - origin,
          share: Math.round((n.action.executionDuration / Math.max(1, l.executionDuration)) * 100),
        });
        walk(n.children, n.changes, depth + 1, [...trail, !last]);
      });
      changes.forEach((c, i) => rows.push(changeRow(c, depth, nodes.length + i === count - 1, trail)));
    };
    walk(roots, rootChanges, 1, []);
    return rows;
  });

  /** Entity changes grouped by entity, for the Changes tab. */
  protected readonly entities = computed(() => {
    const groups = new Map<string, EntityChangeDto[]>();
    for (const c of this.log()?.entityChanges ?? []) {
      const key = `${c.entityTypeFullName}|${c.entityId}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return [...groups.entries()].map(([key, changes]) => ({ key, changes, first: changes[0] }));
  });

  protected close() {
    this.closed.emit();
  }

  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dialog().nativeElement) this.close();
  }

  protected copy(text?: string | null) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1400);
    });
  }

  protected showChange(change: EntityChangeDto) {
    this.tab.set('changes');
    setTimeout(() => document.getElementById('chg-' + change.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  protected toggleHistory(c: EntityChangeDto) {
    const key = `${c.entityTypeFullName}|${c.entityId}`;
    const current = this.history();
    if (current[key]) {
      const { [key]: _, ...rest } = current;
      this.history.set(rest);
      return;
    }
    this.history.set({ ...current, [key]: 'loading' });
    this.service.getEntityHistory(c.entityId!, c.entityTypeFullName!).subscribe({
      next: list => this.history.update(h => ({ ...h, [key]: list })),
      error: () => this.history.update(h => ({ ...h, [key]: [] })),
    });
  }

  protected historyOf(c: EntityChangeDto) {
    return this.history()[`${c.entityTypeFullName}|${c.entityId}`];
  }

  protected readonly browser = browserName;
}
