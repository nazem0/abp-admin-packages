import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ApplicationDto, ApplicationService, CreateUpdateApplicationDto, ScopeService } from '../proxy/abp-admin/services/open-iddict';
import { SheetDirective } from '../shared/sheet.directive';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

export type ApplicationEdit = ApplicationDto | 'new';

export const GRANTS = [
  { value: 'authorization_code', label: 'Authorization code', hint: 'Browser sign-in for web apps and SPAs. Use with PKCE.' },
  { value: 'refresh_token', label: 'Refresh token', hint: 'Keep users signed in without asking again.' },
  { value: 'client_credentials', label: 'Client credentials', hint: 'Machine-to-machine; needs a confidential client.' },
  { value: 'password', label: 'Password', hint: 'Legacy: the app collects the user’s password itself.' },
  { value: 'urn:ietf:params:oauth:grant-type:device_code', label: 'Device code', hint: 'TVs, CLIs and devices without a browser.' },
  { value: 'implicit', label: 'Implicit', hint: 'Legacy browser flow; prefer authorization code + PKCE.' },
];
const STANDARD_SCOPES = ['address', 'email', 'phone', 'profile', 'roles'];
const INTERACTIVE = ['authorization_code', 'implicit'];

/** Create / edit an OpenIddict client. Native form; values read with FormData on submit. */
@Component({
  selector: 'abp-application-form',
  imports: [SheetDirective],
  template: `
    <dialog [appSheet]="!!app()" (dismiss)="closed.emit()" aria-labelledby="af-title" class="af">
      @if (app()) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <span class="avatar sq" aria-hidden="true">{{ (x?.displayName || x?.clientId || '+')[0].toUpperCase() }}</span>
            <h2 id="af-title">{{ x ? 'Edit application' : 'New application' }} @if (x) { <small class="mono">{{ x.clientId }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div class="sh-body form">
            <div class="grid-2">
              <label class="field"><span>Client ID <i>*</i></span>
                <input class="input mono" name="clientId" required maxlength="100" autocomplete="off" pattern="[^\\s]+" title="No spaces"
                       [value]="x?.clientId ?? ''" placeholder="MyApp_Web" /></label>
              <label class="field"><span>Display name</span>
                <input class="input" name="displayName" maxlength="200" [value]="x?.displayName ?? ''" placeholder="My web app" /></label>
            </div>

            <fieldset>
              <legend>Client type</legend>
              <div class="choice">
                <label [class.on]="type() === 'public'"><input type="radio" name="clientType" value="public" [checked]="type() === 'public'" (change)="type.set('public')" />
                  <b>Public</b><small>Runs in the browser or on a device and can't keep a secret (SPA, mobile, desktop).</small></label>
                <label [class.on]="type() === 'confidential'"><input type="radio" name="clientType" value="confidential" [checked]="type() === 'confidential'" (change)="type.set('confidential')" />
                  <b>Confidential</b><small>Runs on a server and authenticates with a client secret.</small></label>
              </div>
              @if (type() === 'confidential') {
                <label class="field"><span>Client secret @if (!x?.id || existing()?.clientType !== 'confidential') { <i>*</i> }</span>
                  <span class="secret">
                    <input class="input mono" name="clientSecret" [type]="secret() ? 'text' : 'password'" autocomplete="new-password"
                           [required]="!x || x.clientType !== 'confidential'" [value]="secret()" (input)="secret.set($any($event.target).value)"
                           [placeholder]="x?.clientType === 'confidential' ? 'Leave empty to keep the current secret' : ''" />
                    <button type="button" class="btn sm" (click)="generate()">Generate</button>
                    @if (secret()) { <button type="button" class="btn sm" (click)="copy()">{{ copied() ? 'Copied' : 'Copy' }}</button> }
                  </span>
                  <small>Stored hashed: copy it now, it can't be shown again.</small></label>
              }
            </fieldset>

            <fieldset>
              <legend>Grant types</legend>
              <div class="checks">
                @for (g of grants; track g.value) {
                  <label class="check"><input type="checkbox" name="grantTypes" [value]="g.value" [checked]="selected().has(g.value)" (change)="toggleGrant(g.value, $any($event.target).checked)" />
                    <span>{{ g.label }}<small>{{ g.hint }}</small></span></label>
                }
                @for (c of customGrants(); track c) {
                  <label class="check"><input type="checkbox" name="grantTypes" [value]="c" checked (change)="toggleGrant(c, $any($event.target).checked)" />
                    <span class="mono">{{ c }}<small>Custom grant</small></span></label>
                }
              </div>
              <span class="add">
                <input #custom class="input mono" placeholder="Custom grant, e.g. LinkLogin" aria-label="Custom grant type" (keydown.enter)="$event.preventDefault(); addCustom(custom)" />
                <button type="button" class="btn sm" (click)="addCustom(custom)">Add</button>
              </span>
              @if (interactive()) {
                <label class="check"><input type="checkbox" class="switch" name="requirePkce" [checked]="x ? x.requirePkce : true" />
                  <span>Require PKCE <small>Protects the authorization code flow; recommended for every client.</small></span></label>
              }
            </fieldset>

            @if (interactive()) {
              <fieldset>
                <legend>Redirects</legend>
                <label class="field"><span>Redirect URIs</span>
                  <textarea class="input mono" name="redirectUris" rows="3" placeholder="https://app.example.com/signin-callback">{{ (x?.redirectUris ?? []).join('\\n') }}</textarea>
                  <small>One absolute URL per line. Where users land after signing in.</small></label>
                <label class="field"><span>Post-logout redirect URIs</span>
                  <textarea class="input mono" name="postLogoutRedirectUris" rows="2" placeholder="https://app.example.com">{{ (x?.postLogoutRedirectUris ?? []).join('\\n') }}</textarea></label>
              </fieldset>
            }

            <fieldset>
              <legend>Scopes</legend>
              <div class="scopes">
                @for (s of scopeNames(); track s.name) {
                  <label class="chip-check" [title]="s.hint">
                    <input type="checkbox" name="scopes" [value]="s.name" [checked]="x ? x.scopes?.includes(s.name) : true" />
                    <span>{{ s.name }}</span>
                  </label>
                }
              </div>
              <small class="muted">Scopes this client may request. API scopes are managed under OpenIddict › Scopes.</small>
            </fieldset>

            <details class="more" [open]="!!(x?.clientUri || x?.logoUri || x?.consentType === 'explicit')">
              <summary>More options</summary>
              <div class="grid-2">
                <label class="field"><span>Application type</span>
                  <select class="input" name="applicationType">
                    <option value="web" [selected]="(x?.applicationType ?? 'web') === 'web'">Web</option>
                    <option value="native" [selected]="x?.applicationType === 'native'">Native (desktop / mobile)</option>
                  </select></label>
                <label class="field"><span>Consent</span>
                  <select class="input" name="consentType">
                    @for (c of consents; track c.value) {
                      <option [value]="c.value" [selected]="(x?.consentType ?? 'implicit') === c.value">{{ c.label }}</option>
                    }
                  </select></label>
                <label class="field"><span>Client URI</span>
                  <input class="input" name="clientUri" type="url" [value]="x?.clientUri ?? ''" placeholder="https://app.example.com" /></label>
                <label class="field"><span>Logo URI</span>
                  <input class="input" name="logoUri" type="url" [value]="x?.logoUri ?? ''" placeholder="https://app.example.com/logo.png" /></label>
              </div>
            </details>
          </div>

          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
            <button class="btn primary" [disabled]="saving()">{{ saving() ? 'Saving…' : x ? 'Save' : 'Create application' }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    .af { width: min(720px, 100vw); }
    .avatar.sq { width: 36px; height: 36px; border-radius: 10px; }
    fieldset { display: grid; gap: 12px; margin: 0; padding: 14px 0 0; border: 0; border-top: 1px solid var(--border); min-width: 0; }
    legend { padding: 0 0 4px; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    .choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    @media (max-width: 560px) { .choice { grid-template-columns: 1fr; } }
    .choice label { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; padding: 12px; border: 1px solid var(--border); border-radius: 11px; cursor: pointer; }
    .choice label.on { border-color: var(--accent); background: var(--accent-soft); }
    .choice input { grid-row: span 2; accent-color: var(--accent); margin-top: 3px; }
    .choice small { color: var(--muted); font-size: 12px; }
    .secret { display: flex; gap: 6px; align-items: center; }
    .secret .input { flex: 1; }
    .checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
    @media (max-width: 560px) { .checks { grid-template-columns: 1fr; } }
    .add { display: flex; gap: 6px; max-width: 360px; }
    .add .input { flex: 1; }
    textarea.input { height: auto; padding: 8px 11px; resize: vertical; line-height: 1.6; }
    .scopes { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip-check { position: relative; cursor: pointer; }
    .chip-check input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
    .chip-check span { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border: 1px solid var(--border); border-radius: 999px;
      font: 12.5px var(--mono); color: var(--muted); background: var(--surface); }
    .chip-check input:checked + span { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
    .chip-check input:checked + span::before { content: '✓'; margin-inline-end: 6px; }
    .chip-check input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
    .more { border-top: 1px solid var(--border); padding-top: 12px; }
    .more summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 12px; }
    .sh-foot .alert { flex: 1; }
  `,
})
export class ApplicationFormComponent {
  private readonly service = inject(ApplicationService);
  private readonly scopes = inject(ScopeService);
  private readonly toaster = inject(Toaster);

  readonly app = input<ApplicationEdit | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly grants = GRANTS;
  protected readonly consents = [
    { value: 'implicit', label: 'Implicit (no consent screen)' },
    { value: 'explicit', label: 'Explicit (ask the user)' },
    { value: 'systematic', label: 'Systematic (always ask)' },
    { value: 'external', label: 'External (pre-approved only)' },
  ];

  protected readonly existing = computed(() => {
    const a = this.app();
    return a && a !== 'new' ? a : null;
  });

  protected readonly type = linkedSignal(() => this.existing()?.clientType ?? 'public');
  protected readonly selected = linkedSignal(() => new Set(this.existing()?.grantTypes ?? ['authorization_code', 'refresh_token']));
  protected readonly customGrants = linkedSignal(() =>
    (this.existing()?.grantTypes ?? []).filter(g => !GRANTS.some(k => k.value === g)));
  protected readonly interactive = computed(() => INTERACTIVE.some(g => this.selected().has(g)));
  protected readonly secret = linkedSignal({ source: this.app, computation: () => '' });
  protected readonly copied = linkedSignal({ source: this.secret, computation: () => false });
  protected readonly error = linkedSignal<ApplicationEdit | null, string | null>({ source: this.app, computation: () => null });
  protected readonly saving = signal(false);

  private readonly scopeList = rxResource({
    params: () => (this.app() ? true : undefined),
    stream: () => this.scopes.getList({ maxResultCount: 1000 }),
  });
  protected readonly scopeNames = computed(() => {
    const api = (this.scopeList.value()?.items ?? []).map(s => ({ name: s.name!, hint: s.displayName ?? s.name! }));
    const all = [...STANDARD_SCOPES.map(name => ({ name, hint: 'Standard OpenID Connect scope' })), ...api];
    // Keep scopes the client already has, even if their definition was removed.
    for (const s of this.existing()?.scopes ?? []) if (!all.some(a => a.name === s)) all.push({ name: s, hint: 'Not defined' });
    return all;
  });

  protected toggleGrant(value: string, on: boolean) {
    this.selected.update(s => { const n = new Set(s); if (on) n.add(value); else n.delete(value); return n; });
  }

  protected addCustom(el: HTMLInputElement) {
    const v = el.value.trim();
    if (!v || this.selected().has(v)) return;
    this.customGrants.update(c => [...c, v]);
    this.toggleGrant(v, true);
    el.value = '';
  }

  protected generate() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    this.secret.set(btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' })[c]!));
  }

  protected copy() {
    navigator.clipboard?.writeText(this.secret()).then(() => this.copied.set(true));
  }

  protected save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? '').trim();
    const lines = (k: string) => text(k).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const dto: CreateUpdateApplicationDto = {
      clientId: text('clientId'),
      displayName: text('displayName') || null,
      clientType: text('clientType') || 'public',
      consentType: text('consentType') || 'implicit',
      applicationType: text('applicationType') || 'web',
      clientSecret: this.type() === 'confidential' ? this.secret() || null : null,
      grantTypes: fd.getAll('grantTypes').map(String),
      scopes: fd.getAll('scopes').map(String),
      redirectUris: lines('redirectUris'),
      postLogoutRedirectUris: lines('postLogoutRedirectUris'),
      requirePkce: fd.has('requirePkce'),
      clientUri: text('clientUri') || null,
      logoUri: text('logoUri') || null,
    };
    if (!dto.grantTypes?.length) { this.error.set('Pick at least one grant type.'); return; }
    const x = this.existing();
    this.saving.set(true);
    this.error.set(null);
    (x ? this.service.update(x.id!, dto) : this.service.create(dto)).subscribe({
      next: () => {
        this.saving.set(false);
        this.toaster.ok(x ? `Saved ${dto.clientId}.` : `Created ${dto.clientId}.`);
        this.saved.emit();
      },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}
