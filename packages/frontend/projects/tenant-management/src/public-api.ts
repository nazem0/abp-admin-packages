/*
 * @nazem0/abp-admin-ng-tenant-management: tenants, the multi-tenancy switch and tenant databases. With the identity
 * package, the host's Users page also lists every tenant's users. Backend: AbpAdmin.TenantManagement.
 * Usage: abpAdminRoutes(abpAdminTenantManagement, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';

export const abpAdminTenantManagement: AbpAdminFeature = {
  nav: [
    { path: 'tenants', label: 'Tenants', labelKey: 'AbpAdmin::Nav:Tenants', section: 'System', policy: 'AbpAdmin.Tenants', keywords: 'multi-tenancy saas customers enable disable',
      icon: 'M4 21V6l7-3v18M11 21h9V10l-9-3M7.5 9v.01M7.5 13v.01M7.5 17v.01M15 13v.01M15 17v.01M3 21h18' },
  ],
  routes: [
    {
      path: 'tenants',
      loadComponent: () => import('./lib/tenants/tenants.page').then(c => c.TenantsPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.Tenants' },
    },
  ],
};
