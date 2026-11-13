import { Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin, map } from 'rxjs';
import { AuditLogDto, AuditLogService, EntityChangeListItemDto, GetEntityChangeListInput } from '../proxy/services/audit-logs';
import { EntityChangeType } from '../proxy/volo/abp/auditing';
import { AuditLogDetailComponent } from '../audit-logs/audit-log-detail.component';
import { RANGES, RangeKey, changeLabel, changeTone, clock, dayLabel, rangeWindow, shortType } from '../audit-logs/format';
import { EntityHistoryComponent, EntityRef } from './entity-history.component';
import { EntityTypePickerComponent, SYSTEM_ENTITY_TYPES } from './entity-type-picker.component';

const HIDE_SYSTEM_KEY = 'abp-admin.entity-changes.hide-system';

const PAGE_SIZE = 30;
/** Bookkeeping columns ABP touches on every update; listed last so the meaningful property names show first. */
const NOISE = new Set(['EntityVersion', 'ConcurrencyStamp', 'LastModificationTime', 'LastModifierId', 'ExtraProperties']);
const KINDS = [
  { type: EntityChangeType.Created, label: 'Created', hint: 'new records' },
  { type: EntityChangeType.Updated, label: 'Updated', hint: 'edited records' },
  { type: EntityChangeType.Deleted, label: 'Deleted', hint: 'removed records' },
] as const;

@Component({
  selector: 'app-entity-changes-page',
  imports: [EntityHistoryComponent, AuditLogDetailComponent, EntityTypePickerComponent],
  templateUrl: './entity-changes.page.html',
  styleUrl: './entity-changes.page.scss',
})
export class EntityChangesPage {
  private readonly service = inject(AuditLogService);

  protected readonly ranges = RANGES;
  protected readonly kinds = KINDS;
  protected readonly f = { changeLabel, changeTone, clock, shortType };

  // Filters
  protected readonly range = signal<RangeKey>('7d');
  protected readonly entityTypes = signal<string[]>([]);
  /** Hide tokens/security logs/sessions (noise on every sign-in); remembered per browser. */
  protected readonly hideSystem = signal(readHideSystem());
  protected readonly changeType = signal<EntityChangeType | null>(null);
  protected readonly entityId = signal('');
  protected readonly page = signal(0);
  private readonly tick = signal(0);

  // Sheets
  protected readonly entity = signal<EntityRef | null>(null);
  protected readonly request = signal<AuditLogDto | null>(null);

  /** Range / change type / id: what the per-type counts are computed over. */
  private readonly facets = computed(() => {
    this.tick();
    return { ...rangeWindow(this.range()), changeType: this.changeType() ?? undefined, entityId: this.entityId() || undefined };
  });

  private readonly base = computed(() => {
    this.tick();
    return {
      ...rangeWindow(this.range()),
      entityTypeFullNames: this.entityTypes().length ? this.entityTypes() : undefined,
      excludedEntityTypeFullNames: this.hideSystem() ? SYSTEM_ENTITY_TYPES : undefined,
      entityId: this.entityId() || undefined,
    };
  });

  protected readonly typeCounts = rxResource({
    params: () => this.facets(),
    stream: ({ params }) => this.service.getEntityTypeCounts(params),
    defaultValue: [],
  });

  /** One count per change type (maxResultCount 1: only totalCount is used). They double as the change-type filter. */
  protected readonly counts = rxResource({
    params: () => this.base(),
    stream: ({ params }) => forkJoin(KINDS.map(k =>
      this.service.getEntityChanges({ ...params, changeType: k.type, maxResultCount: 1 }).pipe(map(r => r.totalCount))))
      .pipe(map(totals => Object.fromEntries(KINDS.map((k, i) => [k.type, totals[i]])) as Record<EntityChangeType, number>)),
  });

  protected readonly changes = rxResource({
    params: (): GetEntityChangeListInput => ({
      ...this.base(),
      changeType: this.changeType() ?? undefined,
      skipCount: this.page() * PAGE_SIZE,
      maxResultCount: PAGE_SIZE,
    }),
    stream: ({ params }) => this.service.getEntityChanges(params),
  });

  protected readonly total = computed(() => this.changes.value()?.totalCount ?? 0);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  protected readonly groups = computed(() => {
    const groups: { day: string; items: EntityChangeListItemDto[] }[] = [];
    for (const c of this.changes.value()?.items ?? []) {
      const day = dayLabel(c.changeTime);
      if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
      groups.at(-1)!.items.push(c);
    }
    return groups;
  });

  protected set<T>(sig: { set(v: T): void }, value: T) {
    sig.set(value);
    this.page.set(0);
  }

  constructor() {
    effect(() => {
      const hide = this.hideSystem();
      try { localStorage.setItem(HIDE_SYSTEM_KEY, String(hide)); } catch { /* storage blocked */ }
    });
  }

  protected removeType(type: string) {
    this.set(this.entityTypes, this.entityTypes().filter(t => t !== type));
  }

  protected toggleKind(type: EntityChangeType) {
    this.set(this.changeType, this.changeType() === type ? null : type);
  }

  protected text(e: Event) {
    return (e.target as HTMLInputElement).value.trim();
  }

  protected refresh() {
    this.tick.update(t => t + 1);
  }

  protected clearAll() {
    this.entityTypes.set([]); this.changeType.set(null); this.entityId.set(''); this.page.set(0);
  }

  protected readonly filtered = computed(() => !!(this.entityTypes().length || this.changeType() !== null || this.entityId()));

  /** "Email, PhoneNumber +2" for updates; a short phrase otherwise. */
  protected summary(c: EntityChangeListItemDto): string {
    const names = c.propertyChanges.map(p => p.propertyName ?? '?')
      .sort((a, b) => Number(NOISE.has(a)) - Number(NOISE.has(b)));
    if (c.changeType === EntityChangeType.Updated) {
      return names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') : 'no property changes';
    }
    const n = names.length;
    return c.changeType === EntityChangeType.Created ? `with ${n} propert${n === 1 ? 'y' : 'ies'}` : 'removed';
  }

  protected open(c: EntityChangeListItemDto) {
    this.entity.set({ type: c.entityTypeFullName!, id: c.entityId!, focus: c.id });
  }

  protected openRequest(auditLogId: string) {
    this.entity.set(null);
    this.service.get(auditLogId).subscribe(log => this.request.set(log));
  }
}

function readHideSystem(): boolean {
  try { return localStorage.getItem(HIDE_SYSTEM_KEY) !== 'false'; } catch { return true; }
}
