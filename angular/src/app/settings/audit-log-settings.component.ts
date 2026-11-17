import { LocalizationPipe, LocalizationService } from '@abp/ng.core';
import { Component, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuditLogRetentionService } from '../proxy/services/audit-logs';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

/** How long audit logs are kept; older ones (with their entity changes) are deleted hourly, or now on demand. */
@Component({
  selector: 'app-audit-log-settings',
  imports: [LocalizationPipe],
  template: `
    <section class="card pad" aria-labelledby="al-h">
      <h2 id="al-h">{{ '::Settings:AuditLogs:Title' | abpLocalization }}</h2>
      <p class="muted">{{ '::Settings:AuditLogs:Intro' | abpLocalization }}</p>
      @if (data.isLoading()) {
        <div class="skeleton rows"><i></i></div>
      } @else {
        <form (submit)="$event.preventDefault(); save()">
          <label class="field"><span>{{ '::Settings:AuditLogs:Days' | abpLocalization }}</span>
            <span class="row">
              <input class="input" type="number" min="0" max="36500" required [value]="days()" (input)="days.set(+$any($event.target).value)" />
              <span class="muted">{{ (days() > 0 ? '::Settings:AuditLogs:DaysHint' : '::Settings:AuditLogs:Forever') | abpLocalization: days().toString() }}</span>
            </span></label>
          <div class="actions">
            <button class="btn primary" [disabled]="busy()">{{ (busy() ? '::Common:Saving' : '::Common:Save') | abpLocalization }}</button>
            <button type="button" class="btn" [disabled]="busy() || !(data.value()?.days)" (click)="cleanup()" [title]="'::Settings:AuditLogs:CleanupHint' | abpLocalization">
              {{ '::Settings:AuditLogs:Cleanup' | abpLocalization }}</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .pad { padding: 18px 20px; display: grid; gap: 12px; }
    h2 { font-size: 15px; font-weight: 650; }
    .row { display: flex; align-items: center; gap: 12px; }
    .row .input { width: 120px; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
  `,
})
export class AuditLogSettingsComponent {
  private readonly service = inject(AuditLogRetentionService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);
  protected readonly data = rxResource({ stream: () => this.service.get() });
  protected readonly days = linkedSignal(() => this.data.value()?.days ?? 0);
  protected readonly busy = signal(false);

  protected save() {
    this.busy.set(true);
    this.service.update({ days: this.days() }).subscribe({
      next: () => { this.busy.set(false); this.data.reload(); this.toaster.ok(this.l.instant('::Settings:AuditLogs:Saved')); },
      error: e => { this.busy.set(false); this.toaster.error(apiError(e)); },
    });
  }

  protected cleanup() {
    this.busy.set(true);
    this.service.cleanup().subscribe({
      next: r => { this.busy.set(false); this.toaster.ok(this.l.instant('::Settings:AuditLogs:Cleaned', String(r.deleted ?? 0))); },
      error: e => { this.busy.set(false); this.toaster.error(apiError(e)); },
    });
  }
}
