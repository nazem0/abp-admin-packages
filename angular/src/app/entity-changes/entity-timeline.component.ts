import { Component, ElementRef, afterRenderEffect, inject, input, output } from '@angular/core';
import { EntityChangeListItemDto } from '../proxy/services/audit-logs';
import { changeLabel, changeTone, methodTone, stamp } from '../audit-logs/format';
import { ChangeDiffComponent } from './change-diff.component';

/** Vertical timeline of an entity's changes, oldest first, each expandable to its property diff. */
@Component({
  selector: 'app-entity-timeline',
  imports: [ChangeDiffComponent],
  template: `
    <ol class="timeline">
      @for (e of changes(); track e.id) {
        @let highlighted = e.auditLogId === currentRequest() || e.id === focus();
        <li [class]="'tone-' + changeTone[e.changeType]" [class.current]="highlighted" [attr.data-change]="e.id">
          <details [open]="highlighted || changes().length === 1">
            <summary class="tl-head">
              <b>{{ changeLabel[e.changeType] }}</b>
              <span class="muted">by {{ e.userName ?? 'system' }} · {{ stamp(e.changeTime, when) }}</span>
              <span class="muted props">{{ e.propertyChanges.length }} propert{{ e.propertyChanges.length === 1 ? 'y' : 'ies' }}</span>
              @if (e.auditLogId === currentRequest()) { <span class="pill xs tone-info">this request</span> }
            </summary>
            @if (e.url && canOpenRequest()) {
              <button class="req" (click)="openRequest.emit(e.auditLogId!)" title="Open the request that made this change">
                <span [class]="'method tone-' + methodTone(e.httpMethod)">{{ e.httpMethod }}</span>
                <span class="mono">{{ e.url }}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
              </button>
            }
            <app-change-diff [change]="e" />
          </details>
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: block; }
    .timeline { list-style: none; margin: 0; padding: 0 0 0 18px; position: relative; }
    .timeline::before { content: ''; position: absolute; inset: 6px auto 6px 5px; border-inline-start: 2px solid var(--border); }
    li { position: relative; padding: 0 0 14px 12px; scroll-margin: 90px; }
    li::before {
      content: ''; position: absolute; left: -18px; top: 5px; width: 12px; height: 12px; border-radius: 50%;
      background: var(--surface); border: 2.5px solid var(--tone);
    }
    li.current::before { background: var(--tone); box-shadow: 0 0 0 4px var(--tone-soft); }
    .tl-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 1px 0 4px; cursor: pointer; list-style: none; }
    .tl-head::-webkit-details-marker { display: none; }
    .tl-head b { color: var(--tone); }
    .tl-head .props { margin-inline-start: auto; font-size: 12px; }
    .tl-head::after { content: '▸'; color: var(--muted); font-size: 11px; transition: transform 0.15s; }
    details[open] > .tl-head::after { transform: rotate(90deg); }
    details[open] > .tl-head { margin-bottom: 6px; }
    .pill.xs { height: 19px; font-size: 11px; padding: 0 7px; }
    .req {
      display: inline-flex; align-items: center; gap: 8px; max-width: 100%; margin: 0 0 8px; padding: 4px 10px;
      border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); color: var(--text);
      font: inherit; font-size: 12px; cursor: pointer;
    }
    .req:hover { border-color: var(--accent); color: var(--accent); }
    .req .method { color: var(--tone); }
    .req .mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .req svg { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
  `,
})
export class EntityTimelineComponent {
  readonly changes = input.required<EntityChangeListItemDto[]>();
  /** Highlight (and expand) the changes made by this request. */
  readonly currentRequest = input<string | null | undefined>(null);
  /** Highlight, expand and scroll to this change. */
  readonly focus = input<string | null>(null);
  readonly canOpenRequest = input(false);
  readonly openRequest = output<string>();

  protected readonly changeLabel = changeLabel;
  protected readonly changeTone = changeTone;
  protected readonly methodTone = methodTone;
  protected readonly stamp = stamp;
  protected readonly when: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    afterRenderEffect(() => {
      const id = this.focus();
      if (id && this.changes().length) {
        host.nativeElement.querySelector(`[data-change="${id}"]`)?.scrollIntoView({ block: 'center' });
      }
    });
  }
}
