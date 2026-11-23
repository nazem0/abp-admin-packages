import type { ClearCacheInput, ClearCacheResultDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class CacheService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  clear = (input: ClearCacheInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClearCacheResultDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/app/cache/clear',
      body: input,
    },
      { apiName: this.apiName,...config });
}
