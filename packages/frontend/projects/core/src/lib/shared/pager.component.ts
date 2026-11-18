import { LocalizationPipe } from '@abp/ng.core';
import { Component, computed, effect, input, model, Signal, WritableSignal } from '@angular/core';

export const PAGE_SIZES = [10, 20, 50, 100];
const SIZE_KEY = 'abp-admin.page-size';

/** The page size the viewer picked last (any list), else `fallback`. */
export function savedPageSize(fallback = 20): number {
  try { const n = Number(localStorage.getItem(SIZE_KEY)); return PAGE_SIZES.includes(n) ? n : fallback; } catch { return fallback; }
}

/**
 * Moves `page` back to the last page when it runs past the end (its last row was deleted, say),
 * so a list never strands the viewer on an empty page without a pager. Call from a field initializer.
 */
export function keepPageInRange(page: WritableSignal<number>, size: Signal<number>, total: Signal<number>) {
  return effect(() => {
    const t = total(), last = Math.max(0, Math.ceil(t / size()) - 1);
    if (t && page() > last) page.set(last);
  });
}

/**
 * Footer pager for every list: "1–20 of 135", first/previous, page numbers, next/last, and the page size.
 * `page` is 0-based; changing the size goes back to the first page and is remembered for all lists.
 * `<abp-pager [total]="total()" [(page)]="page" [(size)]="size" />`
 */
@Component({
  selector: 'abp-pager',
  imports: [LocalizationPipe],
  host: { class: 'pager', '[hidden]': '!total()' },
  template: `
    <span class="muted">{{ total() ? ('AbpAdmin::Pager:Range' | abpLocalization: from().toString() : to().toString() : total().toString()) : ('AbpAdmin::Pager:None' | abpLocalization) }}</span>
    <span class="nav">
      <label class="size"><span class="muted">{{ 'AbpAdmin::Pager:PerPage' | abpLocalization }}</span>
        <select class="input" [value]="size()" (change)="setSize(+$any($event.target).value)" [attr.aria-label]="'AbpAdmin::Pager:PerPage' | abpLocalization">
          @for (n of sizes; track n) { <option [value]="n" [selected]="n === size()">{{ n }}</option> }
        </select></label>
      @if (pages() > 1) {
        <button type="button" class="btn sm" [disabled]="page() === 0" (click)="go(0)" [attr.aria-label]="'AbpAdmin::Pager:First' | abpLocalization">«</button>
        <button type="button" class="btn sm" [disabled]="page() === 0" (click)="go(page() - 1)" [attr.aria-label]="'AbpAdmin::Common:Previous' | abpLocalization">‹</button>
        @for (p of numbers(); track $index) {
          @if (p < 0) { <span class="gap" aria-hidden="true">…</span> }
          @else { <button type="button" class="btn sm" [class.primary]="p === page()" [attr.aria-current]="p === page() ? 'page' : null" (click)="go(p)">{{ p + 1 }}</button> }
        }
        <button type="button" class="btn sm" [disabled]="page() + 1 >= pages()" (click)="go(page() + 1)" [attr.aria-label]="'AbpAdmin::Common:Next' | abpLocalization">›</button>
        <button type="button" class="btn sm" [disabled]="page() + 1 >= pages()" (click)="go(pages() - 1)" [attr.aria-label]="'AbpAdmin::Pager:Last' | abpLocalization">»</button>
      }
    </span>
  `,
  styles: `
    :host[hidden] { display: none; }
    :host { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-top: 1px solid var(--border); }
    .nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .size { display: flex; align-items: center; gap: 8px; margin-inline-end: 8px; white-space: nowrap; }
    .size .input { width: auto; height: 30px; padding: 0 8px; }
    .btn.sm { min-width: 32px; justify-content: center; }
    .gap { padding: 0 4px; color: var(--muted); }
  `,
})
export class PagerComponent {
  readonly total = input(0);
  readonly page = model(0);
  readonly size = model(20);
  protected readonly sizes = PAGE_SIZES;

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  protected readonly from = computed(() => Math.min(this.total(), this.page() * this.size() + 1));
  protected readonly to = computed(() => Math.min(this.total(), (this.page() + 1) * this.size()));

  /** First, last, and two either side of the current page; -1 marks a gap. */
  protected readonly numbers = computed(() => {
    const n = this.pages(), cur = this.page(), out: number[] = [];
    for (let p = 0; p < n; p++) {
      if (p === 0 || p === n - 1 || Math.abs(p - cur) <= 2) out.push(p);
      else if (out.at(-1) !== -1) out.push(-1);
    }
    return out;
  });

  protected go(p: number) {
    this.page.set(Math.max(0, Math.min(p, this.pages() - 1)));
  }

  protected setSize(n: number) {
    try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* storage blocked */ }
    this.size.set(n);
    this.page.set(0);
  }
}
