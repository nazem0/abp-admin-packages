import type { EventBoxKind } from './event-box-kind.enum';
import type { EventBoxDto, EventRecordDto, GetEventRecordListInput } from './models';
import { RestService, Rest } from '@abp/ng.core';
import type { PagedResultDto } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class EventBoxService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';
  

  
  delete = (kind: EventBoxKind, box: string, id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'DELETE',
      url: `/api/abp-admin/event-box/${id}`,
      params: { kind, box },
    },
      { apiName: this.apiName,...config });
  

  
  getBoxes = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, EventBoxDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/event-box/boxes',
    },
      { apiName: this.apiName,...config });
  

  
  getList = (input: GetEventRecordListInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, PagedResultDto<EventRecordDto>>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/event-box',
      params: { kind: input.kind, box: input.box, status: input.status, eventName: input.eventName, skipCount: input.skipCount, maxResultCount: input.maxResultCount },
    },
      { apiName: this.apiName,...config });
  

  
  retry = (box: string, id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/abp-admin/event-box/${id}/retry`,
      params: { box },
    },
      { apiName: this.apiName,...config });
}
