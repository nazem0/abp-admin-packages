import type { ClearCacheResultDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  clearAll = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClearCacheResultDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/app/cache/clear-all',
    },
      { apiName: this.apiName,...config });
  

  
  clearRole = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClearCacheResultDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: `/api/app/cache/${id}/clear-role`,
    },
      { apiName: this.apiName,...config });
  

  
  clearUser = (id: string, tenant: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClearCacheResultDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: `/api/app/cache/${id}/clear-user`,
      params: { tenant },
    },
      { apiName: this.apiName,...config });
}
