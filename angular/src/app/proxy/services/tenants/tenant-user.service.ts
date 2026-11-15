import type { GetTenantUserListInput, TenantUserListResultDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TenantUserService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  getList = (input: GetTenantUserListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantUserListResultDto>({
      method: 'GET',
      url: '/api/app/tenant-user',
      params: { filter: input.filter, tenantId: input.tenantId, hostOnly: input.hostOnly, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
    { apiName: this.apiName,...config });
}
