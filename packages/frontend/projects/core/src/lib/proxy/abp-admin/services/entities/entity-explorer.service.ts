import type { EntityInfoDto, EntitySchemaDto, EntityValuesDto, GetEntityRowsInput } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class EntityExplorerService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  create = (entity: string, input: EntityValuesDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, Record<string, any>>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/entity-explorer',
      params: { entity },
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  delete = (entity: string, id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/entity-explorer/${id}`,
      params: { entity },
    },
      { apiName: this.apiName,...config });
  

  
  get = (entity: string, id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, Record<string, any>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/entity-explorer/${id}`,
      params: { entity },
    },
      { apiName: this.apiName,...config });
  

  
  getEntities = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, EntityInfoDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/entity-explorer/entities',
    },
      { apiName: this.apiName,...config });
  

  
  getList = (entity: string, input: GetEntityRowsInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<Record<string, any>>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/entity-explorer',
      params: { entity, filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  getSchema = (entity: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, EntitySchemaDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/entity-explorer/schema',
      params: { entity },
    },
      { apiName: this.apiName,...config });
  

  
  update = (entity: string, id: string, input: EntityValuesDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, Record<string, any>>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/entity-explorer/${id}`,
      params: { entity },
      body: input,
    },
      { apiName: this.apiName,...config });
}
