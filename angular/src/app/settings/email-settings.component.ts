import { PermissionService } from '@abp/ng.core';
import { Component, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { EmailSettingsService } from '../proxy/volo/abp/setting-management';
import { apiError } from '../shared/api-error';

type Status = { text: string; error?: boolean } | null;

/** SMTP settings (ABP Setting Management "Emailing") plus a test-email sender. */
@Component({
  selector: 'app-email-settings',
  template: `
    <section class="card email" aria-labelledby="em-h">
      <div class="intro">
        <h2 id="em-h">Email</h2>
        <p class="muted">The SMTP server used for password resets, email confirmations and every other email the application sends.</p>

        @if (canTest()) {
          <form class="test form" #t (submit)="$event.preventDefault(); sendTest(t)">
            <h3>Send a test email</h3>
            <label class="field"><span>To</span>
              <input class="input" name="to" type="email" required placeholder="you@example.com" autocomplete="email" /></label>
            <label class="field"><span>Subject</span>
              <input class="input" name="subject" required value="ABP Admin test email" /></label>
            <div class="actions">
              <button class="btn" [disabled]="testing()">{{ testing() ? 'Sending…' : 'Send test' }}</button>
              @if (testStatus(); as s) { <span class="status" [class.err]="s.error" role="status">{{ s.text }}</span> }
            </div>
            <small class="muted">Uses the saved settings, so save changes first.</small>
          </form>
        }
      </div>

      @if (data.isLoading()) {
        <div class="body"><div class="skeleton rows">@for (i of [1, 2, 3, 4]; track i) { <i></i> }</div></div>
      } @else if (data.error()) {
        <div class="body state err">Couldn't load email settings. <button class="btn" (click)="data.reload()">Retry</button></div>
      } @else if (data.value(); as s) {
        <form class="body form" #f (submit)="$event.preventDefault(); save(f)">
          <fieldset>
            <legend>Sender</legend>
            <div class="grid-2">
              <label class="field"><span>From address <i>*</i></span>
                <input class="input" name="defaultFromAddress" type="email" required [value]="s.defaultFromAddress ?? ''" /></label>
              <label class="field"><span>From name <i>*</i></span>
                <input class="input" name="defaultFromDisplayName" required [value]="s.defaultFromDisplayName ?? ''" /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>SMTP server</legend>
            <div class="grid-host">
              <label class="field"><span>Host</span>
                <input class="input" name="smtpHost" [value]="s.smtpHost ?? ''" placeholder="smtp.example.com" /></label>
              <label class="field"><span>Port</span>
                <input class="input" name="smtpPort" type="number" min="1" max="65535" [value]="s.smtpPort ?? 25" /></label>
            </div>
            <label class="check"><input type="checkbox" class="switch" name="smtpEnableSsl" [checked]="s.smtpEnableSsl" />
              <span>Use SSL/TLS <small>Usually on for port 465 and 587.</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Authentication</legend>
            <label class="check"><input type="checkbox" class="switch" name="smtpUseDefaultCredentials" [checked]="defaultCreds()"
                                        (change)="defaultCreds.set($any($event.target).checked)" />
              <span>Use default credentials <small>Sign in as the server process (Windows auth). Turn off to enter a user name and password.</small></span></label>
            @if (!defaultCreds()) {
              <div class="grid-2">
                <label class="field"><span>User name</span>
                  <input class="input" name="smtpUserName" autocomplete="off" [value]="s.smtpUserName ?? ''" /></label>
                <label class="field"><span>Password</span>
                  <input class="input" name="smtpPassword" type="password" autocomplete="new-password" [value]="s.smtpPassword ?? ''" /></label>
                <label class="field"><span>Domain</span>
                  <input class="input" name="smtpDomain" [value]="s.smtpDomain ?? ''" /></label>
              </div>
            }
          </fieldset>
          <div class="actions">
            <button class="btn primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
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
      next: () => { this.saving.set(false); this.status.set({ text: 'Saved.' }); this.data.set({ ...this.data.value(), ...dto }); },
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
      body: 'This is a test email sent from ABP Admin. If you can read it, the SMTP settings work.',
    }).subscribe({
      next: () => { this.testing.set(false); this.testStatus.set({ text: 'Sent. Check the inbox.' }); },
      error: e => { this.testing.set(false); this.testStatus.set({ text: apiError(e), error: true }); },
    });
  }
}
