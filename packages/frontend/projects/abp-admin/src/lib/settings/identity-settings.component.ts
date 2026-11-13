import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IdentitySettingsService, SettingItemDto } from '../proxy/abp-admin/services/settings';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

const GROUP_INTRO: Record<string, string> = {
  Password: 'Rules every new password must satisfy.',
  Lockout: 'What happens after repeated wrong passwords.',
  'Sign-in': 'Who may sign in and how accounts get created.',
  User: 'What users may change on their own profile.',
};

/** Identity & account settings (password policy, lockout, sign-in, self-registration), rendered from the API's list. */
@Component({
  selector: 'abp-identity-settings',
  template: `
    <section class="card ids" aria-labelledby="ids-h">
      <header>
        <div>
          <h2 id="ids-h">Identity & sign-in</h2>
          <p class="muted">ABP Identity and Account settings, stored globally. Values from <code>appsettings.json</code> show as the effective default.</p>
        </div>
        <div class="acts">
          @if (changes().length) { <span class="muted small">{{ changes().length }} unsaved</span> }
          <button class="btn" (click)="values.set(saved())" [disabled]="!changes().length || saving()">Reset</button>
          <button class="btn primary" (click)="save()" [disabled]="!changes().length || saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      </header>

      @if (data.isLoading()) {
        <div class="skeleton rows">@for (i of [1, 2, 3, 4]; track i) { <i></i> }</div>
      } @else if (data.error()) {
        <div class="state err">Couldn't load identity settings. <button class="btn" (click)="data.reload()">Retry</button></div>
      } @else {
        <div class="groups">
          @for (g of data.value(); track g.name) {
            <fieldset>
              <legend>{{ g.name }}</legend>
              <p class="muted small intro">{{ intro[g.name!] }}</p>
              @for (s of g.settings; track s.name) {
                <div class="row" [class.changed]="isChanged(s)">
                  <label [for]="s.name">
                    <b>{{ s.displayName }}</b>
                    @if (s.description && s.description !== s.displayName) { <small>{{ s.description }}</small> }
                  </label>
                  @if (s.type === 'bool') {
                    <input type="checkbox" class="switch" [id]="s.name" [checked]="value(s) === 'true' || value(s) === 'True'"
                           (change)="set(s, $any($event.target).checked ? 'true' : 'false')" />
                  } @else {
                    <input class="input" [id]="s.name" [type]="s.type === 'number' ? 'number' : 'text'" min="0" [value]="value(s)"
                           (input)="set(s, $any($event.target).value)" />
                  }
                </div>
              }
            </fieldset>
          }
        </div>
      }
    </section>
  `,
  styles: `
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 20px 22px 6px; }
    h2 { font-size: 16px; font-weight: 650; }
    header p { margin: 4px 0 0; max-width: 560px; line-height: 1.5; }
    .acts { display: flex; align-items: center; gap: 8px; }
    .small { font-size: 12.5px; }
    .groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; padding: 6px 22px 18px; }
    @media (max-width: 960px) { .groups { grid-template-columns: minmax(0, 1fr); } }
    fieldset { margin: 0; padding: 14px 0 6px; border: 0; min-width: 0; }
    legend { float: left; width: 100%; padding: 0; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    .intro { clear: both; margin: 2px 0 6px; padding-top: 2px; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 10px; margin: 0 -10px; border-radius: 9px; }
    .row + .row { border-top: 1px dashed var(--border); }
    .row.changed { background: var(--warn-soft); }
    .row label { display: grid; min-width: 0; cursor: pointer; }
    .row b { font-weight: 550; font-size: 13.5px; }
    .row small { color: var(--muted); font-size: 12px; }
    .row .input { width: 96px; flex: none; }
    .skeleton.rows { padding: 16px 22px; }
  `,
})
export class IdentitySettingsComponent {
  private readonly service = inject(IdentitySettingsService);
  private readonly toaster = inject(Toaster);
  protected readonly intro = GROUP_INTRO;

  protected readonly data = rxResource({ stream: () => this.service.get(), defaultValue: [] });
  /** Effective value: the stored one, else the definition default. */
  protected readonly saved = computed(() => new Map(this.data.value().flatMap(g => g.settings ?? [])
    .map(s => [s.name!, s.value ?? s.defaultValue ?? ''] as const)));
  protected readonly values = linkedSignal(() => new Map(this.saved()));
  protected readonly saving = signal(false);

  protected readonly changes = computed(() =>
    [...this.values()].filter(([k, v]) => this.saved().get(k) !== v).map(([name, value]) => ({ name, value })));

  protected value(s: SettingItemDto) {
    return this.values().get(s.name!) ?? '';
  }

  protected isChanged(s: SettingItemDto) {
    return this.saved().get(s.name!) !== this.value(s);
  }

  protected set(s: SettingItemDto, value: string) {
    this.values.update(m => new Map(m).set(s.name!, value));
  }

  protected save() {
    this.saving.set(true);
    this.service.update(this.changes()).subscribe({
      next: () => { this.saving.set(false); this.toaster.ok('Identity settings saved.'); this.data.reload(); },
      error: e => { this.saving.set(false); this.toaster.error(apiError(e)); },
    });
  }
}
