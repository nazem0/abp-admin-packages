import { ConfigStateService, LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { SettingBrowserService, SettingValueDto } from '../proxy/abp-admin/services/settings';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

/**
 * Every setting of every module, with where its value comes from (default → appsettings.json → host → tenant).
 * The host edits global values, a tenant its own; an empty value removes this level's value.
 */
@Component({
  selector: 'abp-all-settings',
  imports: [LocalizationPipe],
  template: `
    <section class="card all" aria-labelledby="all-h">
      <header>
        <div>
          <h2 id="all-h">{{ 'AbpAdmin::Settings:All:Title' | abpLocalization }}</h2>
          <p class="muted">{{ (tenant ? 'AbpAdmin::Settings:All:IntroTenant' : 'AbpAdmin::Settings:All:IntroHost') | abpLocalization }}</p>
        </div>
        @if (canEdit) {
          <div class="acts">
            @if (changes().length) { <span class="muted small">{{ 'AbpAdmin::Settings:Unsaved' | abpLocalization: changes().length.toString() }}</span> }
            <button class="btn" (click)="reset()" [disabled]="!changes().length || saving()">{{ 'AbpAdmin::Common:Reset' | abpLocalization }}</button>
            <button class="btn primary" (click)="save()" [disabled]="!changes().length || saving()">{{ (saving() ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save') | abpLocalization }}</button>
          </div>
        }
      </header>

      <div class="filters">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input class="input" type="search" [placeholder]="'AbpAdmin::Settings:All:Search' | abpLocalization" [attr.aria-label]="'AbpAdmin::Settings:All:Search' | abpLocalization"
                 [value]="q()" (input)="q.set($any($event.target).value)" />
        </label>
        <select class="input" [value]="group()" (change)="group.set($any($event.target).value)" [attr.aria-label]="'AbpAdmin::Settings:All:Module' | abpLocalization">
          <option value="">{{ 'AbpAdmin::Settings:All:AllModules' | abpLocalization }}</option>
          @for (g of groups(); track g) { <option [value]="g">{{ g }}</option> }
        </select>
        <label class="check"><input type="checkbox" [checked]="overridden()" (change)="overridden.set($any($event.target).checked)" />
          {{ 'AbpAdmin::Settings:All:OnlyChanged' | abpLocalization }}</label>
      </div>

      @if (data.isLoading()) {
        <div class="skeleton rows">@for (i of [1, 2, 3, 4, 5]; track i) { <i></i> }</div>
      } @else if (data.error()) {
        <div class="state err">{{ 'AbpAdmin::Settings:All:LoadFailed' | abpLocalization }} <button class="btn" (click)="data.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
      } @else {
        <ul class="list">
          @for (s of shown(); track s.name) {
            @let editable = canEdit && s.isEditable;
            <li [class.changed]="edits().has(s.name!)">
              <div class="what">
                <label [for]="'set-' + s.name"><b>{{ s.displayName }}</b></label>
                <code class="mono">{{ s.name }}</code>
                @if (s.description && s.description !== s.displayName) { <small class="muted">{{ s.description }}</small> }
                <span class="levels">
                  <span class="lvl" [class.on]="source(s) === 'default'">{{ 'AbpAdmin::Settings:All:Default' | abpLocalization }}: {{ show(s.defaultValue) }}</span>
                  @if (s.configurationValue != null) { <span class="lvl" [class.on]="source(s) === 'config'">appsettings: {{ s.configurationValue }}</span> }
                  @if (s.globalValue != null) { <span class="lvl" [class.on]="source(s) === 'global'">{{ 'AbpAdmin::Settings:All:Host' | abpLocalization }}: {{ s.globalValue }}</span> }
                  @if (s.tenantValue != null) { <span class="lvl" [class.on]="source(s) === 'tenant'">{{ 'AbpAdmin::Settings:All:Tenant' | abpLocalization }}: {{ s.tenantValue }}</span> }
                  @if (s.isEncrypted) { <span class="lvl">{{ 'AbpAdmin::Settings:All:Encrypted' | abpLocalization }}</span> }
                </span>
              </div>
              <div class="val">
                @if (s.type === 'bool') {
                  <select class="input" [id]="'set-' + s.name" [value]="value(s)" [disabled]="!editable" (change)="set(s, $any($event.target).value)">
                    <option value="">{{ 'AbpAdmin::Settings:All:Inherit' | abpLocalization: inherited(s) }}</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                } @else {
                  <input class="input" [id]="'set-' + s.name" [type]="s.isEncrypted ? 'password' : s.type === 'number' ? 'number' : 'text'" min="0"
                         [value]="value(s)" [placeholder]="inherited(s)" [disabled]="!editable" (input)="set(s, $any($event.target).value)" />
                }
              </div>
            </li>
          } @empty {
            <li class="state empty"><span class="muted">{{ 'AbpAdmin::Settings:All:NoMatch' | abpLocalization }}</span></li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 20px 22px 6px; }
    h2 { font-size: 16px; font-weight: 650; }
    header p { margin: 4px 0 0; max-width: 640px; line-height: 1.5; }
    .acts { display: flex; align-items: center; gap: 8px; }
    .small { font-size: 12.5px; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 10px 22px; }
    .filters select { width: auto; }
    .check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
    .list { list-style: none; margin: 0; padding: 4px 12px 14px; }
    .list li { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: center; padding: 10px; border-radius: 9px; }
    .list li + li { border-top: 1px dashed var(--border); }
    .list li.changed { background: var(--warn-soft); }
    @media (max-width: 720px) { .list li { grid-template-columns: minmax(0, 1fr); } }
    .what { display: grid; gap: 2px; min-width: 0; }
    .what b { font-weight: 550; font-size: 13.5px; }
    .what code { font-size: 11.5px; color: var(--muted); overflow-wrap: anywhere; }
    .what small { font-size: 12px; }
    .levels { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .lvl { font-size: 11.5px; padding: 1px 7px; border-radius: 99px; background: var(--surface-2); color: var(--muted); overflow-wrap: anywhere; }
    .lvl.on { background: var(--accent-soft); color: var(--accent); font-weight: 550; }
    .val .input { width: 100%; }
    .skeleton.rows { padding: 16px 22px; }
    .state.empty { display: block; text-align: center; padding: 24px; }
  `,
})
export class AllSettingsComponent {
  private readonly service = inject(SettingBrowserService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  protected readonly canEdit = inject(PermissionService).getGrantedPolicy('AbpAdmin.Settings.Update');
  protected readonly tenant = !!inject(ConfigStateService).getDeep('currentTenant.id');

  protected readonly data = rxResource({ stream: () => this.service.getList(), defaultValue: [] });
  protected readonly q = signal('');
  protected readonly group = signal('');
  protected readonly overridden = signal(false);
  /** Setting name → new value at this level ('' = remove it). Cleared when the data reloads. */
  protected readonly edits = linkedSignal<SettingValueDto[], Map<string, string>>({ source: () => this.data.value(), computation: () => new Map() });
  protected readonly saving = signal(false);

  protected readonly groups = computed(() => [...new Set(this.data.value().map(s => s.group!))].sort());
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.data.value().filter(s =>
      (!this.group() || s.group === this.group())
      && (!this.overridden() || this.source(s) !== 'default')
      && (!q || `${s.name} ${s.displayName} ${s.description ?? ''}`.toLowerCase().includes(q)));
  });
  protected readonly changes = computed(() => [...this.edits()].map(([name, value]) => ({ name, value })));

  /** This level's own value: the tenant's for a tenant, the global one for the host. */
  private own(s: SettingValueDto) {
    return (this.tenant ? s.tenantValue : s.globalValue) ?? '';
  }

  /** What applies when this level stores nothing. */
  protected inherited(s: SettingValueDto) {
    return this.show((this.tenant ? s.globalValue : null) ?? s.configurationValue ?? s.defaultValue);
  }

  protected source(s: SettingValueDto) {
    return s.tenantValue != null ? 'tenant' : s.globalValue != null ? 'global' : s.configurationValue != null ? 'config' : 'default';
  }

  protected show(v?: string | null) {
    return v == null || v === '' ? this.l.instant('AbpAdmin::Settings:All:Empty') : v;
  }

  protected value(s: SettingValueDto) {
    return this.edits().get(s.name!) ?? this.own(s);
  }

  protected set(s: SettingValueDto, value: string) {
    this.edits.update(m => {
      const next = new Map(m);
      if (value === this.own(s)) next.delete(s.name!);
      else next.set(s.name!, value);
      return next;
    });
  }

  protected reset() {
    this.edits.set(new Map());
  }

  protected save() {
    this.saving.set(true);
    this.service.update(this.changes()).subscribe({
      next: () => { this.saving.set(false); this.toaster.ok(this.l.instant('AbpAdmin::Settings:All:Saved')); this.data.reload(); },
      error: e => { this.saving.set(false); this.toaster.error(apiError(e)); },
    });
  }
}
