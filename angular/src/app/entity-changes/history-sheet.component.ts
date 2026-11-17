import { Component, inject, input, output, signal } from '@angular/core';
import { AuditLogDto, AuditLogService } from '../proxy/services/audit-logs';
import { AuditLogDetailComponent } from '../audit-logs/audit-log-detail.component';
import { EntityHistoryComponent, EntityRef } from './entity-history.component';

/** "Change history" for any page's rows: the entity's history, and the request behind a change. */
@Component({
  selector: 'app-history-sheet',
  imports: [EntityHistoryComponent, AuditLogDetailComponent],
  template: `
    <app-entity-history [entity]="entity()" (closed)="closed.emit()" (openRequest)="openRequest($event)" />
    <app-audit-log-detail [log]="request()" (closed)="request.set(null)" />
  `,
})
export class HistorySheetComponent {
  private readonly service = inject(AuditLogService);
  readonly entity = input<EntityRef | null>(null);
  readonly closed = output<void>();
  protected readonly request = signal<AuditLogDto | null>(null);

  protected openRequest(auditLogId: string) {
    this.closed.emit();
    this.service.get(auditLogId).subscribe(log => this.request.set(log));
  }
}

/** Entity type names ABP records in entity history. */
export const ENTITY_TYPES = {
  user: 'Volo.Abp.Identity.IdentityUser',
  role: 'Volo.Abp.Identity.IdentityRole',
  tenant: 'Volo.Abp.TenantManagement.Tenant',
} as const;
