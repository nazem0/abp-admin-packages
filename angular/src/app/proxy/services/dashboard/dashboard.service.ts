import type { DashboardDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  get = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, DashboardDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/app/dashboard',
    },
      { apiName: this.apiName,...config });
}
