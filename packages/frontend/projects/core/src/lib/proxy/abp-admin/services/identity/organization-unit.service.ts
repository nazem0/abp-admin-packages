import type { CreateOrganizationUnitDto, GetOrganizationUnitMembersInput, IdListDto, MoveOrganizationUnitDto, OrganizationUnitDto, OrganizationUnitMemberDto, OrganizationUnitRoleDto, UpdateOrganizationUnitDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class OrganizationUnitService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  addMembers = (id: string, input: IdListDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/abp-admin/organization-unit/${id}/members`,
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  addRoles = (id: string, input: IdListDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/abp-admin/organization-unit/${id}/roles`,
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  create = (input: CreateOrganizationUnitDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, OrganizationUnitDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/organization-unit',
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  delete = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/organization-unit/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getMembers = (id: string, input: GetOrganizationUnitMembersInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<OrganizationUnitMemberDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/organization-unit/${id}/members`,
      params: { filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  getRoles = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, OrganizationUnitRoleDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/organization-unit/${id}/roles`,
    },
      { apiName: this.apiName,...config });
  

  
  getTree = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, OrganizationUnitDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/organization-unit/tree',
    },
      { apiName: this.apiName,...config });
  

  
  move = (id: string, input: MoveOrganizationUnitDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/abp-admin/organization-unit/${id}/move`,
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  removeMember = (id: string, userId: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/organization-unit/${id}/member/${userId}`,
    },
      { apiName: this.apiName,...config });
  

  
  removeRole = (id: string, roleId: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/organization-unit/${id}/role/${roleId}`,
    },
      { apiName: this.apiName,...config });
  

  
  update = (id: string, input: UpdateOrganizationUnitDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'PUT',
      url: `/api/abp-admin/organization-unit/${id}`,
      body: input,
    },
      { apiName: this.apiName,...config });
}
