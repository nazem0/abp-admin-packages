import type { PagedAndSortedResultRequestDto } from '@abp/ng.core';

export interface EntityEnumValueDto {
  name?: string;
  value?: number;
}

export interface EntityFieldDto {
  name?: string;
  type?: string;
  required?: boolean;
  maxLength?: number | null;
  readOnly?: boolean;
  isKey?: boolean;
  enumValues?: EntityEnumValueDto[] | null;
  reference?: EntityReferenceDto | null;
}

export interface EntityInfoDto {
  name?: string;
  keyType?: string;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

export interface EntityReferenceDto {
  entity?: string;
  keyField?: string;
  displayField?: string;
}

export interface EntitySchemaDto {
  name?: string;
  keyFields?: string[];
  displayField?: string;
  fields?: EntityFieldDto[];
}

export interface EntityValuesDto {
  values?: Record<string, any>;
}

export interface GetEntityRowsInput extends PagedAndSortedResultRequestDto {
  filter?: string | null;
}
