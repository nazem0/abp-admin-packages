/*
 * @nazem0/abp-admin-ng-background-jobs: the persisted background job queue.
 * Backend: AbpAdmin.BackgroundJobs. Usage: abpAdminRoutes(abpAdminBackgroundJobs, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';

export const abpAdminBackgroundJobs: AbpAdminFeature = {
  nav: [
    { path: 'background-jobs', label: 'Background jobs', labelKey: 'AbpAdmin::Nav:BackgroundJobs', section: 'Monitoring', policy: 'AbpAdmin.BackgroundJobs', keywords: 'queue retry abandoned',
      icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v4h-4' },
  ],
  routes: [
    {
      path: 'background-jobs',
      loadComponent: () => import('./lib/background-jobs/background-jobs.page').then(c => c.BackgroundJobsPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.BackgroundJobs' },
    },
  ],
};
