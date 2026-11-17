import { LocalizationPipe, LocalizationService } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { ClaimDto, IdentityClaimValueType, IdentityClaimsService } from '../proxy/services/identity';
import { SheetDirective } from '../shared/sheet.directive';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

export interface ClaimsTarget {
  kind: 'user' | 'role';
  id: string;
  title: string;
}

/** Edits the claims of a user or role: one row per claim, types from the Claim types page. */
@Component({
  selector: 'app-claims-editor',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!target()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="ce-title">
      @if (target(); as t) {
        <form (submit)="$event.preventDefault(); save(t)">
          <header class="sh-head">
            <h2 id="ce-title">{{ '::Claims:Title' | abpLocalization }} <small>{{ t.title }}</small></h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="sh-body form">
            @if (claims.isLoading() || types.isLoading()) {
              <div class="skeleton rows">@for (i of [1, 2]; track i) { <i></i> }</div>
            } @else if (!typeList().length) {
              <p class="muted">{{ '::Claims:NoTypes' | abpLocalization }}</p>
            } @else {
              @for (c of rows(); track $index) {
                <div class="row">
                  <select class="input" [attr.aria-label]="'::Claims:Type' | abpLocalization" (change)="edit($index, { type: $any($event.target).value })">
                    @for (ty of typeList(); track ty.name) { <option [value]="ty.name" [selected]="ty.name === c.type">{{ ty.name }}</option> }
                  </select>
                  <input class="input" [attr.aria-label]="'::Claims:Value' | abpLocalization" [value]="c.value ?? ''" [type]="inputType(c.type)"
                         [placeholder]="hint(c.type)" (input)="edit($index, { value: $any($event.target).value })" />
                  <button type="button" class="icon-btn" [title]="'::Common:Delete' | abpLocalization" (click)="removeRow($index)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
                </div>
              } @empty {
                <p class="muted">{{ '::Claims:None' | abpLocalization }}</p>
              }
              <button type="button" class="btn" (click)="add()">+ {{ '::Claims:Add' | abpLocalization }}</button>
            }
          </div>
          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ '::Common:Cancel' | abpLocalization }}</button>
            @if (editable()) {
              <button class="btn primary" [disabled]="saving() || claims.isLoading()">{{ (saving() ? '::Common:Saving' : '::Common:Save') | abpLocalization }}</button>
            }
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    .row { display: grid; grid-template-columns: minmax(120px, 1fr) 1.4fr auto; gap: 8px; align-items: center; }
    .sh-foot .alert { flex: 1; }
  `,
})
export class ClaimsEditorComponent {
  private readonly service = inject(IdentityClaimsService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  readonly target = input<ClaimsTarget | null>(null);
  /** Without the Update permission the claims are shown read-only. */
  readonly editable = input(true);
  readonly closed = output<void>();

  protected readonly types = rxResource({
    params: () => this.target() ?? undefined,
    stream: () => this.service.getTypes(),
    defaultValue: [],
  });
  protected readonly typeList = computed(() => this.types.value());
  protected readonly claims = rxResource({
    params: () => this.target() ?? undefined,
    stream: ({ params: t }) => t.kind === 'user' ? this.service.getUserClaims(t.id) : t.kind === 'role' ? this.service.getRoleClaims(t.id) : of([]),
    defaultValue: [],
  });
  protected readonly rows = linkedSignal<ClaimDto[]>(() => this.claims.value().map(c => ({ ...c })));
  protected readonly error = linkedSignal<ClaimsTarget | null, string | null>({ source: this.target, computation: () => null });
  protected readonly saving = signal(false);

  protected add() {
    this.rows.update(r => [...r, { type: this.typeList()[0]?.name ?? '', value: '' }]);
  }

  protected edit(i: number, change: Partial<ClaimDto>) {
    this.rows.update(r => r.map((c, j) => (j === i ? { ...c, ...change } : c)));
  }

  protected removeRow(i: number) {
    this.rows.update(r => r.filter((_, j) => j !== i));
  }

  private type(name: string) {
    return this.typeList().find(t => t.name === name);
  }

  protected inputType(name: string) {
    const v = this.type(name)?.valueType;
    return v === IdentityClaimValueType.Int ? 'number' : v === IdentityClaimValueType.DateTime ? 'datetime-local' : 'text';
  }

  protected hint(name: string) {
    const t = this.type(name);
    return t?.regexDescription || (t?.valueType === IdentityClaimValueType.Boolean ? 'true / false' : t?.description) || '';
  }

  protected save(t: ClaimsTarget) {
    const input = { claims: this.rows().filter(c => c.type) };
    this.saving.set(true);
    this.error.set(null);
    (t.kind === 'user' ? this.service.updateUserClaims(t.id, input) : this.service.updateRoleClaims(t.id, input)).subscribe({
      next: () => { this.saving.set(false); this.toaster.ok(this.l.instant('::Claims:Saved', t.title)); this.closed.emit(); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}
