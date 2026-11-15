import type { BackgroundJobCountsDto, BackgroundJobDto, GetBackgroundJobListInput } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class BackgroundJobService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  delete = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/background-job/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  get = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, BackgroundJobDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/background-job/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getCounts = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, BackgroundJobCountsDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/background-job/counts',
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetBackgroundJobListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<BackgroundJobDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/background-job',
      params: { state: input.state, jobName: input.jobName, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  retry = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/abp-admin/background-job/${id}/retry`,
    },
      { apiName: this.apiName,...config });
}
