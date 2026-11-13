import { ConfigStateService, PermissionService } from '@abp/ng.core';
import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TimeZoneSettingsService } from '../proxy/volo/abp/setting-management';
import { EmailSettingsComponent } from './email-settings.component';
import { IdentitySettingsComponent } from './identity-settings.component';

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
  selector: 'abp-settings-page',
  imports: [EmailSettingsComponent, IdentitySettingsComponent],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>Settings</h1>
          <p class="muted">Application-wide preferences, stored by ABP Setting Management.</p>
        </div>
      </header>

      <nav class="jump" aria-label="Settings sections">
        @if (can('AbpAdmin.IdentitySettings')) { <a href="#ids-h" (click)="jump($event, 'ids-h')">Identity & sign-in</a> }
        @if (can('SettingManagement.TimeZone')) { <a href="#tz-h" (click)="jump($event, 'tz-h')">Time zone</a> }
        @if (can('SettingManagement.Emailing')) { <a href="#em-h" (click)="jump($event, 'em-h')">Email</a> }
      </nav>

      @if (can('AbpAdmin.IdentitySettings')) { <abp-identity-settings /> }

      @if (can('SettingManagement.TimeZone')) {
      <section class="card tz" aria-labelledby="tz-h">
        <div class="intro">
          <h2 id="tz-h">Time zone</h2>
          <p class="muted">
            Audit times, day boundaries and charts use this zone for everyone. Leave it on
            <b>Browser default</b> to let each person see their own local time.
          </p>

          <div class="clock" aria-live="polite">
            <span class="muted small">Now in {{ preview().label }}</span>
            <strong>{{ preview().time }}</strong>
            <span class="muted small">{{ preview().date }} · {{ preview().offset }}</span>
            @if (preview().local; as local) {
              <span class="local small">Your local time is {{ local }}</span>
            }
          </div>
          <p class="muted small saved">
            Saved: <b>{{ saved() === DEFAULT ? 'Browser default' : saved() }}</b>
          </p>

          <div class="actions">
            <button class="btn primary" (click)="save()" [disabled]="!dirty() || saving()">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button class="btn" (click)="choice.set(saved())" [disabled]="!dirty() || saving()">Reset</button>
            @if (status(); as s) {
              <span class="status" [class.err]="s.error" role="status">{{ s.text }}</span>
            }
          </div>
        </div>

        <div class="picker">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="Search city, region or offset (e.g. +03)"
                   [value]="q()" (input)="q.set($any($event.target).value)" aria-label="Search time zones" />
          </label>

          @if (zones.isLoading()) {
            <div class="skeleton" aria-hidden="true">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <i></i> }</div>
          } @else if (zones.error()) {
            <p class="err">Couldn't load time zones. <button class="link" (click)="zones.reload()">Retry</button></p>
          } @else {
            <div class="list" role="radiogroup" aria-label="Time zone" #list>
              @if (!q()) {
                <label class="opt" [class.on]="choice() === DEFAULT">
                  <input type="radio" name="tz" [value]="DEFAULT" [checked]="choice() === DEFAULT" (change)="choice.set(DEFAULT)" />
                  <span class="name"><b>Browser default</b><small>{{ browserZone }}</small></span>
                  <span class="off">auto</span>
                </label>
              }
              @for (g of groups(); track g.region) {
                <div class="region">{{ g.region }}</div>
                @for (z of g.zones; track z.value) {
                  <label class="opt" [class.on]="choice() === z.value">
                    <input type="radio" name="tz" [value]="z.value" [checked]="choice() === z.value" (change)="choice.set(z.value)" />
                    <span class="name"><b>{{ z.city }}</b><small>{{ z.value }}</small></span>
                    <span class="off">{{ z.offset }}</span>
                  </label>
                }
              } @empty {
                <p class="muted empty">No zone matches “{{ q() }}”.</p>
              }
            </div>
          }
        </div>
      </section>
      }

      @if (can('SettingManagement.Emailing')) { <abp-email-settings /> }
    </div>
  `,
  styles: `
    .page { max-width: 1100px; margin: 0 auto; padding: 28px 28px 48px; display: grid; gap: 18px; }
    @media (max-width: 720px) { .page { padding: 18px 16px 32px; } }
    .jump { position: sticky; top: 8px; z-index: 3; display: flex; gap: 4px; width: fit-content; max-width: 100%; overflow-x: auto; padding: 4px;
      border: 1px solid var(--border); border-radius: 11px; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(8px); box-shadow: var(--shadow); }
    .jump a { padding: 5px 12px; border-radius: 8px; color: var(--muted); text-decoration: none; font-weight: 500; font-size: 13px; white-space: nowrap; }
    .jump a:hover { background: var(--surface-2); color: var(--text); }
    @media (max-width: 860px) { .jump { top: 64px; } }
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
    .search { position: relative; display: flex; padding: 14px 16px; border-bottom: 1px solid var(--border); }
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

  protected readonly DEFAULT = DEFAULT;
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
      label: this.choice() === DEFAULT ? `your browser (${zone})` : zone.replaceAll('_', ' '),
      time: at.toLocaleTimeString(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: at.toLocaleDateString(undefined, { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric' }),
      offset: offset.replace('GMT', 'UTC') || 'UTC',
      local: zone === this.browserZone ? null
        : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ` (${this.browserZone.replaceAll('_', ' ')})`,
    };
  });

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
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

  protected jump(e: Event, id: string) {
    e.preventDefault(); // the router would treat #fragment links as navigation
    document.getElementById(id)?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          this.status.set({ text: 'Saved. Times now display in the new zone.' });
        },
        error: () => {
          this.saving.set(false);
          this.status.set({ text: 'Saving failed. Try again.', error: true });
        },
      });
  }
}
