import type { UserLookupCountInputDto, UserLookupSearchInputDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { ListResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';
import type { UserData } from '../users/models';

@Injectable({
  providedIn: 'root',
})
export class IdentityUserLookupService {
  private restService = inject(RestService);
  apiName = 'AbpIdentity';
  

  
  findById = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, UserData>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/identity/users/lookup/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  findByUserName = (userName: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, UserData>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/identity/users/lookup/by-username/${userName}`,
    },
      { apiName: this.apiName,...config });
  

  
  getCount = (input: UserLookupCountInputDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, number>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/identity/users/lookup/count',
      params: { filter: input.filter },
    },
      { apiName: this.apiName,...config });
  

  
  search = (input: UserLookupSearchInputDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ListResultDto<UserData>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/identity/users/lookup/search',
      params: { filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount, extraProperties: input.extraProperties },
    },
      { apiName: this.apiName,...config });
}
