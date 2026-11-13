/** Every admin destination (relative to the admin layout route), in sidebar order. The sidebar and the command palette both read this. */
export interface NavItem {
  path: string;
  label: string;
  section: string;
  /** ABP policy (supports `||`); hidden when not granted. */
  policy: string;
  /** SVG path data, 24×24 stroke icon. */
  icon: string;
  keywords?: string;
}

export const NAV: NavItem[] = [
  { path: 'overview', label: 'Overview', section: '', policy: '', keywords: 'home dashboard',
    icon: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v4h-6zM4 20h6v-3H4z' },

  { path: 'audit-logs', label: 'Audit logs', section: 'Monitoring', policy: 'AbpAdmin.AuditLogs', keywords: 'requests http trace errors',
    icon: 'M4 5h16M4 12h10M4 19h7M17 15l2 2 3-4' },
  { path: 'entity-changes', label: 'Entity changes', section: 'Monitoring', policy: 'AbpAdmin.AuditLogs', keywords: 'history data diff',
    icon: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5' },
  { path: 'security-logs', label: 'Security logs', section: 'Monitoring', policy: 'AbpAdmin.SecurityLogs', keywords: 'login sign in failed lockout',
    icon: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2' },
  { path: 'background-jobs', label: 'Background jobs', section: 'Monitoring', policy: 'AbpAdmin.BackgroundJobs', keywords: 'queue retry abandoned',
    icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v4h-4' },

  { path: 'users', label: 'Users', section: 'Identity', policy: 'AbpIdentity.Users', keywords: 'accounts people lock',
    icon: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2a6.5 6.5 0 0 1 3.5 5.8' },
  { path: 'roles', label: 'Roles', section: 'Identity', policy: 'AbpIdentity.Roles', keywords: 'permissions groups',
    icon: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6zM9 12l2 2 4-4' },

  { path: 'organization-units', label: 'Organization units', section: 'Identity', policy: 'AbpAdmin.OrganizationUnits', keywords: 'departments teams tree ou',
    icon: 'M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 17v-3h12v3' },
  { path: 'applications', label: 'Applications', section: 'OpenIddict', policy: 'AbpAdmin.Applications', keywords: 'clients oauth oidc secret redirect',
    icon: 'M4 5h16v14H4zM4 9h16M8 13h3' },
  { path: 'scopes', label: 'Scopes', section: 'OpenIddict', policy: 'AbpAdmin.Scopes', keywords: 'api resources audience',
    icon: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z' },

  { path: 'features', label: 'Features', section: 'System', policy: 'FeatureManagement.ManageHostFeatures', keywords: 'toggles limits',
    icon: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4' },
  { path: 'settings', label: 'Settings', section: 'System', keywords: 'email smtp time zone password lockout identity',
    policy: 'SettingManagement.TimeZone || SettingManagement.Emailing || AbpAdmin.IdentitySettings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z' },
];
