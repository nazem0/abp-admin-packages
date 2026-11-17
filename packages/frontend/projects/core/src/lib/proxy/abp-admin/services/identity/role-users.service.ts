import type { MoveAllUsersDto, MoveAllUsersResultDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class RoleUsersService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';

  moveAllUsers = (id: string, input: MoveAllUsersDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, MoveAllUsersResultDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/role-users/${id}/move-all-users`,
      body: input,
    },
      { apiName: this.apiName,...config });
}
