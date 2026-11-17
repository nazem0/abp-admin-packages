import { ConfigStateService, LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { SETTINGS_SECTIONS } from '../shared/nav';
import { locale } from '../shared/i18n';
import { switchMap } from 'rxjs';
import { TimeZoneSettingsService } from '../proxy/volo/abp/setting-management';
import { EmailSettingsComponent } from './email-settings.component';
import { IdentitySettingsComponent } from './identity-settings.component';
import { AuditLogSettingsComponent } from './audit-log-settings.component';

/** ABP's value for "no explicit zone": every viewer sees their own browser zone. */
const DEFAULT = 'Unspecified';

interface Zone { value: string; city: string; region: string; offset: string; minutes: number }

/** "Africa/Cairo (+02:00)" → structured zone; the server's list already carries the current offset. */
function toZone(name: string, value: string): Zone {
  const offset = /\(([+-]\d\d:\d\d)\)/.exec(name)?.[1] ?? '+00:00';
  const [h, m] = offset.slice(1).split(':').map(Number);
  const parts = value.split('/');
  return {
    value,
    city: parts.at(-1)!.replaceAll('_', ' '),
    region: parts.length > 1 ? parts.slice(0, -1).join(' / ').replaceAll('_', ' ') : 'Other',
    offset: `UTC${offset}`,
    minutes: (offset[0] === '-' ? -1 : 1) * (h * 60 + m),
  };
}

@Component({
  selector: 'app-settings-page',
  imports: [EmailSettingsComponent, IdentitySettingsComponent, AuditLogSettingsComponent, RouterLink, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ '::Settings:Title' | abpLocalization }}</h1>
          <p class="muted">{{ '::Settings:Subtitle' | abpLocalization }}</p>
        </div>
      </header>

      <nav class="tabs" [attr.aria-label]="'::Settings:Sections' | abpLocalization">
        @for (s of sections(); track s.path) {
          <a [routerLink]="s.path" [class.active]="s === active()" [attr.aria-current]="s === active() ? 'page' : null">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="s.icon" /></svg>{{ s.labelKey | abpLocalization }}</a>
        }
      </nav>

      @if (active()?.path === '/settings/identity') { <app-identity-settings /> }
      @if (active()?.path === '/settings/audit-logs') { <app-audit-log-settings /> }

      @if (active()?.path === '/settings/time-zone') {
      <section class="card tz" aria-labelledby="tz-h">
        <div class="intro">
          <h2 id="tz-h">{{ '::Settings:TimeZone:Title' | abpLocalization }}</h2>
          <p class="muted">
            {{ '::Settings:TimeZone:Intro' | abpLocalization: ('::Settings:TimeZone:BrowserDefault' | abpLocalization) }}
          </p>

          <div class="clock" aria-live="polite">
            <span class="muted small">{{ '::Settings:TimeZone:NowIn' | abpLocalization: preview().label }}</span>
            <strong>{{ preview().time }}</strong>
            <span class="muted small">{{ preview().date }} · {{ preview().offset }}</span>
            @if (preview().local; as local) {
              <span class="local small">{{ '::Settings:TimeZone:YourLocalTime' | abpLocalization: local }}</span>
            }
          </div>
          <p class="muted small saved">
            {{ '::Settings:TimeZone:Saved' | abpLocalization: (saved() === DEFAULT ? ('::Settings:TimeZone:BrowserDefault' | abpLocalization) : saved()) }}
          </p>

          <div class="actions">
            <button class="btn primary" (click)="save()" [disabled]="!dirty() || saving()">
              {{ (saving() ? '::Common:Saving' : '::Common:Save') | abpLocalization }}
            </button>
            <button class="btn" (click)="choice.set(saved())" [disabled]="!dirty() || saving()">{{ '::Common:Reset' | abpLocalization }}</button>
            @if (status(); as s) {
              <span class="status" [class.err]="s.error" role="status">{{ s.text }}</span>
            }
          </div>
        </div>

        <div class="picker">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" [placeholder]="'::Settings:TimeZone:SearchPlaceholder' | abpLocalization"
                   [value]="q()" (input)="q.set($any($event.target).value)" [attr.aria-label]="'::Settings:TimeZone:SearchLabel' | abpLocalization" />
          </label>

          @if (zones.isLoading()) {
            <div class="skeleton" aria-hidden="true">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <i></i> }</div>
          } @else if (zones.error()) {
            <p class="err">{{ '::Settings:TimeZone:LoadFailed' | abpLocalization }} <button class="link" (click)="zones.reload()">{{ '::Common:Retry' | abpLocalization }}</button></p>
          } @else {
            <div class="list" role="radiogroup" [attr.aria-label]="'::Settings:TimeZone:Title' | abpLocalization" #list>
              @if (!q()) {
                <label class="opt" [class.on]="choice() === DEFAULT">
                  <input type="radio" name="tz" [value]="DEFAULT" [checked]="choice() === DEFAULT" (change)="choice.set(DEFAULT)" />
                  <span class="name"><b>{{ '::Settings:TimeZone:BrowserDefault' | abpLocalization }}</b><small>{{ browserZone }}</small></span>
                  <span class="off">{{ '::Settings:TimeZone:Auto' | abpLocalization }}</span>
                </label>
              }
              @for (g of groups(); track g.region) {
                <div class="region">{{ g.region === OTHER ? ('::Settings:TimeZone:RegionOther' | abpLocalization) : g.region }}</div>
                @for (z of g.zones; track z.value) {
                  <label class="opt" [class.on]="choice() === z.value">
                    <input type="radio" name="tz" [value]="z.value" [checked]="choice() === z.value" (change)="choice.set(z.value)" />
                    <span class="name"><b>{{ z.city }}</b><small>{{ z.value }}</small></span>
                    <span class="off">{{ z.offset }}</span>
                  </label>
                }
              } @empty {
                <p class="muted empty">{{ '::Settings:TimeZone:NoMatch' | abpLocalization: q() }}</p>
              }
            </div>
          }
        </div>
      </section>
      }

      @if (active()?.path === '/settings/email') { <app-email-settings /> }
    </div>
  `,
  styles: `
    .page { max-width: 1100px; margin: 0 auto; padding: 28px 28px 48px; display: grid; gap: 18px; }
    @media (max-width: 720px) { .page { padding: 18px 16px 32px; } }
    .tabs { display: flex; gap: 2px; max-width: 100%; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--border); }
    .tabs a { display: flex; align-items: center; gap: 8px; padding: 9px 14px; margin-bottom: -1px; border-bottom: 2px solid transparent;
      color: var(--muted); text-decoration: none; font-weight: 500; font-size: 13.5px; white-space: nowrap; }
    .tabs a:hover { color: var(--text); }
    .tabs a.active { color: var(--accent); border-bottom-color: var(--accent); }
    .tabs svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .top h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
    .top p { margin: 4px 0 0; }

    .tz { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 0; padding: 0; overflow: hidden; }
    @media (max-width: 860px) { .tz { grid-template-columns: 1fr; } }
    .intro { padding: 22px; display: flex; flex-direction: column; gap: 14px; border-inline-end: 1px solid var(--border); }
    @media (max-width: 860px) { .intro { border-inline-end: 0; border-bottom: 1px solid var(--border); } }
    h2 { font-size: 16px; font-weight: 650; }
    .intro p { margin: 0; line-height: 1.55; }
    .small { font-size: 12.5px; }

    .clock { display: grid; gap: 2px; padding: 16px 18px; border-radius: var(--radius); background: var(--accent-soft); }
    .clock strong { font-size: 34px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; color: var(--accent); }

    .local { margin-top: 6px; padding-top: 8px; border-top: 1px dashed color-mix(in srgb, var(--accent) 30%, transparent); color: var(--text); }
    .saved { margin: 0; }
    .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: auto; }
    .status { font-size: 13px; color: var(--ok); }
    .status.err, .err { color: var(--err); }

    .picker { display: flex; flex-direction: column; min-height: 0; }
    .search { position: relative; display: flex; flex: none; padding: 14px 16px; border-bottom: 1px solid var(--border); } /* global .search grows */
    .search svg { position: absolute; left: 26px; top: 22px; width: 18px; height: 18px; fill: none; stroke: var(--muted);
      stroke-width: 2; stroke-linecap: round; pointer-events: none; }
    .search .input { width: 100%; padding-inline-start: 34px; }
    .list { max-height: 460px; overflow: auto; padding: 6px 8px 10px; }
    .region { position: sticky; top: -6px; z-index: 1; padding: 10px 10px 4px; background: var(--surface);
      font-size: 11.5px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .opt { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 9px; cursor: pointer; }
    .opt:hover { background: var(--surface-2); }
    .opt.on { background: var(--accent-soft); }
    .opt input { accent-color: var(--accent); margin: 0; }
    .name { display: grid; min-width: 0; }
    .name b { font-weight: 550; }
    .name small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .off { font-family: var(--mono); font-size: 12px; color: var(--muted); }
    .opt.on .off { color: var(--accent); }
    .empty { padding: 24px; text-align: center; }
    .link { border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
    .err { padding: 24px; }

    .skeleton { display: grid; gap: 8px; padding: 12px 16px; }
    .skeleton i { display: block; height: 40px; border-radius: 9px; background: var(--surface-2); }
  `,
})
export class SettingsPage {
  private readonly service = inject(TimeZoneSettingsService);
  private readonly config = inject(ConfigStateService);
  protected readonly can = (p: string) => this.permissions.getGrantedPolicy(p);
  private readonly permissions = inject(PermissionService);

  private readonly router = inject(Router);

  /** Route segment: identity | time-zone | email. */
  readonly section = input<string>();
  /** Sections the user may see, in tab order. */
  protected readonly sections = computed(() => SETTINGS_SECTIONS.filter(s => this.can(s.policy)));
  protected readonly active = computed(() => this.sections().find(s => s.path === `/settings/${this.section()}`));

  protected readonly DEFAULT = DEFAULT;
  protected readonly OTHER = 'Other';
  private readonly l = inject(LocalizationService);
  protected readonly browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  protected readonly zones = rxResource({
    stream: () => this.service.getTimezones(),
    defaultValue: [],
  });
  private readonly current = rxResource({ stream: () => this.service.get() });

  protected readonly saved = computed(() => this.current.value() || DEFAULT);
  /** The zone picked in the list; follows the saved value until the user picks another. */
  protected readonly choice = linkedSignal(() => this.saved());
  protected readonly q = signal('');
  protected readonly saving = signal(false);
  protected readonly status = signal<{ text: string; error?: boolean } | null>(null);
  protected readonly dirty = computed(() => this.choice() !== this.saved());

  private readonly all = computed(() =>
    // The generated NameValue types `value` as the literal "string" (ABP proxy quirk), so widen it.
    (this.zones.value() as { name?: string; value?: string | null }[])
      .filter(z => z.value && z.value !== DEFAULT)
      .map(z => toZone(z.name ?? '', z.value!))
      .sort((a, b) => a.minutes - b.minutes || a.city.localeCompare(b.city)));

  protected readonly groups = computed(() => {
    const q = this.q().trim().toLowerCase();
    const hits = q ? this.all().filter(z => `${z.value} ${z.city} ${z.offset}`.toLowerCase().includes(q)) : this.all();
    const map = new Map<string, Zone[]>();
    for (const z of hits) map.set(z.region, [...(map.get(z.region) ?? []), z]);
    return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([region, zones]) => ({ region, zones }));
  });

  private readonly now = signal(Date.now());
  protected readonly preview = computed(() => {
    const zone = this.choice() === DEFAULT ? this.browserZone : this.choice();
    const at = new Date(this.now());
    const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? '';
    return {
      label: this.choice() === DEFAULT ? this.l.instant('::Settings:TimeZone:YourBrowser', zone) : zone.replaceAll('_', ' '),
      time: at.toLocaleTimeString(locale(), { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: at.toLocaleDateString(locale(), { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric' }),
      offset: offset.replace('GMT', 'UTC') || 'UTC',
      local: zone === this.browserZone ? null
        : at.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) + ` (${this.browserZone.replaceAll('_', ' ')})`,
    };
  });

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    // /settings, or a section this user can't see → the first one they can.
    effect(() => {
      if (!this.active() && this.sections().length) this.router.navigate([this.sections()[0].path], { replaceUrl: true });
    });
    // Bring the saved zone into view once the list renders (it can be hundreds of rows down).
    let scrolled = false;
    afterRenderEffect(() => {
      const list = this.list()?.nativeElement;
      if (scrolled || !list || this.current.isLoading() || this.saved() === DEFAULT) return;
      scrolled = true;
      // Scroll only the list (scrollIntoView would also scroll the page past the cards above).
      const on = list.querySelector<HTMLElement>('.opt.on');
      if (on) list.scrollTop = on.offsetTop - list.offsetTop - list.clientHeight / 2;
    });
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected save() {
    this.saving.set(true);
    this.status.set(null);
    const value = this.choice();
    this.service.update(value)
      .pipe(switchMap(() => this.config.refreshAppState()))
      .subscribe({
        next: () => {
          this.current.set(value);
          this.saving.set(false);
          this.status.set({ text: this.l.instant('::Settings:TimeZone:SavedOk') });
        },
        error: () => {
          this.saving.set(false);
          this.status.set({ text: this.l.instant('::Settings:SaveFailed'), error: true });
        },
      });
  }
}
