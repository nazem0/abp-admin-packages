import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ScopeDto, ScopeService, relative, SheetDirective, apiError, Toaster } from '@nazem0/abp-admin-ng-core';

type ScopeEdit = ScopeDto | 'new';

@Component({
  selector: 'abp-scope-form',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!scope()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="sf-title">
      @if (scope()) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="sf-title">{{ (x ? 'AbpAdmin::Scopes:Form:Edit' : 'AbpAdmin::Scopes:Form:New') | abpLocalization }} @if (x) { <small class="mono">{{ x.name }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            <label class="field"><span>{{ 'AbpAdmin::Common:Name' | abpLocalization }} <i>*</i></span>
              <input class="input mono" name="name" required maxlength="200" pattern="[^\\s]+" [title]="'AbpAdmin::Scopes:Form:NoSpaces' | abpLocalization" autocomplete="off" [value]="x?.name ?? ''" placeholder="Orders" />
              <small>{{ 'AbpAdmin::Scopes:Form:NameHint' | abpLocalization: 'scope' }}</small></label>
            <label class="field"><span>{{ 'AbpAdmin::Common:DisplayName' | abpLocalization }}</span>
              <input class="input" name="displayName" maxlength="200" [value]="x?.displayName ?? ''" placeholder="Orders API" /></label>
            <label class="field"><span>{{ 'AbpAdmin::Common:Description' | abpLocalization }}</span>
              <textarea class="input" name="description" rows="2">{{ x?.description ?? '' }}</textarea></label>
            <label class="field"><span>{{ 'AbpAdmin::Scopes:Form:Resources' | abpLocalization }}</span>
              <textarea class="input mono" name="resources" rows="3" placeholder="Orders">{{ (x?.resources ?? []).join('\\n') }}</textarea>
              <small>{{ 'AbpAdmin::Scopes:Form:ResourcesHint' | abpLocalization: 'aud' }}</small></label>
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="saving()">{{ saving() ? ('AbpAdmin::Common:Saving' | abpLocalization) : x ? ('AbpAdmin::Common:Save' | abpLocalization) : ('AbpAdmin::Scopes:Form:CreateScope' | abpLocalization) }}</button>
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
  private readonly l = inject(LocalizationService);
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
      next: () => { this.saving.set(false); this.toaster.ok(this.l.instant(x ? 'AbpAdmin::Scopes:Form:Saved' : 'AbpAdmin::Scopes:Form:Created', dto.name)); this.saved.emit(); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}

/** OpenIddict scopes: the API permissions clients can request, and the audiences they map to. */
@Component({
  selector: 'abp-scopes-page',
  imports: [ScopeFormComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::Scopes:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::Scopes:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpAdmin.Scopes.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ 'AbpAdmin::Scopes:New' | abpLocalization }}
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="{{ 'AbpAdmin::Scopes:SearchPlaceholder' | abpLocalization }}" [attr.aria-label]="'AbpAdmin::Scopes:Search' | abpLocalization"
                   (change)="filter.set($any($event.target).value.trim())" (search)="filter.set($any($event.target).value.trim())" />
          </label>
        </div>
        @if (list.error()) {
          <div class="state err">{{ 'AbpAdmin::Scopes:LoadError' | abpLocalization }} <button class="btn" (click)="list.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty"><b>{{ 'AbpAdmin::Scopes:Empty' | abpLocalization }}</b><span class="muted">{{ filter() ? ('AbpAdmin::Scopes:NoMatch' | abpLocalization: filter()) : ('AbpAdmin::Scopes:DefineFirst' | abpLocalization) }}</span></div>
        } @else {
          <table class="table">
            <thead><tr><th>{{ 'AbpAdmin::Scopes:Scope' | abpLocalization }}</th><th>{{ 'AbpAdmin::Scopes:Resources' | abpLocalization }}</th><th class="hide-sm">{{ 'AbpAdmin::Common:Created' | abpLocalization }}</th><th><span class="sr-only">{{ 'AbpAdmin::Common:Actions' | abpLocalization }}</span></th></tr></thead>
            <tbody>
              @for (s of rows(); track s.id) {
                <tr>
                  <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">{{ (s.name || '?')[0].toUpperCase() }}</span>
                    <span><b class="mono">{{ s.name }}</b><small>{{ s.displayName }}{{ s.description ? ' — ' + s.description : '' }}</small></span></span></td>
                  <td><span class="pills">@for (r of s.resources; track r) { <span class="pill tone-accent mono">{{ r }}</span> } @empty { <span class="muted">—</span> }</span></td>
                  <td class="hide-sm muted">{{ relative(s.creationTime) }}</td>
                  <td class="actions">
                    @if (confirming() === s.id) {
                      <span class="confirm">{{ 'AbpAdmin::Scopes:DeleteConfirm' | abpLocalization: s.name! }}
                        <button class="btn sm danger" (click)="remove(s)">{{ 'AbpAdmin::Common:Delete' | abpLocalization }}</button>
                        <button class="btn sm" (click)="confirming.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button></span>
                    } @else {
                      @if (can('AbpAdmin.Scopes.Update')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Edit' | abpLocalization" [attr.aria-label]="'AbpAdmin::Scopes:EditAria' | abpLocalization: s.name!" (click)="editing.set(s)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpAdmin.Scopes.Delete')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Delete' | abpLocalization" [attr.aria-label]="'AbpAdmin::Scopes:DeleteAria' | abpLocalization: s.name!" (click)="confirming.set(s.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <footer class="pager"><span class="muted">{{ (total() === 1 ? 'AbpAdmin::Scopes:CountOne' : 'AbpAdmin::Scopes:CountMany') | abpLocalization: total().toString() }}</span></footer>
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
  private readonly l = inject(LocalizationService);

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
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('AbpAdmin::Scopes:Deleted', s.name!)); this.list.reload(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
