/*
 * @nazem0/abp-admin-ng-openiddict: OpenIddict client applications and API scopes.
 * Backend: AbpAdmin.OpenIddict. Usage: abpAdminRoutes(abpAdminOpenIddict, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';

export const abpAdminOpenIddict: AbpAdminFeature = {
  nav: [
    { path: 'applications', label: 'Applications', labelKey: 'AbpAdmin::Nav:Applications', section: 'OpenIddict', policy: 'AbpAdmin.Applications', keywords: 'clients oauth oidc secret redirect',
      icon: 'M4 5h16v14H4zM4 9h16M8 13h3' },
    { path: 'scopes', label: 'Scopes', labelKey: 'AbpAdmin::Nav:Scopes', section: 'OpenIddict', policy: 'AbpAdmin.Scopes', keywords: 'api resources audience',
      icon: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z' },
  ],
  routes: [
    {
      path: 'applications',
      loadComponent: () => import('./lib/openiddict/applications.page').then(c => c.ApplicationsPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.Applications' },
    },
    {
      path: 'scopes',
      loadComponent: () => import('./lib/openiddict/scopes.page').then(c => c.ScopesPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'AbpAdmin.Scopes' },
    },
  ],
  actions: [
    { id: 'new-app', labelKey: 'AbpAdmin::Palette:NewApplication', hintKey: 'AbpAdmin::Palette:Action', keywords: 'create client oauth', policy: 'AbpAdmin.Applications.Create', path: 'applications', query: { new: '1' } },
    { id: 'new-scope', labelKey: 'AbpAdmin::Palette:NewScope', hintKey: 'AbpAdmin::Palette:Action', keywords: 'create api', policy: 'AbpAdmin.Scopes.Create', path: 'scopes', query: { new: '1' } },
  ],
};
