import type { InviteTenantAdminDto, SetTenantUserPasswordDto, TenantInvitationDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TenantAdminService {
  private restService = inject(RestService);
  apiName = 'Default';

  setPassword = (id: string, input: SetTenantUserPasswordDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, void>({
      method: 'POST',
      url: `/api/app/tenant-admin/${id}/set-password`,
      body: input,
    },
      { apiName: this.apiName,...config });

  inviteAdmin = (id: string, input: InviteTenantAdminDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, TenantInvitationDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: `/api/app/tenant-admin/${id}/invite-admin`,
      body: input,
    },
      { apiName: this.apiName,...config });
}
