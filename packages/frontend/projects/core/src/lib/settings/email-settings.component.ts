import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { Component, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { EmailSettingsService } from '../proxy/volo/abp/setting-management';
import { apiError } from '../shared/api-error';

type Status = { text: string; error?: boolean } | null;

/** SMTP settings (ABP Setting Management "Emailing") plus a test-email sender. */
@Component({
  selector: 'abp-email-settings',
  imports: [LocalizationPipe],
  template: `
    <section class="card email" aria-labelledby="em-h">
      <div class="intro">
        <h2 id="em-h">{{ 'AbpAdmin::Settings:Email:Title' | abpLocalization }}</h2>
        <p class="muted">{{ 'AbpAdmin::Settings:Email:Intro' | abpLocalization }}</p>

        @if (canTest()) {
          <form class="test form" #t (submit)="$event.preventDefault(); sendTest(t)">
            <h3>{{ 'AbpAdmin::Settings:Email:SendTest' | abpLocalization }}</h3>
            <label class="field"><span>{{ 'AbpAdmin::Settings:Email:To' | abpLocalization }}</span>
              <input class="input" name="to" type="email" required placeholder="you@example.com" autocomplete="email" /></label>
            <label class="field"><span>{{ 'AbpAdmin::Settings:Email:Subject' | abpLocalization }}</span>
              <input class="input" name="subject" required [value]="'AbpAdmin::Settings:Email:TestSubject' | abpLocalization" /></label>
            <div class="actions">
              <button class="btn" [disabled]="testing()">{{ (testing() ? 'AbpAdmin::Settings:Email:Sending' : 'AbpAdmin::Settings:Email:SendTestButton') | abpLocalization }}</button>
              @if (testStatus(); as s) { <span class="status" [class.err]="s.error" role="status">{{ s.text }}</span> }
            </div>
            <small class="muted">{{ 'AbpAdmin::Settings:Email:TestHint' | abpLocalization }}</small>
          </form>
        }
      </div>

      @if (data.isLoading()) {
        <div class="body"><div class="skeleton rows">@for (i of [1, 2, 3, 4]; track i) { <i></i> }</div></div>
      } @else if (data.error()) {
        <div class="body state err">{{ 'AbpAdmin::Settings:Email:LoadFailed' | abpLocalization }} <button class="btn" (click)="data.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
      } @else if (data.value(); as s) {
        <form class="body form" #f (submit)="$event.preventDefault(); save(f)">
          <fieldset>
            <legend>{{ 'AbpAdmin::Settings:Email:Sender' | abpLocalization }}</legend>
            <div class="grid-2">
              <label class="field"><span>{{ 'AbpAdmin::Settings:Email:FromAddress' | abpLocalization }} <i>*</i></span>
                <input class="input" name="defaultFromAddress" type="email" required [value]="s.defaultFromAddress ?? ''" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Settings:Email:FromName' | abpLocalization }} <i>*</i></span>
                <input class="input" name="defaultFromDisplayName" required [value]="s.defaultFromDisplayName ?? ''" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{{ 'AbpAdmin::Settings:Email:SmtpServer' | abpLocalization }}</legend>
            <div class="grid-host">
              <label class="field"><span>{{ 'AbpAdmin::Settings:Email:Host' | abpLocalization }}</span>
                <input class="input" name="smtpHost" [value]="s.smtpHost ?? ''" placeholder="smtp.example.com" /></label>
              <label class="field"><span>{{ 'AbpAdmin::Settings:Email:Port' | abpLocalization }}</span>
                <input class="input" name="smtpPort" type="number" min="1" max="65535" [value]="s.smtpPort ?? 25" /></label>
            </div>
            <label class="check"><input type="checkbox" class="switch" name="smtpEnableSsl" [checked]="s.smtpEnableSsl" />
              <span>{{ 'AbpAdmin::Settings:Email:UseSsl' | abpLocalization }} <small>{{ 'AbpAdmin::Settings:Email:UseSslHint' | abpLocalization }}</small></span></label>
          </fieldset>
          <fieldset>
            <legend>{{ 'AbpAdmin::Settings:Email:Authentication' | abpLocalization }}</legend>
            <label class="check"><input type="checkbox" class="switch" name="smtpUseDefaultCredentials" [checked]="defaultCreds()"
                                        (change)="defaultCreds.set($any($event.target).checked)" />
              <span>{{ 'AbpAdmin::Settings:Email:UseDefaultCredentials' | abpLocalization }} <small>{{ 'AbpAdmin::Settings:Email:UseDefaultCredentialsHint' | abpLocalization }}</small></span></label>
            @if (!defaultCreds()) {
              <div class="grid-2">
                <label class="field"><span>{{ 'AbpAdmin::Settings:Email:UserName' | abpLocalization }}</span>
                  <input class="input" name="smtpUserName" autocomplete="off" [value]="s.smtpUserName ?? ''" /></label>
                <label class="field"><span>{{ 'AbpAdmin::Settings:Email:Password' | abpLocalization }}</span>
                  <input class="input" name="smtpPassword" type="password" autocomplete="new-password" [value]="s.smtpPassword ?? ''" /></label>
                <label class="field"><span>{{ 'AbpAdmin::Settings:Email:Domain' | abpLocalization }}</span>
                  <input class="input" name="smtpDomain" [value]="s.smtpDomain ?? ''" /></label>
              </div>
            }
          </fieldset>
          <div class="actions">
            <button class="btn primary" [disabled]="saving()">{{ (saving() ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save') | abpLocalization }}</button>
            @if (status(); as st) { <span class="status" [class.err]="st.error" role="status">{{ st.text }}</span> }
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .email { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); padding: 0; overflow: hidden; }
    @media (max-width: 860px) { .email { grid-template-columns: 1fr; } }
    .intro { padding: 22px; display: flex; flex-direction: column; gap: 14px; border-inline-end: 1px solid var(--border); }
    @media (max-width: 860px) { .intro { border-inline-end: 0; border-bottom: 1px solid var(--border); } }
    h2 { font-size: 16px; font-weight: 650; }
    h3 { font-size: 13.5px; font-weight: 650; }
    .intro p { margin: 0; line-height: 1.55; }
    .test { margin-top: auto; padding: 16px; border-radius: var(--radius); background: var(--surface-2); gap: 12px; }
    .test small { font-size: 12px; }
    .body { padding: 22px; }
    fieldset { display: grid; gap: 12px; margin: 0; padding: 0; border: 0; }
    legend { padding: 0 0 8px; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    .grid-host { display: grid; grid-template-columns: minmax(0, 1fr) 110px; gap: 14px; }
    .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .status { font-size: 13px; color: var(--ok); }
    .status.err { color: var(--err); }
  `,
})
export class EmailSettingsComponent {
  private readonly service = inject(EmailSettingsService);
  private readonly l = inject(LocalizationService);
  protected readonly canTest = signal(inject(PermissionService).getGrantedPolicy('SettingManagement.Emailing.Test'));

  protected readonly data = rxResource({ stream: () => this.service.get() });
  protected readonly defaultCreds = linkedSignal(() => !!this.data.value()?.smtpUseDefaultCredentials);

  protected readonly saving = signal(false);
  protected readonly status = signal<Status>(null);
  protected readonly testing = signal(false);
  protected readonly testStatus = signal<Status>(null);

  protected save(form: HTMLFormElement) {
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? '').trim();
    const custom = !fd.has('smtpUseDefaultCredentials');
    const dto = {
      defaultFromAddress: text('defaultFromAddress'),
      defaultFromDisplayName: text('defaultFromDisplayName'),
      smtpHost: text('smtpHost') || undefined,
      smtpPort: Number(text('smtpPort')) || undefined,
      smtpEnableSsl: fd.has('smtpEnableSsl'),
      smtpUseDefaultCredentials: !custom,
      // Hidden fields keep their stored values.
      smtpUserName: custom ? text('smtpUserName') || undefined : this.data.value()?.smtpUserName,
      smtpPassword: custom ? String(fd.get('smtpPassword') ?? '') || undefined : this.data.value()?.smtpPassword,
      smtpDomain: custom ? text('smtpDomain') || undefined : this.data.value()?.smtpDomain,
    };
    this.saving.set(true);
    this.status.set(null);
    this.service.update(dto).subscribe({
      next: () => { this.saving.set(false); this.status.set({ text: this.l.instant('AbpAdmin::Settings:Saved') }); this.data.set({ ...this.data.value(), ...dto }); },
      error: e => { this.saving.set(false); this.status.set({ text: apiError(e), error: true }); },
    });
  }

  protected sendTest(form: HTMLFormElement) {
    const fd = new FormData(form);
    this.testing.set(true);
    this.testStatus.set(null);
    this.service.sendTestEmail({
      senderEmailAddress: this.data.value()?.defaultFromAddress ?? '',
      targetEmailAddress: String(fd.get('to')),
      subject: String(fd.get('subject')),
      body: this.l.instant('AbpAdmin::Settings:Email:TestBody'),
    }).subscribe({
      next: () => { this.testing.set(false); this.testStatus.set({ text: this.l.instant('AbpAdmin::Settings:Email:TestSent') }); },
      error: e => { this.testing.set(false); this.testStatus.set({ text: apiError(e), error: true }); },
    });
  }
}
