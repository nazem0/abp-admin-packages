import type { EntityDto, PagedAndSortedResultRequestDto } from '@abp/ng.core';

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
