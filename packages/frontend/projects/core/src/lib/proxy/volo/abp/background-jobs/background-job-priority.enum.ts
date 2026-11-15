import { mapEnumToOptions } from '@abp/ng.core';

export enum BackgroundJobPriority {
  Low = 5,
  BelowNormal = 10,
  Normal = 15,
  AboveNormal = 20,
  High = 25,
}

export const backgroundJobPriorityOptions = mapEnumToOptions(BackgroundJobPriority);
