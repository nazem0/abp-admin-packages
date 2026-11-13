import { PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ScopeDto, ScopeService } from '../proxy/abp-admin/services/open-iddict';
import { relative } from '../audit-logs/format';
import { SheetDirective } from '../shared/sheet.directive';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

type ScopeEdit = ScopeDto | 'new';

@Component({
  selector: 'abp-scope-form',
  imports: [SheetDirective],
  template: `
    <dialog [appSheet]="!!scope()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="sf-title">
      @if (scope()) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="sf-title">{{ x ? 'Edit scope' : 'New scope' }} @if (x) { <small class="mono">{{ x.name }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            <label class="field"><span>Name <i>*</i></span>
              <input class="input mono" name="name" required maxlength="200" pattern="[^\\s]+" title="No spaces" autocomplete="off" [value]="x?.name ?? ''" placeholder="Orders" />
              <small>What clients put in the <code>scope</code> parameter.</small></label>
            <label class="field"><span>Display name</span>
              <input class="input" name="displayName" maxlength="200" [value]="x?.displayName ?? ''" placeholder="Orders API" /></label>
            <label class="field"><span>Description</span>
              <textarea class="input" name="description" rows="2">{{ x?.description ?? '' }}</textarea></label>
            <label class="field"><span>Resources (audiences)</span>
              <textarea class="input mono" name="resources" rows="3" placeholder="Orders">{{ (x?.resources ?? []).join('\\n') }}</textarea>
              <small>One per line. Access tokens with this scope get these values in their <code>aud</code> claim; each API validates its own audience.</small></label>
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
            <button class="btn primary" [disabled]="saving()">{{ saving() ? 'Saving…' : x ? 'Save' : 'Create scope' }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    textarea.input { height: auto; padding: 8px 11px; resize: vertical; line-height: 1.6; }
    .sh-foot .alert { flex: 1; }
  `,
})
export class ScopeFormComponent {
  private readonly service = inject(ScopeService);
  private readonly toaster = inject(Toaster);
  readonly scope = input<ScopeEdit | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly existing = computed(() => { const s = this.scope(); return s && s !== 'new' ? s : null; });
  protected readonly error = linkedSignal<ScopeEdit | null, string | null>({ source: this.scope, computation: () => null });
  protected readonly saving = signal(false);

  protected save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? '').trim();
    const dto = {
      name: text('name'),
      displayName: text('displayName') || null,
      description: text('description') || null,
      resources: text('resources').split(/\r?\n/).map(l => l.trim()).filter(Boolean),
    };
    const x = this.existing();
    this.saving.set(true);
    this.error.set(null);
    (x ? this.service.update(x.id!, dto) : this.service.create(dto)).subscribe({
      next: () => { this.saving.set(false); this.toaster.ok(x ? `Saved ${dto.name}.` : `Created ${dto.name}.`); this.saved.emit(); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}

/** OpenIddict scopes: the API permissions clients can request, and the audiences they map to. */
@Component({
  selector: 'abp-scopes-page',
  imports: [ScopeFormComponent],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>Scopes</h1>
          <p class="muted">API scopes clients can request. Standard OpenID scopes (profile, email…) are built in and don't need to be listed.</p>
        </div>
        @if (can('AbpAdmin.Scopes.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> New scope
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="Search scopes…" aria-label="Search scopes"
                   (change)="filter.set($any($event.target).value.trim())" (search)="filter.set($any($event.target).value.trim())" />
          </label>
        </div>
        @if (list.error()) {
          <div class="state err">Couldn't load scopes. <button class="btn" (click)="list.reload()">Retry</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty"><b>No scopes</b><span class="muted">{{ filter() ? 'Nothing matches “' + filter() + '”.' : 'Define the first API scope.' }}</span></div>
        } @else {
          <table class="table">
            <thead><tr><th>Scope</th><th>Resources</th><th class="hide-sm">Created</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (s of rows(); track s.id) {
                <tr>
                  <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">{{ (s.name || '?')[0].toUpperCase() }}</span>
                    <span><b class="mono">{{ s.name }}</b><small>{{ s.displayName }}{{ s.description ? ' — ' + s.description : '' }}</small></span></span></td>
                  <td><span class="pills">@for (r of s.resources; track r) { <span class="pill tone-accent mono">{{ r }}</span> } @empty { <span class="muted">—</span> }</span></td>
                  <td class="hide-sm muted">{{ relative(s.creationTime) }}</td>
                  <td class="actions">
                    @if (confirming() === s.id) {
                      <span class="confirm">Delete {{ s.name }}?
                        <button class="btn sm danger" (click)="remove(s)">Delete</button>
                        <button class="btn sm" (click)="confirming.set(null)">Cancel</button></span>
                    } @else {
                      @if (can('AbpAdmin.Scopes.Update')) {
                        <button class="icon-btn" title="Edit" [attr.aria-label]="'Edit ' + s.name" (click)="editing.set(s)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpAdmin.Scopes.Delete')) {
                        <button class="icon-btn" title="Delete" [attr.aria-label]="'Delete ' + s.name" (click)="confirming.set(s.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <footer class="pager"><span class="muted">{{ total() }} scope{{ total() === 1 ? '' : 's' }}</span></footer>
        }
      </section>
    </div>

    <abp-scope-form [scope]="editing()" (closed)="editing.set(null)" (saved)="editing.set(null); list.reload()" />
  `,
  styles: `.avatar.sq { border-radius: 9px; }`,
})
export class ScopesPage {
  private readonly service = inject(ScopeService);
  private readonly permissions = inject(PermissionService);
  private readonly toaster = inject(Toaster);

  readonly new = input<string>();
  protected readonly relative = relative;
  protected readonly filter = signal('');
  protected readonly editing = signal<ScopeEdit | null>(null);
  protected readonly confirming = signal<string | null>(null);

  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, maxResultCount: 200 }),
    stream: ({ params }) => this.service.getList(params),
  });
  protected readonly rows = computed<ScopeDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);

  constructor() {
    effect(() => { if (this.new() === '1' && this.can('AbpAdmin.Scopes.Create')) this.editing.set('new'); });
  }

  protected can(policy: string) {
    return this.permissions.getGrantedPolicy(policy);
  }

  protected remove(s: ScopeDto) {
    this.service.delete(s.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(`Deleted ${s.name}.`); this.list.reload(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
