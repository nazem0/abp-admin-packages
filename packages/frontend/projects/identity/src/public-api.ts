/*
 * @nazem0/abp-admin-ng-identity: users (across tenants for the host; claims, CSV import/export), roles (claims, move all users), organization units,
 * claim types, security logs and the
 * Identity & sign-in settings tab. Backend: AbpAdmin.Identity. Usage: abpAdminRoutes(abpAdminIdentity, ...).
 */
import { permissionGuard } from '@abp/ng.core';
import { AbpAdminFeature } from '@nazem0/abp-admin-ng-core';
import { IdentitySettingsComponent } from './lib/settings/identity-settings.component';

const SECURITY_ICON = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2';
const guarded = (policy: string) => ({ canActivate: [permissionGuard], data: { requiredPolicy: policy } });

export const abpAdminIdentity: AbpAdminFeature = {
  nav: [
    { path: 'security-logs', label: 'Security logs', labelKey: 'AbpAdmin::Nav:SecurityLogs', section: 'Monitoring', policy: 'AbpAdmin.SecurityLogs', keywords: 'login sign in failed lockout',
      icon: SECURITY_ICON },
    { path: 'users', label: 'Users', labelKey: 'AbpAdmin::Nav:Users', section: 'Identity', policy: 'AbpIdentity.Users', keywords: 'accounts people lock',
      icon: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2a6.5 6.5 0 0 1 3.5 5.8' },
    { path: 'roles', label: 'Roles', labelKey: 'AbpAdmin::Nav:Roles', section: 'Identity', policy: 'AbpIdentity.Roles', keywords: 'permissions groups',
      icon: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6zM9 12l2 2 4-4' },
    { path: 'organization-units', label: 'Organization units', labelKey: 'AbpAdmin::Nav:OrganizationUnits', section: 'Identity', policy: 'AbpAdmin.OrganizationUnits', keywords: 'departments teams tree ou',
      icon: 'M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 17v-3h12v3' },
    { path: 'claim-types', label: 'Claim types', labelKey: 'AbpAdmin::Nav:ClaimTypes', section: 'Identity', policy: 'AbpAdmin.ClaimTypes', keywords: 'claims attributes user role',
      icon: 'M20 12 12 20 4 12V4h8zM8.5 8.5v.01' },
  ],
  routes: [
    { path: 'security-logs', loadComponent: () => import('./lib/security-logs/security-logs.page').then(c => c.SecurityLogsPage), ...guarded('AbpAdmin.SecurityLogs') },
    { path: 'users', loadComponent: () => import('./lib/identity/users.page').then(c => c.UsersPage), ...guarded('AbpIdentity.Users') },
    { path: 'roles', loadComponent: () => import('./lib/identity/roles.page').then(c => c.RolesPage), ...guarded('AbpIdentity.Roles') },
    { path: 'claim-types', loadComponent: () => import('./lib/identity/claim-types.page').then(c => c.ClaimTypesPage), ...guarded('AbpAdmin.ClaimTypes') },
    { path: 'organization-units', loadComponent: () => import('./lib/identity/organization-units.page').then(c => c.OrganizationUnitsPage), ...guarded('AbpAdmin.OrganizationUnits') },
  ],
  actions: [
    { id: 'new-user', labelKey: 'AbpAdmin::Palette:NewUser', hintKey: 'AbpAdmin::Palette:Action', keywords: 'create add account', policy: 'AbpIdentity.Users.Create', path: 'users', query: { new: '1' } },
    { id: 'new-role', labelKey: 'AbpAdmin::Palette:NewRole', hintKey: 'AbpAdmin::Palette:Action', keywords: 'create add', policy: 'AbpIdentity.Roles.Create', path: 'roles', query: { new: '1' } },
    { id: 'failed', labelKey: 'AbpAdmin::Palette:FailedSignIns', hintKey: 'AbpAdmin::Nav:SecurityLogs', keywords: 'login invalid password', policy: 'AbpAdmin.SecurityLogs',
      path: 'security-logs', query: { failed: '1' }, icon: SECURITY_ICON },
  ],
  settings: [
    { path: 'settings/identity', label: 'Identity & sign-in', labelKey: 'AbpAdmin::Nav:SettingsIdentity', section: 'Settings', policy: 'AbpAdmin.IdentitySettings',
      keywords: 'password lockout sign in registration', icon: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z', component: IdentitySettingsComponent },
  ],
};
