import { authGuard, permissionGuard } from '@abp/ng.core';
import { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    loadComponent: () => import('./overview/overview.page').then(c => c.OverviewPage),
    canActivate: [authGuard],
  },
  {
    path: 'security-logs',
    loadComponent: () => import('./security-logs/security-logs.page').then(c => c.SecurityLogsPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpAdmin.SecurityLogs' },
  },
  {
    path: 'background-jobs',
    loadComponent: () => import('./background-jobs/background-jobs.page').then(c => c.BackgroundJobsPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpAdmin.BackgroundJobs' },
  },
  {
    path: 'organization-units',
    loadComponent: () => import('./identity/organization-units.page').then(c => c.OrganizationUnitsPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpAdmin.OrganizationUnits' },
  },
  {
    path: 'applications',
    loadComponent: () => import('./openiddict/applications.page').then(c => c.ApplicationsPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpAdmin.Applications' },
  },
  {
    path: 'scopes',
    loadComponent: () => import('./openiddict/scopes.page').then(c => c.ScopesPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpAdmin.Scopes' },
  },
  {
    path: 'audit-logs',
    loadComponent: () => import('./audit-logs/audit-logs.page').then(c => c.AuditLogsPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpAdmin.AuditLogs' },
  },
  {
    path: 'entity-changes',
    loadComponent: () => import('./entity-changes/entity-changes.page').then(c => c.EntityChangesPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpAdmin.AuditLogs' },
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then(c => c.SettingsPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'SettingManagement.TimeZone || SettingManagement.Emailing || AbpAdmin.IdentitySettings' },
  },
  {
    path: 'users',
    loadComponent: () => import('./identity/users.page').then(c => c.UsersPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpIdentity.Users' },
  },
  {
    path: 'roles',
    loadComponent: () => import('./identity/roles.page').then(c => c.RolesPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'AbpIdentity.Roles' },
  },
  {
    path: 'features',
    loadComponent: () => import('./features/features.page').then(c => c.FeaturesPage),
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'FeatureManagement.ManageHostFeatures' },
  },
  { path: '**', redirectTo: 'overview' },
];
