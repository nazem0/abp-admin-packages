import type { SettingValueDto, UpdateSettingDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SettingBrowserService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  getList = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, SettingValueDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/app/setting-browser',
    },
      { apiName: this.apiName,...config });
  

  
  update = (input: readonly UpdateSettingDto[], config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'PUT',
      url: '/api/app/setting-browser',
      body: input,
    },
      { apiName: this.apiName,...config });
}
