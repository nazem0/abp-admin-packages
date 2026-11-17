import { LocalizationPipe, LocalizationService } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, map, of } from 'rxjs';
import { EntityExplorerService, EntityFieldDto, EntityInfoDto, EntitySchemaDto } from '../proxy/services/entities';
import { SheetDirective } from '../shared/sheet.directive';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

type Row = Record<string, any>;
type Edit = Row | 'new';
/** Foreign-key field → lookup options (key → display text). */
type Refs = Record<string, { id: string; label: string }[]>;

/** Row value by schema field name; tolerates camelCased keys from the JSON serializer. */
const cell = (row: Row, name: string) => (name in row ? row[name] : row[name[0].toLowerCase() + name.slice(1)]);

/** Form generated at runtime from the entity schema: one control per field type. */
@Component({
  selector: 'app-entity-form',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!row()" (dismiss)="closed.emit()" aria-labelledby="ef-title">
      @if (row() && schema(); as s) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="ef-title">{{ x ? s.name : ('::Entities:Form:New' | abpLocalization: s.name!) }} @if (x) { <small class="mono">{{ key(x) }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            @for (fld of s.fields; track fld.name) {
              @if (x || !fld.readOnly) {
              <label class="field" [class.check]="fld.type === 'boolean'">
                <span>{{ fld.name }}
                  @if (fld.required && !locked(fld) && fld.type === 'string') { <i>*</i> }
                  <small class="muted mono">{{ fld.type }}{{ fld.maxLength ? ' · ' + fld.maxLength : '' }}{{ fld.reference ? ' → ' + fld.reference.entity : '' }}</small></span>
                @switch (control(fld)) {
                  @case ('checkbox') { <input type="checkbox" [name]="fld.name!" [checked]="!!value(fld)" [disabled]="locked(fld)" /> }
                  @case ('select') {
                    <select class="input" [name]="fld.name!" [disabled]="locked(fld)">
                      @if (!fld.required || !x) { <option value="">—</option> }
                      @for (o of fld.enumValues; track o.value) { <option [value]="o.value" [selected]="x && '' + value(fld) === '' + o.value">{{ o.name }}</option> }
                    </select>
                  }
                  @case ('textarea') { <textarea class="input" [class.mono]="fld.type === 'json'" rows="4" [name]="fld.name!" [disabled]="locked(fld)">{{ text(fld) }}</textarea> }
                  @default {
                    <input class="input" [class.mono]="fld.type === 'guid'" [type]="inputType(fld)" [name]="fld.name!" [value]="text(fld)" [disabled]="locked(fld)"
                           [attr.maxlength]="fld.maxLength" [attr.step]="fld.type === 'number' ? 'any' : fld.type === 'datetime' ? 1 : null"
                           [attr.list]="fld.reference ? 'ef-ref-' + fld.name : null" [required]="fld.required && fld.type === 'string' && !locked(fld)"
                           [placeholder]="fld.isKey && !x ? ('::Entities:AutoKey' | abpLocalization) : ''" autocomplete="off" />
                    @if (fld.reference) {
                      <datalist [id]="'ef-ref-' + fld.name">@for (o of refs()[fld.name!] ?? []; track o.id) { <option [value]="o.id">{{ o.label }}</option> }</datalist>
                    }
                  }
                }
                @if (fld.readOnly) { <small>{{ '::Entities:ReadOnlyHint' | abpLocalization }}</small> }
              </label>
              }
            }
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            @if (x && info()?.canDelete) {
              @if (confirming()) {
                <span class="confirm">{{ '::Entities:DeleteConfirm' | abpLocalization }}
                  <button type="button" class="btn sm danger" (click)="remove(x)">{{ '::Common:Delete' | abpLocalization }}</button>
                  <button type="button" class="btn sm" (click)="confirming.set(false)">{{ '::Common:Cancel' | abpLocalization }}</button></span>
              } @else {
                <button type="button" class="btn danger" (click)="confirming.set(true)">{{ '::Common:Delete' | abpLocalization }}</button>
              }
            }
            <button type="button" class="btn" (click)="closed.emit()">{{ '::Common:Cancel' | abpLocalization }}</button>
            @if (writable()) {
              <button class="btn primary" [disabled]="saving()">{{ saving() ? ('::Common:Saving' | abpLocalization) : x ? ('::Common:Save' | abpLocalization) : ('::Common:Create' | abpLocalization) }}</button>
            }
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    textarea.input { height: auto; padding: 8px 11px; resize: vertical; line-height: 1.5; }
    .field.check { flex-direction: row-reverse; justify-content: flex-end; align-items: center; gap: 10px; }
    .field small.mono { font-weight: 400; margin-inline-start: 6px; }
    .sh-foot .alert { flex: 1; }
  `,
})
export class EntityFormComponent {
  private readonly service = inject(EntityExplorerService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  readonly schema = input<EntitySchemaDto | undefined>();
  readonly info = input<EntityInfoDto | undefined>();
  readonly row = input<Edit | null>(null);
  readonly refs = input<Refs>({});
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly existing = computed(() => { const r = this.row(); return r && r !== 'new' ? r : null; });
  protected readonly writable = computed(() => (this.existing() ? this.info()?.canUpdate : this.info()?.canCreate) ?? false);
  protected readonly error = linkedSignal<Edit | null, string | null>({ source: this.row, computation: () => null });
  protected readonly confirming = linkedSignal<Edit | null, boolean>({ source: this.row, computation: () => false });
  protected readonly saving = signal(false);


  protected key(row: Row) { return this.schema()!.keyFields!.map(k => cell(row, k)).join(', '); }
  protected value(f: EntityFieldDto) { const x = this.existing(); return x ? cell(x, f.name!) : undefined; }
  protected locked(f: EntityFieldDto) { return !this.writable() || !!f.readOnly || (!!f.isKey && !!this.existing()); }

  protected control(f: EntityFieldDto) {
    if (f.type === 'boolean') return 'checkbox';
    if (f.type === 'enum') return 'select';
    if (f.type === 'json' || (f.type === 'string' && (f.maxLength == null || f.maxLength > 512))) return 'textarea';
    return 'input';
  }

  protected inputType(f: EntityFieldDto) {
    return f.type === 'integer' || f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text';
  }

  protected text(f: EntityFieldDto) {
    const v = this.value(f);
    if (v == null) return '';
    if (f.type === 'json') return JSON.stringify(v, null, 2);
    if (f.type === 'datetime') return String(v).slice(0, 19); // Stored UTC (AbpClockOptions.Kind = Utc).
    return String(v);
  }

  protected save(form: HTMLFormElement) {
    const isNew = !this.existing();
    const fd = new FormData(form);
    const values: Record<string, unknown> = {};
    try {
      for (const f of this.schema()!.fields!) {
        if (this.locked(f)) continue;
        if (f.type === 'boolean') {
          if (isNew || fd.has(f.name!) !== !!this.value(f)) values[f.name!] = fd.has(f.name!);
          continue;
        }
        const raw = String(fd.get(f.name!) ?? '');
        if (!isNew && raw === this.text(f)) continue; // Untouched: don't round-trip (dates would lose sub-seconds).
        if (raw === '') {
          if (!isNew) values[f.name!] = f.type === 'string' && f.required ? '' : null; // New rows keep constructor defaults.
          continue;
        }
        values[f.name!] =
          f.type === 'integer' || f.type === 'number' || f.type === 'enum' ? Number(raw)
          : f.type === 'datetime' ? new Date(raw + 'Z').toISOString()
          : f.type === 'json' ? parseJson(raw, f.name!)
          : raw;
      }
    } catch (e) {
      this.error.set(this.l.instant('::Entities:InvalidJson', (e as Error).message));
      return;
    }

    const x = this.existing();
    if (x) values['ConcurrencyStamp'] = cell(x, 'ConcurrencyStamp');
    const entity = this.schema()!.name!;
    this.saving.set(true);
    this.error.set(null);
    (x ? this.service.update(entity, this.key(x), { values }) : this.service.create(entity, { values })).subscribe({
      next: () => { this.saving.set(false); this.toaster.ok(this.l.instant(x ? '::Entities:Form:Saved' : '::Entities:Form:Created')); this.saved.emit(); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }

  protected remove(x: Row) {
    this.service.delete(this.schema()!.name!, this.key(x)).subscribe({
      next: () => { this.toaster.ok(this.l.instant('::Entities:Deleted')); this.saved.emit(); },
      error: e => { this.confirming.set(false); this.error.set(apiError(e)); },
    });
  }
}

function parseJson(raw: string, field: string) {
  try { return JSON.parse(raw); } catch { throw new Error(field); }
}

/**
 * Entity explorer: pick any entity exposed in EntityExplorerOptions, find rows by key or text, and edit them as
 * database rows. Columns and the form come from the entity's schema at runtime.
 */
@Component({
  selector: 'app-entities-page',
  imports: [EntityFormComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ '::Entities:Title' | abpLocalization }}</h1>
          <p class="muted">{{ '::Entities:Subtitle' | abpLocalization }}</p>
        </div>
        @if (info()?.canCreate) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ '::Entities:New' | abpLocalization }}
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <select class="input" [attr.aria-label]="'::Entities:Entity' | abpLocalization" (change)="choose($any($event.target).value)">
            @for (e of entities.value() ?? []; track e.name) { <option [value]="e.name" [selected]="e.name === selected()">{{ e.name }}</option> }
          </select>
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" [value]="filter()" placeholder="{{ '::Entities:SearchPlaceholder' | abpLocalization }}" [attr.aria-label]="'::Common:Search' | abpLocalization"
                   (change)="search($any($event.target).value)" (search)="search($any($event.target).value)" />
          </label>
        </div>
        @if (entities.value()?.length === 0) {
          <div class="state empty"><b>{{ '::Entities:NoEntities' | abpLocalization }}</b><span class="muted mono">Configure&lt;EntityExplorerOptions&gt;(o =&gt; o.Add&lt;Book&gt;())</span></div>
        } @else if (list.error() || schema.error()) {
          <div class="state err">{{ '::Entities:LoadError' | abpLocalization }} <button class="btn" (click)="list.reload(); schema.reload()">{{ '::Common:Retry' | abpLocalization }}</button></div>
        } @else if ((list.isLoading() || schema.isLoading()) && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty"><b>{{ '::Entities:Empty' | abpLocalization }}</b></div>
        } @else {
          <div class="scroll">
            <table class="table">
              <thead><tr>
                @for (c of columns(); track c.name) {
                  <th><button class="sort" (click)="sort(c.name!)">{{ c.name }} {{ sortMark(c.name!) }}</button></th>
                }
              </tr></thead>
              <tbody>
                @for (r of rows(); track $index) {
                  <tr class="clickable" tabindex="0" (click)="editing.set(r)" (keydown.enter)="editing.set(r)">
                    @for (c of columns(); track c.name) { <td [class.mono]="(c.type === 'guid' && !c.reference) || c.isKey">{{ show(r, c) }}</td> }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <footer class="pager">
            <span class="muted">{{ '::Entities:Count' | abpLocalization: total().toString() }}</span>
            <span class="spacer"></span>
            <button class="btn sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">{{ '::Common:Previous' | abpLocalization }}</button>
            <button class="btn sm" [disabled]="(page() + 1) * size >= total()" (click)="page.set(page() + 1)">{{ '::Common:Next' | abpLocalization }}</button>
          </footer>
        }
      </section>
    </div>

    <app-entity-form [schema]="schema.value()" [info]="info()" [refs]="refs.value() ?? {}" [row]="editing()" (closed)="editing.set(null)" (saved)="editing.set(null); list.reload()" />
  `,
  styles: `
    .filters select.input { width: auto; min-width: 200px; }
    .scroll { overflow-x: auto; }
    td { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    tr.clickable { cursor: pointer; }
    .sort { all: unset; cursor: pointer; }
    .pager { display: flex; align-items: center; gap: 8px; }
  `,
})
export class EntitiesPage {
  private readonly service = inject(EntityExplorerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** ?entity=Name deep link. */
  readonly entity = input<string>();
  protected readonly size = 20;

  protected readonly entities = rxResource({ stream: () => this.service.getEntities() });
  protected readonly selected = computed(() => this.entity() || this.entities.value()?.[0]?.name || '');
  protected readonly info = computed(() => this.entities.value()?.find(e => e.name === this.selected()));
  protected readonly filter = linkedSignal({ source: this.selected, computation: () => '' });
  protected readonly sorting = linkedSignal<string, string | undefined>({ source: this.selected, computation: () => undefined });
  protected readonly page = linkedSignal({ source: this.selected, computation: () => 0 });
  protected readonly editing = linkedSignal<string, Edit | null>({ source: this.selected, computation: () => null });

  protected readonly schema = rxResource({
    params: () => this.selected() || undefined,
    stream: ({ params }) => this.service.getSchema(params),
  });
  protected readonly list = rxResource({
    params: () => this.selected()
      ? { entity: this.selected(), filter: this.filter() || undefined, sorting: this.sorting(), skipCount: this.page() * this.size, maxResultCount: this.size }
      : undefined,
    stream: ({ params: { entity, ...input } }) => this.service.getList(entity, input),
  });
  /** Lookup options for foreign keys to other exposed entities (first 200 rows; any key can still be typed). */
  protected readonly refs = rxResource({
    params: () => this.schema.value()?.fields?.filter(f => f.reference),
    stream: ({ params }) => params.length
      ? forkJoin(Object.fromEntries(params.map(f => [f.name!, this.service.getList(f.reference!.entity!, { maxResultCount: 200 }).pipe(
          map(p => p.items!.map(r => ({ id: String(cell(r, f.reference!.keyField!)), label: String(cell(r, f.reference!.displayField!) ?? '') }))))])))
      : of({} as Refs),
  });
  protected readonly rows = computed<Row[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);

  /** Keys, the display field, then the first other scalar fields: at most 6 columns. */
  protected readonly columns = computed(() => {
    const s = this.schema.value();
    if (!s) return [];
    const fields = s.fields!.filter(f => f.type !== 'json');
    const first = fields.filter(f => f.isKey || f.name === s.displayField);
    return [...first, ...fields.filter(f => !first.includes(f) && !f.readOnly)].slice(0, 6);
  });

  protected choose(name: string) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { entity: name } });
  }

  protected search(text: string) {
    this.filter.set(text.trim());
    this.page.set(0);
  }

  protected sort(name: string) {
    this.sorting.set(this.sorting() === name ? `${name} desc` : name);
    this.page.set(0);
  }

  protected sortMark(name: string) {
    return this.sorting() === name ? '↑' : this.sorting() === `${name} desc` ? '↓' : '';
  }

  protected show(row: Row, f: EntityFieldDto) {
    const v = cell(row, f.name!);
    if (v == null || v === '') return '—';
    if (f.type === 'boolean') return v ? '✓' : '✗';
    if (f.reference) return this.refs.value()?.[f.name!]?.find(o => o.id === String(v))?.label || v;
    if (f.type === 'enum') return f.enumValues?.find(o => '' + o.value === '' + v)?.name ?? v;
    if (f.type === 'datetime') return String(v).slice(0, 19).replace('T', ' ');
    return String(v);
  }
}
