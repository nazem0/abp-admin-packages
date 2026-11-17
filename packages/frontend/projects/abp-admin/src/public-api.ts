/*
 * @nazem0/abp-admin-ng: every ABP Admin feature in one package. Mount ABP_ADMIN_ROUTES under any path.
 * To pick features, depend on @nazem0/abp-admin-ng-core and the feature packages and call abpAdminRoutes(...) instead.
 */
import { abpAdminRoutes } from '@nazem0/abp-admin-ng-core';
import { abpAdminAuditLogging } from '@nazem0/abp-admin-ng-audit-logging';
import { abpAdminIdentity } from '@nazem0/abp-admin-ng-identity';
import { abpAdminOpenIddict } from '@nazem0/abp-admin-ng-openiddict';
import { abpAdminBackgroundJobs } from '@nazem0/abp-admin-ng-background-jobs';
import { abpAdminTenantManagement } from '@nazem0/abp-admin-ng-tenant-management';
import { abpAdminEntityExplorer } from '@nazem0/abp-admin-ng-entity-explorer';

export const ABP_ADMIN_FEATURES_ALL = [
  abpAdminAuditLogging, abpAdminIdentity, abpAdminOpenIddict, abpAdminBackgroundJobs, abpAdminTenantManagement, abpAdminEntityExplorer,
];

export const ABP_ADMIN_ROUTES = abpAdminRoutes(...ABP_ADMIN_FEATURES_ALL);

export * from '@nazem0/abp-admin-ng-core';
export * from '@nazem0/abp-admin-ng-audit-logging';
export * from '@nazem0/abp-admin-ng-identity';
export * from '@nazem0/abp-admin-ng-openiddict';
export * from '@nazem0/abp-admin-ng-background-jobs';
export * from '@nazem0/abp-admin-ng-tenant-management';
export * from '@nazem0/abp-admin-ng-entity-explorer';
