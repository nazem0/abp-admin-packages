# @abp-admin/ng

Headless Angular admin UI for [ABP Framework](https://abp.io): overview dashboard, audit / security /
entity-change logs, background jobs, users, roles, organization units, permissions (roles, users,
OpenIddict clients), OpenIddict applications and scopes, features, and identity / email / time-zone settings.
Ctrl+K command palette, light/dark theme, responsive down to phone width.

Depends only on `@abp/ng.core` and `@angular/aria` — no ABP theme packages. Its styles are scoped
under `.abp-admin`, so they never affect your app.

```ts
// app.routes.ts — mount it anywhere
{ path: 'admin', loadChildren: () => import('@abp-admin/ng').then(m => m.ABP_ADMIN_ROUTES) }

// app.config.ts — deep links (?user=, ?correlation=, ?new=1) are bound as inputs
provideRouter(routes, withComponentInputBinding())
```

Backend: add the `AbpAdmin.HttpApi` NuGet package to your ABP host (`/api/abp-admin`, remote service
`AbpAdmin`; falls back to your `apis.default` URL).

MIT licensed. Community project, not affiliated with Volosoft.
