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
