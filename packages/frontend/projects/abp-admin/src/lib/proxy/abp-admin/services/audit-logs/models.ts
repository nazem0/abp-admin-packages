import type { EntityDto, PagedAndSortedResultRequestDto } from '@abp/ng.core';
import type { EntityChangeType } from '../../../volo/abp/auditing/entity-change-type.enum';

export interface AuditLogActionDto extends EntityDto<string> {
  serviceName?: string | null;
  methodName?: string | null;
  parameters?: string | null;
  executionTime: string;
  executionDuration: number;
}

export interface AuditLogBucketDto {
  key: string;
  count: number;
}

export interface AuditLogDayStatDto {
  date: string;
  requests: number;
  failed: number;
  averageDuration: number;
}

export interface AuditLogDto extends EntityDto<string> {
  applicationName?: string | null;
  userId?: string | null;
  userName?: string | null;
  impersonatorUserId?: string | null;
  impersonatorUserName?: string | null;
  executionTime: string;
  executionDuration: number;
  clientIpAddress?: string | null;
  clientName?: string | null;
  clientId?: string | null;
  correlationId?: string | null;
  browserInfo?: string | null;
  httpMethod?: string | null;
  url?: string | null;
  exceptions?: string | null;
  comments?: string | null;
  httpStatusCode?: number | null;
  actions: AuditLogActionDto[];
  entityChanges: EntityChangeDto[];
}

export interface AuditLogEndpointStatDto {
  httpMethod?: string | null;
  url?: string | null;
  count: number;
  failed: number;
  averageDuration: number;
}

export interface AuditLogStatisticsDto {
  totalRequests: number;
  failedRequests: number;
  averageDuration: number;
  maxDuration: number;
  uniqueUsers: number;
  entityChanges: number;
  days: AuditLogDayStatDto[];
  statusCodes: AuditLogBucketDto[];
  httpMethods: AuditLogBucketDto[];
  topEndpoints: AuditLogEndpointStatDto[];
  slowestEndpoints: AuditLogEndpointStatDto[];
  topUsers: AuditLogBucketDto[];
}

export interface EntityChangeDto extends EntityDto<string> {
  auditLogId?: string;
  changeTime: string;
  changeType: EntityChangeType;
  entityId?: string | null;
  entityTypeFullName?: string | null;
  propertyChanges: EntityPropertyChangeDto[];
}

export interface EntityChangeListItemDto extends EntityChangeDto {
  userName?: string | null;
  httpMethod?: string | null;
  url?: string | null;
}

export interface EntityPropertyChangeDto extends EntityDto<string> {
  propertyName?: string | null;
  propertyTypeFullName?: string | null;
  originalValue?: string | null;
  newValue?: string | null;
}

export interface EntityTypeCountDto {
  entityTypeFullName?: string;
  count?: number;
}

export interface GetAuditLogListInput extends PagedAndSortedResultRequestDto {
  startTime?: string | null;
  endTime?: string | null;
  url?: string | null;
  userName?: string | null;
  httpMethod?: string | null;
  httpStatusCode?: number | null;
  minExecutionDuration?: number | null;
  maxExecutionDuration?: number | null;
  hasException?: boolean | null;
  correlationId?: string | null;
  clientIpAddress?: string | null;
}

export interface GetAuditLogStatisticsInput {
  startTime: string;
  endTime: string;
}

export interface GetEntityChangeListInput extends GetEntityTypeCountsInput {
  auditLogId?: string | null;
  entityTypeFullNames?: string[] | null;
  excludedEntityTypeFullNames?: string[] | null;
  sorting?: string | null;
  skipCount?: number;
  maxResultCount?: number;
}

export interface GetEntityTypeCountsInput {
  startTime?: string | null;
  endTime?: string | null;
  changeType?: EntityChangeType | null;
  entityId?: string | null;
}
