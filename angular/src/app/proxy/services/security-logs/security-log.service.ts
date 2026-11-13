import type { GetSecurityLogListInput, SecurityLogActionCountDto, SecurityLogDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SecurityLogService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  get = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, SecurityLogDto>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/app/security-log/${id}`,
    },
      { apiName: this.apiName,...config });
  

  
  getActionCounts = (startTime: string, endTime: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, SecurityLogActionCountDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/app/security-log/action-counts',
      params: { startTime, endTime },
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetSecurityLogListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<SecurityLogDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/app/security-log',
      params: { startTime: input.startTime, endTime: input.endTime, actionName: input.actionName, userName: input.userName, userId: input.userId, clientId: input.clientId, clientIpAddress: input.clientIpAddress, correlationId: input.correlationId, failedOnly: input.failedOnly, sorting: input.sorting, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
}
