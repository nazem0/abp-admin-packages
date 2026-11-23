import { LocalizationPipe } from '@abp/ng.core';
import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export interface LegendItem {
  /** Inner SVG markup (24×24, stroked), the same as the row button's. */
  svg: string;
  labelKey: string;
  hintKey: string;
}

/** Row action icons, shared by the legends. Keep in sync with the row buttons' SVGs. */
export const ICONS = {
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />',
  lock: '<path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" />',
  unlock: '<path d="M7 11V7a5 5 0 0 1 9.6-2M5 11h14v10H5z" />',
  signIns: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />',
  claims: '<path d="M20 12 12 20 4 12V4h8z" /><circle cx="8.5" cy="8.5" r="1.5" />',
  cache: '<path d="M20 20H9l-5-5 10-10 7 7-8 8M9 9l7 7" />',
  history: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />',
  permissions: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" />',
  delete: '<path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />',
  moveUsers: '<path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 11-4.7M16 14h6M19 11l3 3-3 3" />',
  database: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />',
  features: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4" />',
  admins: '<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 8h5M19.5 5.5v5" />',
};

/** An always-visible key to a list's row action icons: icon + name, the longer explanation on hover. */
@Component({
  selector: 'app-icon-legend',
  imports: [LocalizationPipe],
  template: `
    <ul class="legend" [attr.aria-label]="'::Legend:Title' | abpLocalization">
      @for (i of rows(); track i.labelKey) {
        <li [title]="i.hintKey | abpLocalization">
          <svg viewBox="0 0 24 24" aria-hidden="true" [innerHTML]="i.html"></svg>{{ i.labelKey | abpLocalization }}
        </li>
      }
    </ul>
  `,
  styles: `
    .legend { list-style: none; margin: 0; padding: 8px 16px; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px;
      border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font-size: 12px; color: var(--muted); }
    li { display: inline-flex; align-items: center; gap: 5px; cursor: help; white-space: nowrap; }
    svg { width: 14px; height: 14px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  `,
})
export class IconLegendComponent {
  private readonly sanitizer = inject(DomSanitizer);
  readonly items = input.required<LegendItem[]>();

  /** The markup is ours (ICONS), never user input. */
  protected readonly rows = computed(() =>
    this.items().map(i => ({ ...i, html: this.sanitizer.bypassSecurityTrustHtml(i.svg) as SafeHtml })));
}
