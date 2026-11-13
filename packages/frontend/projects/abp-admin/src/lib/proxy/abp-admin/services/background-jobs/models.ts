import type { EntityDto, PagedAndSortedResultRequestDto } from '@abp/ng.core';
import type { BackgroundJobPriority } from '../../../volo/abp/background-jobs/background-job-priority.enum';
import type { BackgroundJobState } from './background-job-state.enum';

export interface BackgroundJobCountsDto {
  waiting?: number;
  retrying?: number;
  abandoned?: number;
}

export interface BackgroundJobDto extends EntityDto<string> {
  applicationName?: string | null;
  jobName?: string;
  jobArgs?: string;
  tryCount?: number;
  creationTime?: string;
  nextTryTime?: string;
  lastTryTime?: string | null;
  isAbandoned?: boolean;
  priority?: BackgroundJobPriority;
}

export interface GetBackgroundJobListInput extends PagedAndSortedResultRequestDto {
  state?: BackgroundJobState | null;
  jobName?: string | null;
}
