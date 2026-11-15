import { LocalizationPipe } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IdentityUserDto, IdentityUserService, SheetDirective, apiError } from '@nazem0/abp-admin-ng-core';

export type UserEdit = IdentityUserDto | 'new';

/** Create / edit a user, including role membership. Plain native form: values are read with FormData on submit. */
@Component({
  selector: 'abp-user-form',
  imports: [SheetDirective, LocalizationPipe],
  template: `
    <dialog [appSheet]="!!user()" (dismiss)="closed.emit()" class="narrow" aria-labelledby="uf-title">
      @if (user(); as u) {
        @let x = existing();
        <form #f (submit)="$event.preventDefault(); save(f)">
          <header class="sh-head">
            <span class="avatar" aria-hidden="true">{{ (x?.userName ?? '+')[0].toUpperCase() }}</span>
            <h2 id="uf-title">{{ (x ? 'AbpAdmin::Users:Form:EditUser' : 'AbpAdmin::Users:NewUser') | abpLocalization }} @if (x) { <small>{{ x.userName }}</small> }</h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" [attr.aria-label]="'AbpAdmin::Common:Close' | abpLocalization">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div class="sh-body form">
            <div class="grid-2">
              <label class="field"><span>{{ 'AbpAdmin::Users:Form:UserName' | abpLocalization }} <i>*</i></span>
                <input class="input" name="userName" required maxlength="256" autocomplete="off" [value]="x?.userName ?? ''" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Users:Email' | abpLocalization }} <i>*</i></span>
                <input class="input" name="email" type="email" required maxlength="256" autocomplete="off" [value]="x?.email ?? ''" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Users:Form:FirstName' | abpLocalization }}</span>
                <input class="input" name="name" maxlength="64" [value]="x?.name ?? ''" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Users:Form:LastName' | abpLocalization }}</span>
                <input class="input" name="surname" maxlength="64" [value]="x?.surname ?? ''" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Users:Phone' | abpLocalization }}</span>
                <input class="input" name="phoneNumber" type="tel" maxlength="16" [value]="x?.phoneNumber ?? ''" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Users:Form:Password' | abpLocalization }} @if (!x) { <i>*</i> }</span>
                <span class="pw">
                  <input class="input" name="password" [type]="showPw() ? 'text' : 'password'" [required]="!x" autocomplete="new-password" maxlength="128" />
                  <button type="button" class="link" (click)="showPw.set(!showPw())">{{ (showPw() ? 'AbpAdmin::Users:Form:Hide' : 'AbpAdmin::Users:Form:Show') | abpLocalization }}</button>
                </span>
                <small>{{ (x ? 'AbpAdmin::Users:Form:PasswordKeep' : 'AbpAdmin::Users:Form:PasswordPolicy') | abpLocalization }}</small></label>
            </div>

            <fieldset>
              <legend>{{ 'AbpAdmin::Users:Form:Roles' | abpLocalization }}</legend>
              @if (roles.isLoading() || current.isLoading()) {
                <p class="muted">{{ 'AbpAdmin::Users:Form:LoadingRoles' | abpLocalization }}</p>
              } @else {
                <div class="roles">
                  @for (r of roles.value().items; track r.id) {
                    <label class="check">
                      <input type="checkbox" name="roleNames" [value]="r.name" [checked]="selected().has(r.name!)" />
                      <span>{{ r.name }}
                        @if (r.isDefault) { <small>{{ 'AbpAdmin::Users:Form:DefaultForNew' | abpLocalization }}</small> }</span>
                    </label>
                  } @empty { <p class="muted">{{ 'AbpAdmin::Users:Form:NoRoles' | abpLocalization }}</p> }
                </div>
              }
            </fieldset>

            <fieldset>
              <legend>{{ 'AbpAdmin::Users:Form:Account' | abpLocalization }}</legend>
              <label class="check"><input type="checkbox" class="switch" name="isActive" [checked]="x ? x.isActive : true" />
                <span>{{ 'AbpAdmin::Common:Active' | abpLocalization }} <small>{{ 'AbpAdmin::Users:Form:ActiveHint' | abpLocalization }}</small></span></label>
              <label class="check"><input type="checkbox" class="switch" name="lockoutEnabled" [checked]="x ? x.lockoutEnabled : true" />
                <span>{{ 'AbpAdmin::Users:Form:Lockout' | abpLocalization }} <small>{{ 'AbpAdmin::Users:Form:LockoutHint' | abpLocalization }}</small></span></label>
            </fieldset>
          </div>

          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
            <button class="btn primary" [disabled]="saving()">{{ (saving() ? 'AbpAdmin::Common:Saving' : x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Users:Form:CreateUser') | abpLocalization }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    fieldset { display: grid; gap: 12px; margin: 0; padding: 14px 0 0; border: 0; border-top: 1px solid var(--border); }
    legend { padding: 0 0 4px; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    .roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .pw { position: relative; display: flex; }
    .pw .link { position: absolute; inset-inline-end: 10px; top: 10px; }
    .pw .input { padding-inline-end: 52px; }
    .sh-foot .alert { flex: 1; }
  `,
})
export class UserFormComponent {
  private readonly service = inject(IdentityUserService);

  readonly user = input<UserEdit | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly existing = computed(() => {
    const u = this.user();
    return u && u !== 'new' ? u : null;
  });

  protected readonly showPw = linkedSignal({ source: this.user, computation: () => false });
  protected readonly error = linkedSignal<UserEdit | null, string | null>({ source: this.user, computation: () => null });
  protected readonly saving = signal(false);

  protected readonly roles = rxResource({
    params: () => (this.user() ? true : undefined),
    stream: () => this.service.getAssignableRoles(),
    defaultValue: { items: [] },
  });
  protected readonly current = rxResource({
    params: () => this.existing()?.id,
    stream: ({ params }) => this.service.getRoles(params),
  });

  /** Roles to pre-check: the user's roles, or the default roles for a new user. */
  protected readonly selected = computed(() => new Set(
    (this.existing() ? this.current.value()?.items ?? [] : this.roles.value().items?.filter(r => r.isDefault) ?? [])
      .map(r => r.name!)));

  protected save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? '').trim();
    const dto = {
      userName: text('userName'),
      email: text('email'),
      name: text('name') || undefined,
      surname: text('surname') || undefined,
      phoneNumber: text('phoneNumber') || undefined,
      isActive: fd.has('isActive'),
      lockoutEnabled: fd.has('lockoutEnabled'),
      roleNames: fd.getAll('roleNames').map(String),
    };
    const password = String(fd.get('password') ?? '');
    const x = this.existing();
    this.saving.set(true);
    this.error.set(null);
    const req = x
      ? this.service.update(x.id!, { ...dto, password: password || undefined, concurrencyStamp: x.concurrencyStamp })
      : this.service.create({ ...dto, password });
    req.subscribe({
      next: () => { this.saving.set(false); this.saved.emit(); },
      error: e => { this.saving.set(false); this.error.set(apiError(e)); },
    });
  }
}
