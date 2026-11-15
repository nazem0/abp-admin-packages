import { mapEnumToOptions } from '@abp/ng.core';

export enum BackgroundJobState {
  Waiting = 0,
  Retrying = 1,
  Abandoned = 2,
}

export const backgroundJobStateOptions = mapEnumToOptions(BackgroundJobState);
