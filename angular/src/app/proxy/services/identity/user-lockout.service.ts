import type { LockUserInput } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UserLockoutService {
  private restService = inject(RestService);
  apiName = 'Default';
  

  
  lock = (id: string, input: LockUserInput, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/app/user-lockout/${id}/lock`,
      body: input,
    },
      { apiName: this.apiName,...config });
  

  
  unlock = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/app/user-lockout/${id}/unlock`,
    },
      { apiName: this.apiName,...config });
}
