/*
 * @nazem0/abp-admin-ng-entity-explorer: pick any entity the backend exposes (EntityExplorerOptions), find rows by key
 * or text and edit them as database rows; columns and forms come from the entity's schema at runtime.
 * Backend: AbpAdmin.EntityExplorer. Usage: abpAdminRoutes(abpAdminEntityExplorer, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';

export const abpAdminEntityExplorer: AbpAdminFeature = {
  nav: [
    { path: 'entities', label: 'Entity explorer', labelKey: 'AbpAdmin::Nav:Entities', section: 'System', policy: 'AbpAdmin.Entities', keywords: 'data rows database table records edit',
      icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  ],
  routes: [
    {
      path: 'entities',
      loadComponent: () => import('./lib/entities/entities.page').then(c => c.EntitiesPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.Entities' },
    },
  ],
};
