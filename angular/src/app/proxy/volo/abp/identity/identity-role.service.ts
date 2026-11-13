import type { GetIdentityRolesInput, IdentityRoleCreateDto, IdentityRoleDto, IdentityRoleUpdateDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { ListResultDto, PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class IdentityRoleService {
  private restService = inject(RestService);
  apiName = 'AbpIdentity';
  

  
  create = (input: IdentityRoleCreateDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, IdentityRoleDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/identity/roles',
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  delete = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/identity/roles/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  get = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, IdentityRoleDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/identity/roles/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getAllList = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, ListResultDto<IdentityRoleDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/identity/roles/all',
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetIdentityRolesInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<IdentityRoleDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/identity/roles',
      params: { filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount, extraProperties: input.extraProperties },
    },
      { apiName: this.apiName,...config });
  

  
  update = (id: string, input: IdentityRoleUpdateDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, IdentityRoleDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/identity/roles/${id}`,
      body: input,
    },
      { apiName: this.apiName,...config });
}
