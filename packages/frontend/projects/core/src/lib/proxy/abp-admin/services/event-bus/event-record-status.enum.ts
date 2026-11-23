import { mapEnumToOptions } from '@abp/ng.core';

export enum EventRecordStatus {
  Waiting = 0,
  Retrying = 1,
  Discarded = 2,
  Processed = 3,
}

export const eventRecordStatusOptions = mapEnumToOptions(EventRecordStatus);
