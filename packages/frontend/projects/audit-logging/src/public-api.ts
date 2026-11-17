/*
 * @nazem0/abp-admin-ng-audit-logging: audit logs (dashboard, request traces), entity changes and entity history,
 * and the audit log retention settings tab. Entity changes opens one entity's history with ?type=<full type name>&id=<id>.
 * Backend: AbpAdmin.AuditLogging. Usage: abpAdminRoutes(abpAdminAuditLogging, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';
import { AuditLogSettingsComponent } from './lib/settings/audit-log-settings.component';

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
  settings: [
    { path: 'settings/audit-logs', label: 'Audit logs', labelKey: 'AbpAdmin::Nav:SettingsAuditLogs', section: 'Settings', policy: 'AbpAdmin.AuditLogs.ManageRetention',
      keywords: 'retention cleanup delete old logs', icon: 'M4 5h16M4 12h10M4 19h7M17 15l2 2 3-4', component: AuditLogSettingsComponent },
  ],
};

// For custom composition: the request detail sheet and the entity diff / timeline / history components.
export * from './lib/audit-logs/audit-log-detail.component';
export * from './lib/entity-changes/change-diff.component';
export * from './lib/entity-changes/entity-timeline.component';
export * from './lib/entity-changes/entity-history.component';
