/*
 * @nazem0/abp-admin-ng — headless admin UI for ABP Framework.
 * Mount ABP_ADMIN_ROUTES under any path; everything else is exported for custom composition.
 */
export * from './lib/layout/abp-admin.routes';
export * from './lib/layout/abp-admin-layout.component';
export * from './lib/shared/nav';
export * from './lib/shared/theme';
export * from './lib/shared/toast';
export * from './lib/shared/sheet.directive';
export * from './lib/shared/api-error';
export * from './lib/permissions/permissions-editor.component';
export * from './lib/entity-changes/change-diff.component';
export * from './lib/entity-changes/entity-timeline.component';
export * from './lib/entity-changes/entity-history.component';
export * from './lib/audit-logs/audit-log-detail.component';
export * as AbpAdminProxy from './lib/proxy/abp-admin/services';
