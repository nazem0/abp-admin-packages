import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';
import type { NameValue } from '../models';

@Injectable({
  providedIn: 'root',
})
export class TimeZoneSettingsService {
  private restService = inject(RestService);
  apiName = 'SettingManagement';
  

  
  get = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, string>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/setting-management/timezone',
    },
      { apiName: this.apiName,...config });
  

  
  getTimezones = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, NameValue[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/setting-management/timezone/timezones',
    },
      { apiName: this.apiName,...config });
  

  
  update = (timezone: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: '/api/setting-management/timezone',
      params: { timezone },
    },
      { apiName: this.apiName,...config });
}
