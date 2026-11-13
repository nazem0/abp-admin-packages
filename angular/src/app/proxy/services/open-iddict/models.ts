import type { EntityDto, PagedAndSortedResultRequestDto } from '@abp/ng.core';

export interface ApplicationDto extends EntityDto<string> {
  clientId?: string;
  displayName?: string | null;
  clientType?: string | null;
  consentType?: string | null;
  applicationType?: string | null;
  grantTypes?: string[];
  scopes?: string[];
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  requirePkce?: boolean;
  clientUri?: string | null;
  logoUri?: string | null;
  creationTime?: string;
}

export interface CreateUpdateApplicationDto {
  clientId: string;
  displayName?: string | null;
  clientType: string;
  consentType: string;
  applicationType: string;
  clientSecret?: string | null;
  grantTypes?: string[];
  scopes?: string[];
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  requirePkce?: boolean;
  clientUri?: string | null;
  logoUri?: string | null;
}

export interface CreateUpdateScopeDto {
  name: string;
  displayName?: string | null;
  description?: string | null;
  resources?: string[];
}

export interface GetOpenIddictListInput extends PagedAndSortedResultRequestDto {
  filter?: string | null;
}

export interface ScopeDto extends EntityDto<string> {
  name?: string;
  displayName?: string | null;
  description?: string | null;
  resources?: string[];
  creationTime?: string;
}
