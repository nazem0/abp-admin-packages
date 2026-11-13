import { Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';
import { EntityTypeCountDto } from '../proxy/services/audit-logs';
import { shortType } from '../audit-logs/format';

/** Framework bookkeeping that floods the feed on every sign-in; hidden unless asked for. */
export const SYSTEM_ENTITY_TYPES = [
  'Volo.Abp.OpenIddict.Tokens.OpenIddictToken',
  'Volo.Abp.OpenIddict.Authorizations.OpenIddictAuthorization',
  'Volo.Abp.Identity.IdentitySecurityLog',
  'Volo.Abp.Identity.IdentityUserToken',
  'Volo.Abp.Identity.IdentitySession',
];

/** "Volo.Abp.Identity.IdentityUser" → "Identity"; "Shop.Sales.Order" → "Shop". */
export const moduleOf = (type: string) => {
  const parts = type.split('.');
  return parts[0] === 'Volo' && parts[1] === 'Abp' && parts.length > 3 ? parts[2] : parts.length > 1 ? parts[0] : 'Other';
};

/**
 * Multi-select entity type filter: a trigger button plus a native `popover` panel (top layer, Esc and
 * click-outside for free) with search, module groups, per-type change counts and a "hide system" switch.
 */
@Component({
  selector: 'app-entity-type-picker',
  host: { '(window:resize)': 'place()', '(window:scroll)': 'place()' },
  template: `
    <button #trigger type="button" class="trigger" [class.on]="selected().length" (click)="toggle()"
            aria-haspopup="dialog" [attr.aria-expanded]="open()" aria-controls="etp-panel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg>
      <span class="lbl">{{ label() }}</span>
      @if (selected().length > 1) { <span class="n">{{ selected().length }}</span> }
      <svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>

    <div #panel id="etp-panel" popover="auto" class="panel" role="dialog" aria-label="Filter by entity type"
         (toggle)="onToggle($event)" (keydown)="onKey($event)">
      <div class="head">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input #q class="input" type="search" placeholder="Search entity types…" aria-label="Search entity types" autocomplete="off"
                 [value]="query()" (input)="query.set($any($event.target).value)" />
        </label>
        <label class="sys">
          <input type="checkbox" class="switch" [checked]="hideSystem()" (change)="hideSystem.set($any($event.target).checked)" />
          <span>Hide system entities <small>tokens, security logs, sessions{{ hiddenCount() ? ' · ' + hiddenCount() + ' hidden' : '' }}</small></span>
        </label>
      </div>

      <div class="body">
        @if (!query()) {
          <button type="button" class="all" [class.on]="!selected().length" (click)="selected.set([])">
            <span class="box" aria-hidden="true">@if (!selected().length) { ✓ }</span>
            <b>All entity types</b>
            <span class="count">{{ total() }}</span>
          </button>
        }
        @for (g of groups(); track g.name) {
          <section>
            <header>
              <span>{{ g.name }}</span>
              <button type="button" class="link" (click)="toggleGroup(g.types)">{{ allIn(g.types) ? 'Clear' : 'Select all' }}</button>
            </header>
            @for (t of g.types; track t.entityTypeFullName) {
              <label class="opt" [class.on]="isOn(t)">
                <input type="checkbox" [checked]="isOn(t)" (change)="flip(t.entityTypeFullName!)" />
                <span class="txt"><b>{{ short(t) }}</b><small>{{ t.entityTypeFullName }}</small></span>
                <span class="bar" aria-hidden="true"><i [style.width.%]="(t.count! / max()) * 100"></i></span>
                <span class="count">{{ t.count }}</span>
              </label>
            }
          </section>
        } @empty {
          <p class="none">{{ query() ? 'No entity type matches “' + query() + '”.' : 'No entity changes in this range.' }}</p>
        }
      </div>

      <footer>
        <span class="muted">{{ selected().length ? selected().length + ' selected' : 'Showing all types' }}</span>
        @if (selected().length) { <button type="button" class="btn sm" (click)="selected.set([])">Clear</button> }
        <button type="button" class="btn sm primary" (click)="close()">Done</button>
      </footer>
    </div>
  `,
  styles: `
    :host { display: contents; }
    .trigger { display: inline-flex; align-items: center; gap: 8px; height: 34px; max-width: 280px; padding: 0 10px; border: 1px solid var(--border);
      border-radius: 9px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
    .trigger:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
    .trigger.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
    .trigger svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .trigger .caret { opacity: 0.6; }
    .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .n { padding: 0 6px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; }

    .panel { position: fixed; inset: auto; margin: 0; padding: 0; width: min(440px, calc(100vw - 24px)); max-height: min(560px, 70vh);
      border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text);
      box-shadow: 0 24px 60px -18px rgb(0 0 0 / 0.4); overflow: hidden; }
    .panel:popover-open { display: flex; flex-direction: column; animation: drop 0.14s ease-out; }
    @keyframes drop { from { transform: translateY(-4px); opacity: 0; } }
    @keyframes rise { from { transform: translateY(24px); } }
    .head { display: grid; gap: 10px; padding: 12px; border-bottom: 1px solid var(--border); }
    .search { position: relative; display: flex; }
    .search svg { position: absolute; left: 10px; top: 9px; width: 16px; height: 16px; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
    .search .input { width: 100%; padding-inline-start: 32px; }
    .sys { display: flex; align-items: center; gap: 10px; font-size: 13px; cursor: pointer; }
    .sys small { display: block; color: var(--muted); font-size: 11.5px; }
    .switch { width: 34px; height: 20px; }

    .body { flex: 1; overflow: auto; padding: 6px; }
    section header { position: sticky; top: -6px; z-index: 1; display: flex; justify-content: space-between; align-items: center; padding: 10px 8px 4px;
      background: var(--surface); font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    section header .link { text-transform: none; letter-spacing: 0; font-size: 12px; font-weight: 500; text-decoration: none; color: var(--accent); }
    .opt, .all { display: grid; grid-template-columns: 18px minmax(0, 1fr) 64px 40px; align-items: center; gap: 10px; width: 100%; padding: 7px 8px;
      border: 0; border-radius: 9px; background: none; color: var(--text); font: inherit; text-align: start; cursor: pointer; }
    .opt:hover, .all:hover, .opt:focus-within { background: var(--surface-2); }
    .opt.on { background: var(--accent-soft); }
    .opt input { margin: 0; width: 16px; height: 16px; accent-color: var(--accent); }
    .all { grid-template-columns: 18px minmax(0, 1fr) 40px; }
    .box { display: grid; place-items: center; width: 16px; height: 16px; border: 1.5px solid var(--border); border-radius: 4px; font-size: 11px; color: #fff; }
    .all.on .box { background: var(--accent); border-color: var(--accent); }
    .txt { display: grid; min-width: 0; }
    .txt b { font-weight: 550; font-size: 13.5px; }
    .txt small { color: var(--muted); font: 11px var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
    .opt:hover .bar, .opt.on .bar { background: var(--surface); }
    .bar i { display: block; height: 100%; border-radius: 3px; background: color-mix(in srgb, var(--accent) 55%, transparent); }
    .count { text-align: end; font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .none { padding: 28px 12px; text-align: center; color: var(--muted); margin: 0; }
    footer { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--border); }
    footer .muted { flex: 1; font-size: 12.5px; }

    /* Phone: bottom sheet */
    @media (max-width: 560px) {
      .panel { inset: auto 0 0 0 !important; width: 100vw; max-height: 80vh; border-radius: 16px 16px 0 0; }
      .panel:popover-open { animation-name: rise; }
      .panel::backdrop { background: rgb(10 14 22 / 0.45); }
      .opt { grid-template-columns: 18px minmax(0, 1fr) 40px; }
      .bar { display: none; }
    }
  `,
})
export class EntityTypePickerComponent {
  /** Change counts per type for the current range/change type/id. */
  readonly counts = input<EntityTypeCountDto[]>([]);
  readonly selected = model<string[]>([]);
  readonly hideSystem = model(true);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly q = viewChild.required<ElementRef<HTMLInputElement>>('q');

  protected readonly open = signal(false);
  protected readonly query = signal('');

  private readonly shown = computed(() =>
    this.counts().filter(t => !this.hideSystem() || !SYSTEM_ENTITY_TYPES.includes(t.entityTypeFullName!)));
  protected readonly hiddenCount = computed(() => this.counts().length - this.shown().length);
  protected readonly total = computed(() => this.shown().reduce((n, t) => n + (t.count ?? 0), 0));
  protected readonly max = computed(() => Math.max(1, ...this.shown().map(t => t.count ?? 0)));

  /** Grouped by module; selected types stay visible even when the search doesn't match them. */
  protected readonly groups = computed(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map<string, EntityTypeCountDto[]>();
    for (const t of this.shown()) {
      const name = t.entityTypeFullName!;
      if (words.length && !words.every(w => name.toLowerCase().includes(w))) continue;
      const mod = moduleOf(name);
      map.set(mod, [...(map.get(mod) ?? []), t]);
    }
    return [...map].map(([name, types]) => ({ name, types }))
      .sort((a, b) => sum(b.types) - sum(a.types));
  });

  protected readonly label = computed(() => {
    const s = this.selected();
    if (!s.length) return 'All entity types';
    return s.length === 1 ? shortType(s[0]) : `${shortType(s[0])} +${s.length - 1}`;
  });

  protected short(t: EntityTypeCountDto) {
    return shortType(t.entityTypeFullName);
  }

  protected isOn(t: EntityTypeCountDto) {
    return this.selected().includes(t.entityTypeFullName!);
  }

  protected flip(type: string) {
    this.selected.update(s => (s.includes(type) ? s.filter(x => x !== type) : [...s, type]));
  }

  protected allIn(types: EntityTypeCountDto[]) {
    return types.every(t => this.isOn(t));
  }

  protected toggleGroup(types: EntityTypeCountDto[]) {
    const names = types.map(t => t.entityTypeFullName!);
    this.selected.update(s => (this.allIn(types) ? s.filter(x => !names.includes(x)) : [...new Set([...s, ...names])]));
  }

  protected toggle() {
    this.panel().nativeElement.togglePopover();
  }

  protected close() {
    this.panel().nativeElement.hidePopover();
  }

  protected onToggle(e: Event) {
    const isOpen = (e as ToggleEvent).newState === 'open';
    this.open.set(isOpen);
    if (isOpen) {
      this.query.set('');
      this.place();
      this.q().nativeElement.focus();
    } else {
      this.trigger().nativeElement.focus();
    }
  }

  /** Anchor the top-layer panel under the trigger, flipping/clamping to stay on screen. */
  protected place() {
    if (!this.open() || innerWidth <= 560) return;
    const r = this.trigger().nativeElement.getBoundingClientRect();
    const el = this.panel().nativeElement;
    const w = el.offsetWidth;
    const left = Math.min(Math.max(12, r.left), innerWidth - w - 12);
    const below = innerHeight - r.bottom;
    el.style.left = `${left}px`;
    if (below >= 320 || below >= r.top) { el.style.top = `${r.bottom + 6}px`; el.style.bottom = 'auto'; }
    else { el.style.bottom = `${innerHeight - r.top + 6}px`; el.style.top = 'auto'; }
  }

  /** Arrow keys move between the search box and the options. */
  protected onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [this.q().nativeElement, ...this.panel().nativeElement.querySelectorAll<HTMLElement>('.all, .opt input')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    e.preventDefault();
    next?.focus();
  }
}

const sum = (types: EntityTypeCountDto[]) => types.reduce((n, t) => n + (t.count ?? 0), 0);
