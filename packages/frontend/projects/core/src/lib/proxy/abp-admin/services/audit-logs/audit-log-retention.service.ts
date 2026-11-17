import type { AuditLogCleanupResultDto, AuditLogRetentionDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuditLogRetentionService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';

  get = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, AuditLogRetentionDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/audit-log-retention',
    },
      { apiName: this.apiName,...config });

  update = (input: AuditLogRetentionDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, AuditLogRetentionDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/audit-log-retention',
      body: input,
    },
      { apiName: this.apiName,...config });

  cleanup = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, AuditLogCleanupResultDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/audit-log-retention/cleanup',
    },
      { apiName: this.apiName,...config });
}
