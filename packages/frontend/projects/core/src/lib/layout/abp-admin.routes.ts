import { authGuard, permissionGuard } from '@abp/ng.core';
import { Routes } from '@angular/router';
import { ABP_ADMIN_FEATURES, AbpAdminFeature, AbpAdminRegistry, SETTINGS_ICON } from '../shared/nav';
import { AbpAdminLayoutComponent } from './abp-admin-layout.component';
import { AllSettingsComponent } from '../settings/all-settings.component';

/** What core brings on its own: the overview, ABP's host features, and the Settings page (time zone and email tabs). */
export const abpAdminCore: AbpAdminFeature = {
  nav: [
    { path: 'overview', label: 'Overview', labelKey: 'AbpAdmin::Nav:Overview', section: '', policy: '', keywords: 'home dashboard',
      icon: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v4h-6zM4 20h6v-3H4z' },
    { path: 'features', label: 'Features', labelKey: 'AbpAdmin::Nav:Features', section: 'System', policy: 'FeatureManagement.ManageHostFeatures', keywords: 'toggles limits',
      icon: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4' },
    // Its tabs (children) and policy come from every feature's `settings`.
    { path: 'settings', label: 'Settings', labelKey: 'AbpAdmin::Nav:Settings', section: 'System', keywords: 'email smtp time zone password lockout identity',
      policy: '', icon: SETTINGS_ICON },
  ],
  settings: [
    { path: 'settings/time-zone', label: 'Time zone', labelKey: 'AbpAdmin::Nav:SettingsTimeZone', section: 'Settings', policy: 'SettingManagement.TimeZone',
      keywords: 'clock utc timezone', icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
    { path: 'settings/email', label: 'Email', labelKey: 'AbpAdmin::Nav:SettingsEmail', section: 'Settings', policy: 'SettingManagement.Emailing',
      keywords: 'smtp mail sender', icon: 'M3 6h18v12H3zM3 7l9 6 9-6' },
    { path: 'settings/all', label: 'All settings', labelKey: 'AbpAdmin::Nav:SettingsAll', section: 'Settings', policy: 'AbpAdmin.Settings',
      keywords: 'every setting module configuration value override', icon: 'M4 6h16M4 12h16M4 18h16', component: AllSettingsComponent },
  ],
  routes: [
    { path: 'overview', loadComponent: () => import('../overview/overview.page').then(c => c.OverviewPage) },
    {
      path: 'features',
      loadComponent: () => import('../features/features.page').then(c => c.FeaturesPage),
      canActivate: [permissionGuard],
      data: { requiredPolicy: 'FeatureManagement.ManageHostFeatures' },
    },
    {
      // settings opens the first tab the user may see; settings/:section a specific one. Access is checked per tab.
      path: 'settings',
      children: [
        { path: '', loadComponent: () => import('../settings/settings.page').then(c => c.SettingsPage) },
        { path: ':section', loadComponent: () => import('../settings/settings.page').then(c => c.SettingsPage) },
      ],
    },
  ],
};

/**
 * The admin console with the given features, to mount anywhere:
 * `{ path: 'admin', loadChildren: () => import('@nazem0/abp-admin-ng-core').then(m => m.abpAdminRoutes(abpAdminIdentity, ...)) }`.
 * Core's own pages (overview, features, settings) are always included.
 * Needs `provideRouter(..., withComponentInputBinding())` for deep links (?user=, ?correlation=, ?new=1 ...).
 */
export function abpAdminRoutes(...features: AbpAdminFeature[]): Routes {
  // Core last: within a sidebar section its items (Features, Settings) follow the features' (e.g. Tenants).
  const all = [...features, abpAdminCore];
  return [{
    path: '',
    component: AbpAdminLayoutComponent,
    canActivate: [authGuard],
    providers: [{ provide: ABP_ADMIN_FEATURES, useValue: all }, AbpAdminRegistry],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      ...all.flatMap(f => f.routes ?? []),
      { path: '**', redirectTo: 'overview' },
    ],
  }];
}
