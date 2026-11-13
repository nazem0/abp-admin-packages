import type { EntityDto, PagedAndSortedResultRequestDto } from '@abp/ng.core';

export interface GetSecurityLogListInput extends PagedAndSortedResultRequestDto {
  startTime?: string | null;
  endTime?: string | null;
  actionName?: string | null;
  userName?: string | null;
  userId?: string | null;
  clientId?: string | null;
  clientIpAddress?: string | null;
  correlationId?: string | null;
  failedOnly?: boolean | null;
}

export interface SecurityLogActionCountDto {
  action?: string;
  count?: number;
}

export interface SecurityLogDto extends EntityDto<string> {
  applicationName?: string | null;
  identity?: string | null;
  action?: string | null;
  userId?: string | null;
  userName?: string | null;
  clientId?: string | null;
  correlationId?: string | null;
  clientIpAddress?: string | null;
  browserInfo?: string | null;
  creationTime?: string;
}
