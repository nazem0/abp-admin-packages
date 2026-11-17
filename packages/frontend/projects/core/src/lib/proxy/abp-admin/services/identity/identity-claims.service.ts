import type { ClaimDto, ClaimTypeDto, UpdateClaimsDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class IdentityClaimsService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';

  getTypes = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClaimTypeDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/identity-claims/types',
    },
      { apiName: this.apiName,...config });

  getUserClaims = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClaimDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/identity-claims/${id}/user-claims`,
    },
      { apiName: this.apiName,...config });

  updateUserClaims = (id: string, input: UpdateClaimsDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClaimDto[]>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/identity-claims/${id}/user-claims`,
      body: input,
    },
      { apiName: this.apiName,...config });

  getRoleClaims = (id: string, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClaimDto[]>({
      method: 'GET',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/identity-claims/${id}/role-claims`,
    },
      { apiName: this.apiName,...config });

  updateRoleClaims = (id: string, input: UpdateClaimsDto, config?: Partial<Rest.Config>) =>
    this.restService.request<any, ClaimDto[]>({
      method: 'PUT',
      headers: { Accept: 'application/json' },
      url: `/api/abp-admin/identity-claims/${id}/role-claims`,
      body: input,
    },
      { apiName: this.apiName,...config });
}
