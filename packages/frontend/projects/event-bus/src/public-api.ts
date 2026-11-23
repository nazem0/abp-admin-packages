/*
 * @nazem0/abp-admin-ng-event-bus: the distributed event bus outbox and inbox (EF Core boxes).
 * Backend: AbpAdmin.EventBus. Usage: abpAdminRoutes(abpAdminEventBus, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';

export const abpAdminEventBus: AbpAdminFeature = {
  nav: [
    { path: 'events', label: 'Events', labelKey: 'AbpAdmin::Nav:Events', section: 'Monitoring', policy: 'AbpAdmin.EventBoxes', keywords: 'outbox inbox distributed event bus messages retry',
      icon: 'M4 7h12M12 3l4 4-4 4M20 17H8M12 13l-4 4 4 4' },
  ],
  routes: [
    {
      path: 'events',
      loadComponent: () => import('./lib/events/events.page').then(c => c.EventsPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.EventBoxes' },
    },
  ],
};
