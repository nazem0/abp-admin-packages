import type { ApplicationDto, CreateUpdateApplicationDto, GetOpenIddictListInput } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ApplicationService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  create = (input: CreateUpdateApplicationDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ApplicationDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/app/application',
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  delete = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/app/application/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  get = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ApplicationDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/app/application/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetOpenIddictListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<ApplicationDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/app/application',
      params: { filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  update = (id: string, input: CreateUpdateApplicationDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ApplicationDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/app/application/${id}`,
      body: input,
    },
      { apiName: this.apiName,...config });
}
