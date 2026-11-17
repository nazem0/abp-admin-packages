import type { ClaimTypeDto, CreateUpdateClaimTypeDto, GetClaimTypeListInput } from './models';
import type { PagedResultDto } from '@abp/ng.core';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ClaimTypeService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';

  getList = (input: GetClaimTypeListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<ClaimTypeDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/claim-type',
      params: { filter: input.filter, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });

  create = (input: CreateUpdateClaimTypeDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClaimTypeDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/claim-type',
      body: input,
    },
      { apiName: this.apiName,...config });

  update = (id: string, input: CreateUpdateClaimTypeDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClaimTypeDto>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/claim-type/${id}`,
      body: input,
    },
      { apiName: this.apiName,...config });

  delete = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/claim-type/${id}`,
    },
      { apiName: this.apiName,...config });
}
