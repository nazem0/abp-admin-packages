import type { CreateUpdateScopeDto, GetOpenIddictListInput, ScopeDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ScopeService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  create = (input: CreateUpdateScopeDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ScopeDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/scope',
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  delete = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/scope/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  get = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ScopeDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/scope/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetOpenIddictListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<ScopeDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/scope',
      params: { filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  update = (id: string, input: CreateUpdateScopeDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ScopeDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/scope/${id}`,
      body: input,
    },
      { apiName: this.apiName,...config });
}
