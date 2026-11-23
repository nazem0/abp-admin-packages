import type { CacheScope } from './cache-scope.enum';

export interface ClearCacheInput {
  scope?: CacheScope;
  name?: string | null;
}

export interface ClearCacheResultDto {
  tenants?: number;
  users?: number;
  roles?: number;
  keys?: number;
}
