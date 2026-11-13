import { Component, input } from '@angular/core';
import { EntityChangeDto } from '../proxy/abp-admin/services/audit-logs';
import { EntityChangeType } from '../proxy/volo/abp/auditing';
import { plainValue } from '../audit-logs/format';

/** Property-level diff of one entity change: old → new per property. */
@Component({
  selector: 'abp-change-diff',
  template: `
    @let c = change();
    @if (c.propertyChanges.length) {
      <table class="diff">
        <tbody>
          @for (p of c.propertyChanges; track p.id) {
            @let before = plainValue(p.originalValue);
            @let after = plainValue(p.newValue);
            <tr>
              <th scope="row" [title]="p.propertyTypeFullName">{{ p.propertyName }}</th>
              <td>
                @if (c.changeType !== Type.Created) {
                  <span class="old" [class.nil]="before === null">{{ before ?? 'null' }}</span>
                }
                @if (c.changeType === Type.Updated) { <span class="arrow" aria-label="changed to">→</span> }
                @if (c.changeType !== Type.Deleted) {
                  <span class="new" [class.nil]="after === null">{{ after ?? 'null' }}</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="muted none">No property-level changes recorded.</p>
    }
  `,
  styles: `
    :host { display: block; }
    .diff { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
    .diff th { width: 34%; text-align: start; font-weight: 500; color: var(--muted); padding: 6px 10px 6px 0; vertical-align: top; overflow-wrap: anywhere; }
    .diff td { padding: 4px 0; overflow-wrap: anywhere; }
    .diff tr + tr { border-top: 1px dashed var(--border); }
    .old, .new { display: inline; padding: 1px 6px; border-radius: 5px; font-family: var(--mono); font-size: 12px; line-height: 1.9; }
    .old { background: var(--err-soft); color: var(--err); text-decoration: line-through; text-decoration-thickness: 1px; }
    .new { background: var(--ok-soft); color: var(--ok); }
    .nil { opacity: 0.6; font-style: italic; }
    .arrow { margin: 0 6px; color: var(--muted); }
    .none { margin: 6px 0; font-size: 13px; }
    @media (max-width: 560px) {
      .diff tr { display: grid; padding: 6px 0; }
      .diff th { width: auto; padding: 0 0 2px; font-size: 12px; }
    }
  `,
})
export class ChangeDiffComponent {
  readonly change = input.required<EntityChangeDto>();
  protected readonly Type = EntityChangeType;
  protected readonly plainValue = plainValue;
}
