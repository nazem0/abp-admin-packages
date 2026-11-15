import type { ConnectionStringCheckDto, CreateTenantDto, GetTenantListInput, MultiTenancyDto, TenantConnectionStringDto, TenantDto, UpdateTenantConnectionStringDto, UpdateTenantDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TenantService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  activate = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/tenant/${id}/activate`,
    },
      { apiName: this.apiName,...config });
  

  
  checkConnectionString = (input: TenantConnectionStringDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ConnectionStringCheckDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/tenant/check-connection-string',
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  create = (input: CreateTenantDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/tenant',
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  deactivate = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/tenant/${id}/deactivate`,
    },
      { apiName: this.apiName,...config });
  

  
  delete = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/tenant/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  get = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/tenant/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getConnectionString = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantConnectionStringDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/tenant/${id}/connection-string`,
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetTenantListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<TenantDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/tenant',
      params: { filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  getMultiTenancy = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, MultiTenancyDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/tenant/multi-tenancy',
    },
      { apiName: this.apiName,...config });
  

  
  update = (id: string, input: UpdateTenantDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/tenant/${id}`,
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  updateConnectionString = (id: string, input: UpdateTenantConnectionStringDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/tenant/${id}/connection-string`,
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  updateMultiTenancy = (input: MultiTenancyDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, MultiTenancyDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/tenant/multi-tenancy',
      body: input,
    },
      { apiName: this.apiName,...config });
}
