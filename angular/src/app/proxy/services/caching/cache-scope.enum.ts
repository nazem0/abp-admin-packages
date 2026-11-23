import { mapEnumToOptions } from '@abp/ng.core';

export enum CacheScope {
  Everything = 0,
  User = 1,
  Role = 2,
}

export const cacheScopeOptions = mapEnumToOptions(CacheScope);
