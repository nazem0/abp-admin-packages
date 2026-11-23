import type { EventBoxKind } from './event-box-kind.enum';
import type { EventRecordStatus } from './event-record-status.enum';
import type { PagedResultRequestDto } from '@abp/ng.core';

export interface EventBoxDto {
  name?: string;
  kind?: EventBoxKind;
  dbContext?: string;
  waiting?: number;
  retrying?: number;
  discarded?: number;
  processed?: number;
}

export interface EventRecordDto {
  id?: string;
  eventName?: string;
  eventData?: string;
  creationTime?: string;
  status?: EventRecordStatus;
  messageId?: string | null;
  retryCount?: number;
  nextRetryTime?: string | null;
  handledTime?: string | null;
}

export interface GetEventRecordListInput extends PagedResultRequestDto {
  kind?: EventBoxKind;
  box?: string;
  status?: EventRecordStatus | null;
  eventName?: string | null;
}
