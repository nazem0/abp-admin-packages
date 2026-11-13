import type { SettingGroupDto, UpdateSettingDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class IdentitySettingsService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  get = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, SettingGroupDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/identity-settings',
    },
      { apiName: this.apiName,...config });
  

  
  update = (input: readonly UpdateSettingDto[], config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'PUT',
      url: '/api/abp-admin/identity-settings',
      body: input,
    },
      { apiName: this.apiName,...config });
}
