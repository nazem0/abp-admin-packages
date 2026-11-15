/*
 * @nazem0/abp-admin-ng-audit-logging: audit logs (dashboard, request traces), entity changes and entity history.
 * Backend: AbpAdmin.AuditLogging. Usage: abpAdminRoutes(abpAdminAuditLogging, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';

export const abpAdminAuditLogging: AbpAdminFeature = {
  nav: [
    { path: 'audit-logs', label: 'Audit logs', labelKey: 'AbpAdmin::Nav:AuditLogs', section: 'Monitoring', policy: 'AbpAdmin.AuditLogs', keywords: 'requests http trace errors',
      icon: 'M4 5h16M4 12h10M4 19h7M17 15l2 2 3-4' },
    { path: 'entity-changes', label: 'Entity changes', labelKey: 'AbpAdmin::Nav:EntityChanges', section: 'Monitoring', policy: 'AbpAdmin.AuditLogs', keywords: 'history data diff',
      icon: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5' },
  ],
  routes: [
    {
      path: 'audit-logs',
      loadComponent: () => import('./lib/audit-logs/audit-logs.page').then(c => c.AuditLogsPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.AuditLogs' },
    },
    {
      path: 'entity-changes',
      loadComponent: () => import('./lib/entity-changes/entity-changes.page').then(c => c.EntityChangesPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.AuditLogs' },
    },
  ],
};

// For custom composition: the request detail sheet and the entity diff / timeline / history components.
export * from './lib/audit-logs/audit-log-detail.component';
export * from './lib/entity-changes/change-diff.component';
export * from './lib/entity-changes/entity-timeline.component';
export * from './lib/entity-changes/entity-history.component';
