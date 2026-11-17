import type { EntityDto, PagedAndSortedResultRequestDto } from '@abp/ng.core';

export interface CreateOrganizationUnitDto {
  parentId?: string | null;
  displayName: string;
}

export interface GetOrganizationUnitMembersInput extends PagedAndSortedResultRequestDto {
  filter?: string | null;
}

export interface IdListDto {
  ids: string[];
}

export interface LockUserInput {
  until?: string | null;
}

export interface MoveOrganizationUnitDto {
  newParentId?: string | null;
}

export interface OrganizationUnitDto extends EntityDto<string> {
  parentId?: string | null;
  code?: string;
  displayName?: string;
  memberCount?: number;
  roleCount?: number;
}

export interface OrganizationUnitMemberDto extends EntityDto<string> {
  userName?: string;
  name?: string | null;
  surname?: string | null;
  email?: string | null;
}

export interface OrganizationUnitRoleDto extends EntityDto<string> {
  name?: string;
}

export interface UpdateOrganizationUnitDto {
  displayName: string;
}

export enum IdentityClaimValueType {
  String = 0,
  Int = 1,
  Boolean = 2,
  DateTime = 3,
}

export interface ClaimTypeDto extends EntityDto<string> {
  name?: string;
  required?: boolean;
  isStatic?: boolean;
  regex?: string | null;
  regexDescription?: string | null;
  description?: string | null;
  valueType?: IdentityClaimValueType;
  creationTime?: string;
}

export interface CreateUpdateClaimTypeDto {
  name: string;
  required?: boolean;
  regex?: string | null;
  regexDescription?: string | null;
  description?: string | null;
  valueType?: IdentityClaimValueType;
}

export interface GetClaimTypeListInput extends PagedAndSortedResultRequestDto {
  filter?: string | null;
}

export interface ClaimDto {
  type: string;
  value?: string;
}

export interface UpdateClaimsDto {
  claims: ClaimDto[];
}

export interface MoveAllUsersDto {
  targetRoleId?: string | null;
}

export interface MoveAllUsersResultDto {
  moved?: number;
}

export interface UserImportErrorDto {
  line?: number;
  message?: string;
}

export interface UserImportResultDto {
  created?: number;
  skipped?: string[];
  errors?: UserImportErrorDto[];
}
