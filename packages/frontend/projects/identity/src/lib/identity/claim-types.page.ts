import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ClaimTypeDto, ClaimTypeService, IdentityClaimValueType, SheetDirective, apiError, Toaster } from '@nazem0/abp-admin-ng-core';

type ClaimTypeEdit = ClaimTypeDto | 'new';
const VALUE_TYPES = [IdentityClaimValueType.String, IdentityClaimValueType.Int, IdentityClaimValueType.Boolean, IdentityClaimValueType.DateTime];

@Component({
  selector: 'abp-claim-type-form',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!type()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="ct-title">
      @if (type()) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <h2 id="ct-title">{{ (x ? 'AbpAdmin::ClaimTypes:Edit' : 'AbpAdmin::ClaimTypes:New') | abpLocalization }} @if (x) { <small class="mono">{{ x.name }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            <label class="field"><span>{{ 'AbpAdmin::Common:Name' | abpLocalization }} <i>*</i></span>
              <input class="input mono" name="name" required maxlength="256" autocomplete="off" [value]="x?.name ?? ''" placeholder="employee_number" /></label>
            <label class="field"><span>{{ 'AbpAdmin::ClaimTypes:ValueType' | abpLocalization }}</span>
              <select class="input" name="valueType">
                @for (v of valueTypes; track v) { <option [value]="v" [selected]="(x?.valueType ?? 0) === v">{{ ('AbpAdmin::ClaimTypes:Type:' + v) | abpLocalization }}</option> }
              </select></label>
            <label class="field"><span>{{ 'AbpAdmin::ClaimTypes:Regex' | abpLocalization }}</span>
              <input class="input mono" name="regex" maxlength="512" [value]="x?.regex ?? ''" placeholder="^E\\d+$" />
              <small>{{ 'AbpAdmin::ClaimTypes:RegexHint' | abpLocalization }}</small></label>
            <label class="field"><span>{{ 'AbpAdmin::ClaimTypes:RegexDescription' | abpLocalization }}</span>
              <input class="input" name="regexDescription" maxlength="128" [value]="x?.regexDescription ?? ''" /></label>
            <label class="field"><span>{{ 'AbpAdmin::Common:Description' | abpLocalization }}</span>
              <input class="input" name="description" maxlength="256" [value]="x?.description ?? ''" /></label>
            <label class="check"><input type="checkbox" name="required" [checked]="x?.required" />
              <span><b>{{ 'AbpAdmin::Common:Required' | abpLocalization }}</b><small>{{ 'AbpAdmin::ClaimTypes:RequiredHint' | abpLocalization }}</small></span></label>
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="saving()">{{ (saving() ? 'AbpAdmin::Common:Saving' : x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Common:Create') | abpLocalization }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `.sh-foot .alert { flex: 1; }`,
})
export class ClaimTypeFormComponent {
  private readonly service = inject(ClaimTypeService);
  readonly type = input<ClaimTypeEdit | null>(null);
  readonly closed = output<void>();
  readonly saved = output<string>();
  protected readonly valueTypes = VALUE_TYPES;
  protected readonly existing = computed(() => { const t = this.type(); return t && t !== 'new' ? t : null; });
  protected readonly error = linkedSignal<ClaimTypeEdit | null, string | null>({ source: this.type, computation: () => null });
  protected readonly saving = signal(false);

  protected save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? '').trim() || null;
    const dto = {
      name: text('name') ?? '',
      valueType: Number(fd.get('valueType')) as IdentityClaimValueType,
      regex: text('regex'),
      regexDescription: text('regexDescription'),
      description: text('description'),
      required: fd.has('required'),
    };
    const x = this.existing();
    this.saving.set(true);
    this.error.set(null);
    (x ? this.service.update(x.id!, dto) : this.service.create(dto)).subscribe({
      next: () => { this.saving.set(false); this.saved.emit(dto.name); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}

/** Claim types: the claims users and roles may carry (free Identity module, no UI of its own). */
@Component({
  selector: 'abp-claim-types-page',
  imports: [ClaimTypeFormComponent, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::ClaimTypes:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::ClaimTypes:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpAdmin.ClaimTypes.Create')) {
          <button class="btn primary" (click)="editing.set('new')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ 'AbpAdmin::ClaimTypes:New' | abpLocalization }}
          </button>
        }
      </header>

      <section class="card stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input class="input" type="search" placeholder="{{ 'AbpAdmin::ClaimTypes:Search' | abpLocalization }}" [attr.aria-label]="'AbpAdmin::Common:Search' | abpLocalization"
                   (change)="filter.set($any($event.target).value.trim())" (search)="filter.set($any($event.target).value.trim())" />
          </label>
        </div>
        @if (list.error()) {
          <div class="state err">{{ 'AbpAdmin::ClaimTypes:LoadError' | abpLocalization }} <button class="btn" (click)="list.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
        } @else if (list.isLoading() && !rows().length) {
          <div class="skeleton rows">@for (i of [1, 2, 3]; track i) { <i></i> }</div>
        } @else if (!rows().length) {
          <div class="state empty"><b>{{ 'AbpAdmin::ClaimTypes:Empty' | abpLocalization }}</b></div>
        } @else {
          <table class="table">
            <thead><tr><th>{{ 'AbpAdmin::Common:Name' | abpLocalization }}</th><th>{{ 'AbpAdmin::ClaimTypes:ValueType' | abpLocalization }}</th><th class="hide-sm">{{ 'AbpAdmin::ClaimTypes:Regex' | abpLocalization }}</th><th>{{ 'AbpAdmin::Roles:Col:Flags' | abpLocalization }}</th><th><span class="sr-only">{{ 'AbpAdmin::Common:Actions' | abpLocalization }}</span></th></tr></thead>
            <tbody>
              @for (t of rows(); track t.id) {
                <tr>
                  <td><b class="mono">{{ t.name }}</b>@if (t.description) { <small class="muted block">{{ t.description }}</small> }</td>
                  <td>{{ ('AbpAdmin::ClaimTypes:Type:' + (t.valueType ?? 0)) | abpLocalization }}</td>
                  <td class="hide-sm mono muted">{{ t.regex || '—' }}</td>
                  <td><span class="pills">
                    @if (t.isStatic) { <span class="pill tone-accent" [title]="'AbpAdmin::ClaimTypes:StaticHint' | abpLocalization">{{ 'AbpAdmin::Roles:Static' | abpLocalization }}</span> }
                    @if (t.required) { <span class="pill tone-warn">{{ 'AbpAdmin::Common:Required' | abpLocalization }}</span> }
                  </span></td>
                  <td class="actions">
                    @if (confirming() === t.id) {
                      <span class="confirm">{{ 'AbpAdmin::ClaimTypes:DeleteConfirm' | abpLocalization: t.name! }}
                        <button class="btn sm danger" (click)="remove(t)">{{ 'AbpAdmin::Common:Delete' | abpLocalization }}</button>
                        <button class="btn sm" (click)="confirming.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button></span>
                    } @else if (!t.isStatic) {
                      @if (can('AbpAdmin.ClaimTypes.Update')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Edit' | abpLocalization" (click)="editing.set(t)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      }
                      @if (can('AbpAdmin.ClaimTypes.Delete')) {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Delete' | abpLocalization" (click)="confirming.set(t.id!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <footer class="pager"><span class="muted">{{ 'AbpAdmin::ClaimTypes:Count' | abpLocalization: total().toString() }}</span></footer>
        }
      </section>
    </div>

    <abp-claim-type-form [type]="editing()" (closed)="editing.set(null)"
                         (saved)="toaster.ok(l.instant('AbpAdmin::ClaimTypes:Saved', $event)); editing.set(null); list.reload()" />
  `,
  styles: `.block { display: block; }`,
})
export class ClaimTypesPage {
  private readonly service = inject(ClaimTypeService);
  private readonly permissions = inject(PermissionService);
  protected readonly toaster = inject(Toaster);
  protected readonly l = inject(LocalizationService);

  protected readonly filter = signal('');
  protected readonly editing = signal<ClaimTypeEdit | null>(null);
  protected readonly confirming = signal<string | null>(null);

  protected readonly list = rxResource({
    params: () => ({ filter: this.filter() || undefined, maxResultCount: 500 }),
    stream: ({ params }) => this.service.getList(params),
  });
  protected readonly rows = computed<ClaimTypeDto[]>(() => this.list.value()?.items ?? []);
  protected readonly total = computed(() => this.list.value()?.totalCount ?? 0);

  protected can(policy: string) {
    return this.permissions.getGrantedPolicy(policy);
  }

  protected remove(t: ClaimTypeDto) {
    this.service.delete(t.id!).subscribe({
      next: () => { this.confirming.set(null); this.toaster.ok(this.l.instant('AbpAdmin::ClaimTypes:Deleted', t.name!)); this.list.reload(); },
      error: e => { this.confirming.set(null); this.toaster.error(apiError(e)); },
    });
  }
}
