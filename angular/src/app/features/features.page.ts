import { ConfigStateService } from '@abp/ng.core';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { FeatureDto, FeaturesService } from '../proxy/volo/abp/feature-management';
import { apiError } from '../shared/api-error';

/** Host-side features: provider "T" with no tenant key. */
const PROVIDER = 'T';
const HOST = '';

/** The proxy types valueType loosely; this is what ABP actually sends. */
interface ValueType {
  name?: string;
  validator?: { name?: string; properties?: Record<string, unknown> };
  itemSource?: { items?: { value: string; displayText?: { name?: string } }[] };
}
const kind = (f: FeatureDto) => {
  const n = (f.valueType as ValueType | undefined)?.name ?? '';
  return n.startsWith('Toggle') ? 'toggle' : n.startsWith('Selection') ? 'select' : 'text';
};

@Component({
  selector: 'app-features-page',
  template: `
    <div class="page narrow">
      <header class="top">
        <div>
          <h1>Features</h1>
          <p class="muted">Switch application features on or off and set their limits for the host.</p>
        </div>
      </header>

      @if (data.isLoading()) {
        <div class="skeleton rows card">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
      } @else if (data.error()) {
        <div class="card state err">Couldn't load features. <button class="btn" (click)="data.reload()">Retry</button></div>
      } @else if (!groups().length) {
        <div class="card state empty">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
          <b>No host features</b>
          <span class="muted center">No module defines features available to the host. Add a
            <code>FeatureDefinitionProvider</code> to define your own; they show up here automatically.</span>
        </div>
      } @else {
        @for (g of groups(); track g.name) {
          <section class="card group" [attr.aria-labelledby]="'fg-' + g.name">
            <h2 [id]="'fg-' + g.name">{{ g.displayName }}</h2>
            @for (f of g.features; track f.name) {
              @let off = disabled(f);
              <div class="feat" [style.--d]="f.depth ?? 0" [class.off]="off">
                <div class="txt">
                  <b>{{ f.displayName }}</b>
                  @if (f.description) { <small>{{ f.description }}</small> }
                  <small class="mono">{{ f.name }}</small>
                </div>
                @switch (kind(f)) {
                  @case ('toggle') {
                    <input type="checkbox" class="switch" [attr.aria-label]="f.displayName" [disabled]="off"
                           [checked]="value(f) === 'true'" (change)="set(f, $any($event.target).checked ? 'true' : 'false')" />
                  }
                  @case ('select') {
                    <select class="input" [attr.aria-label]="f.displayName" [disabled]="off" (change)="set(f, $any($event.target).value)">
                      @for (o of items(f); track o.value) {
                        <option [value]="o.value" [selected]="o.value === value(f)">{{ o.displayText?.name ?? o.value }}</option>
                      }
                    </select>
                  }
                  @default {
                    @let v = validator(f);
                    <input class="input" [attr.aria-label]="f.displayName" [disabled]="off"
                           [type]="v.name === 'NUMERIC' ? 'number' : 'text'" [attr.min]="v.properties?.['MinValue']" [attr.max]="v.properties?.['MaxValue']"
                           [value]="value(f)" (input)="set(f, $any($event.target).value)" />
                  }
                }
              </div>
            }
          </section>
        }

        <footer class="card bar">
          @if (status(); as s) { <span [class]="'alert tone-' + (s.error ? 'err' : 'ok')" role="status">{{ s.text }}</span> }
          @else { <span class="muted">{{ changes().length ? changes().length + ' unsaved change' + (changes().length === 1 ? '' : 's') : 'No changes' }}</span> }
          <span class="spacer"></span>
          <button class="btn" (click)="reset()" [disabled]="saving()" title="Remove host overrides and use each feature's default">Reset to defaults</button>
          <button class="btn primary" (click)="save()" [disabled]="!changes().length || saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </footer>
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 900px; }
    .center { text-align: center; max-width: 420px; }
    .group { padding: 6px 0; }
    h2 { font-size: 15px; font-weight: 650; padding: 14px 20px 8px; }
    .feat { display: flex; align-items: center; gap: 16px; padding: 12px 20px 12px calc(20px + var(--d) * 24px); border-top: 1px solid var(--border); }
    .feat.off { opacity: 0.55; }
    .txt { flex: 1; display: grid; min-width: 0; }
    .txt small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .feat .input { width: 200px; }
    .bar { position: sticky; bottom: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 16px; }
    .spacer { flex: 1; }
    .skeleton.card { padding: 16px; }
    @media (max-width: 560px) { .feat { flex-wrap: wrap; } .feat .input { width: 100%; } }
  `,
})
export class FeaturesPage {
  private readonly service = inject(FeaturesService);
  private readonly config = inject(ConfigStateService);
  protected readonly kind = kind;

  protected readonly data = rxResource({ stream: () => this.service.get(PROVIDER, HOST) });
  protected readonly groups = computed(() => (this.data.value()?.groups ?? []).filter(g => g.features?.length));
  private readonly all = computed(() => this.groups().flatMap(g => g.features ?? []));
  private readonly original = computed(() => new Map(this.all().map(f => [f.name!, f.value ?? ''])));
  private readonly values = linkedSignal(() => new Map(this.original()));

  protected readonly saving = signal(false);
  protected readonly status = signal<{ text: string; error?: boolean } | null>(null);

  protected readonly changes = computed(() =>
    [...this.values()].filter(([name, value]) => this.original().get(name) !== value).map(([name, value]) => ({ name, value })));

  protected value(f: FeatureDto) {
    return this.values().get(f.name!) ?? '';
  }

  protected set(f: FeatureDto, value: string) {
    this.status.set(null);
    this.values.update(m => new Map(m).set(f.name!, value));
  }

  /** A child of a switched-off toggle can't take effect, so it's locked. */
  protected disabled(f: FeatureDto): boolean {
    const parent = f.parentName ? this.all().find(p => p.name === f.parentName) : undefined;
    return !!parent && ((kind(parent) === 'toggle' && this.value(parent) !== 'true') || this.disabled(parent));
  }

  protected items(f: FeatureDto) {
    return (f.valueType as ValueType | undefined)?.itemSource?.items ?? [];
  }

  protected validator(f: FeatureDto) {
    return (f.valueType as ValueType | undefined)?.validator ?? {};
  }

  protected save() {
    this.run(this.service.update(PROVIDER, HOST, { features: this.changes() }), 'Saved.');
  }

  protected reset() {
    this.run(this.service.delete(PROVIDER, HOST), 'Reset to defaults.');
  }

  private run(req: ReturnType<FeaturesService['delete']>, done: string) {
    this.saving.set(true);
    this.status.set(null);
    req.pipe(switchMap(() => this.config.refreshAppState())).subscribe({
      next: () => { this.saving.set(false); this.data.reload(); this.status.set({ text: done }); },
      error: e => { this.saving.set(false); this.status.set({ text: apiError(e), error: true }); },
    });
  }
}
