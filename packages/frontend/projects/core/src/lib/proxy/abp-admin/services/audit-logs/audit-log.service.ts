import type { AuditLogDto, AuditLogStatisticsDto, EntityChangeListItemDto, EntityTypeCountDto, GetAuditLogListInput, GetAuditLogStatisticsInput, GetEntityChangeListInput, GetEntityTypeCountsInput } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuditLogService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  get = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, AuditLogDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/audit-log/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getEntityChanges = (input: GetEntityChangeListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<EntityChangeListItemDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/audit-log/entity-changes',
      params: { auditLogId: input.auditLogId, entityTypeFullNames: input.entityTypeFullNames, excludedEntityTypeFullNames: input.excludedEntityTypeFullNames, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount, startTime: input.startTime, endTime: input.endTime, changeType: input.changeType, entityId: input.entityId },
    },
      { apiName: this.apiName,...config });
  

  
  getEntityHistory = (entityId: string, entityTypeFullName: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, EntityChangeListItemDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/audit-log/entity-history/${entityId}`,
      params: { entityTypeFullName },
    },
      { apiName: this.apiName,...config });
  

  
  getEntityTypeCounts = (input: GetEntityTypeCountsInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, EntityTypeCountDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/audit-log/entity-type-counts',
      params: { startTime: input.startTime, endTime: input.endTime, changeType: input.changeType, entityId: input.entityId },
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetAuditLogListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<AuditLogDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/audit-log',
      params: { startTime: input.startTime, endTime: input.endTime, url: input.url, userName: input.userName, httpMethod: input.httpMethod, httpStatusCode: input.httpStatusCode, minExecutionDuration: input.minExecutionDuration, maxExecutionDuration: input.maxExecutionDuration, hasException: input.hasException, correlationId: input.correlationId, clientIpAddress: input.clientIpAddress, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  getStatistics = (input: GetAuditLogStatisticsInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, AuditLogStatisticsDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/audit-log/statistics',
      params: { startTime: input.startTime, endTime: input.endTime },
    },
      { apiName: this.apiName,...config });
}
