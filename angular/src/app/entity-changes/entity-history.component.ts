import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuditLogService } from '../proxy/services/audit-logs';
import { EntityChangeType } from '../proxy/volo/abp/auditing';
import { relative, shortType, stamp } from '../audit-logs/format';
import { EntityTimelineComponent } from './entity-timeline.component';

export interface EntityRef {
  type: string;
  id: string;
  /** Change to highlight and scroll to. */
  focus?: string;
}

/** Side sheet with the full life of one entity: every create, update and delete, oldest first. */
@Component({
  selector: 'app-entity-history',
  imports: [EntityTimelineComponent],
  template: `
    <dialog #dialog class="sheet" (cancel)="$event.preventDefault(); closed.emit()" (click)="onBackdrop($event)" aria-labelledby="eh-title">
      @if (entity(); as e) {
        <header class="head">
          <div class="title-row">
            <span class="avatar sq" aria-hidden="true">{{ shortType(e.type)[0] }}</span>
            <div class="title">
              <h2 id="eh-title">{{ shortType(e.type) }}</h2>
              <span class="muted small" [title]="e.type">{{ e.type }}</span>
            </div>
            <button class="icon-btn" (click)="closed.emit()" aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <button class="id mono" (click)="copy(e.id)" title="Copy id">
            #{{ e.id }} <span class="muted">{{ copied() ? 'copied' : 'copy' }}</span>
          </button>

          @if (summary(); as s) {
            <dl class="facts">
              <div><dt>Created</dt><dd>{{ s.created ? stamp(s.created.changeTime, day) : 'before auditing' }}
                @if (s.created) { <span class="muted">by {{ s.created.userName ?? 'system' }}</span> }</dd></div>
              <div><dt>Updates</dt><dd>{{ s.updates }}</dd></div>
              <div><dt>{{ s.deleted ? 'Deleted' : 'Last change' }}</dt>
                <dd>{{ relative(s.last.changeTime) }} <span class="muted">by {{ s.last.userName ?? 'system' }}</span></dd></div>
              <div><dt>Status</dt><dd><span [class]="'pill tone-' + (s.deleted ? 'err' : 'ok')">{{ s.deleted ? 'Deleted' : 'Exists' }}</span></dd></div>
            </dl>
          }
        </header>

        <div class="body">
          @if (history.isLoading()) {
            <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
          } @else if (history.error()) {
            <div class="state err">Couldn't load the history. <button class="btn" (click)="history.reload()">Retry</button></div>
          } @else {
            <app-entity-timeline [changes]="history.value()" [focus]="e.focus ?? null" [canOpenRequest]="true"
                                 (openRequest)="openRequest.emit($event)" />
          }
        </div>
      }
    </dialog>
  `,
  styles: `
    .sheet { width: min(720px, 100vw); }
    .head { position: sticky; top: 0; z-index: 2; padding: 18px 22px 14px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .title-row { display: flex; align-items: center; gap: 12px; }
    .avatar.sq { width: 38px; height: 38px; border-radius: 10px; font-size: 16px; }
    .title { flex: 1; min-width: 0; display: grid; }
    h2 { font-size: 17px; font-weight: 650; }
    .small { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icon-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .id { margin-top: 10px; max-width: 100%; border: 0; padding: 0; background: none; color: var(--text); font-size: 12.5px;
      cursor: pointer; overflow-wrap: anywhere; text-align: start; }
    .id:hover .muted { color: var(--accent); }
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 18px; margin: 14px 0 0; }
    .facts dt { color: var(--muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    .facts dd { margin: 2px 0 0; font-size: 13.5px; }
    .body { padding: 20px 22px 40px; }
    @media (max-width: 720px) { .head, .body { padding-inline: 14px; } }
  `,
})
export class EntityHistoryComponent {
  private readonly service = inject(AuditLogService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly entity = input<EntityRef | null>(null);
  readonly closed = output<void>();
  readonly openRequest = output<string>();

  protected readonly copied = signal(false);
  protected readonly shortType = shortType;
  protected readonly stamp = stamp;
  protected readonly relative = relative;
  protected readonly day: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

  protected readonly history = rxResource({
    params: () => {
      const e = this.entity();
      return e ? { id: e.id, type: e.type } : undefined;
    },
    stream: ({ params }) => this.service.getEntityHistory(params.id, params.type),
    defaultValue: [],
  });

  protected readonly summary = computed(() => {
    const list = this.history.value();
    if (!list.length) return null;
    const last = list.at(-1)!;
    return {
      created: list.find(c => c.changeType === EntityChangeType.Created),
      updates: list.filter(c => c.changeType === EntityChangeType.Updated).length,
      deleted: last.changeType === EntityChangeType.Deleted,
      last,
    };
  });

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.entity()) {
        this.copied.set(false);
        if (!el.open) el.showModal();
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected onBackdrop(e: MouseEvent) {
    if (e.target === this.dialog().nativeElement) this.closed.emit();
  }

  protected copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => this.copied.set(true));
  }
}
