import type { EntityDto, PagedAndSortedResultRequestDto, PagedResultDto } from '@abp/ng.core';
import type { IdentityUserDto } from '../../volo/abp/identity/models';

export interface ConnectionStringCheckDto {
  connected?: boolean;
  databaseExists?: boolean;
}

export interface CreateTenantDto {
  connectionString?: string | null;
  name: string;
  adminEmailAddress: string;
  adminPassword: string;
}

export interface GetTenantListInput extends PagedAndSortedResultRequestDto {
  filter?: string | null;
}

export interface MultiTenancyDto {
  isEnabled?: boolean;
}

export interface TenantConnectionStringDto {
  connectionString?: string | null;
}

export interface TenantDto extends EntityDto<string> {
  name?: string;
  isActive?: boolean;
  hasOwnDatabase?: boolean;
  creationTime?: string;
}

export interface UpdateTenantConnectionStringDto extends TenantConnectionStringDto {
  adminEmailAddress?: string | null;
  adminPassword?: string | null;
}

export interface UpdateTenantDto {
  name: string;
}

export interface GetTenantUserListInput extends PagedAndSortedResultRequestDto {
  filter?: string | null;
  tenantId?: string | null;
  hostOnly?: boolean;
}

export interface TenantUserListResultDto extends PagedResultDto<IdentityUserDto> {
  tenantNames: Record<string, string>;
}

export interface SetTenantUserPasswordDto {
  userName: string;
  password: string;
}

export interface InviteTenantAdminDto {
  email: string;
}

export interface TenantInvitationDto {
  userName?: string;
  link?: string;
  emailSent?: boolean;
  emailError?: string | null;
  expiresAt?: string;
}
