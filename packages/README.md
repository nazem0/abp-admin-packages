# ABP Admin as packages

The same admin console as the app at the repository root, shipped as reusable packages so any
ABP application can add it: **NuGet** packages for the backend, an **npm** library for Angular.

```
packages/
  backend/
    src/AbpAdmin.Application/   NuGet: app services, DTOs, permissions, localization
    src/AbpAdmin.HttpApi/       NuGet: exposes them under /api/abp-admin
    samples/AbpAdmin.Host/      an ordinary ABP host that only references the packages
    test/AbpAdmin.Tests/        integration tests, run against the sample host
  frontend/
    projects/abp-admin/         npm: @nazem0/abp-admin-ng (headless Angular library)
    projects/demo/              an Angular app consuming the built library
```

| Package | What it contains |
|---|---|
| `AbpAdmin.Application` | Audit / security / entity-change logs, background jobs, organization units, user lock/unlock, OpenIddict applications & scopes, tenants (multi-tenancy switch, tenant databases, users across tenants), identity settings, dashboard. Permissions (`AbpAdmin.*`) and localization (en, ar). Depends only on the **domain** packages of the free ABP modules. |
| `AbpAdmin.HttpApi` | Conventional API controllers for the above: `/api/abp-admin/...`, remote service name `AbpAdmin`; the tenant resolver that lets a host admin manage a tenant's users. |
| `@nazem0/abp-admin-ng` | Every admin page, the shell (sidebar, Ctrl+K palette, toasts, theme switch) and typed proxies. Depends only on `@abp/ng.core` (+ `@angular/aria`); no theme package. Styles are scoped under `.abp-admin`, so they never touch the host app. |

## Add it to an ABP application

The packages are published privately to **GitHub Packages** (owner `nazem0`). Reading them needs a
GitHub token with `read:packages` (`gh auth token` works after `gh auth refresh -s read:packages`).

```bash
# NuGet: add the feed once
dotnet nuget add source https://nuget.pkg.github.com/nazem0/index.json -n github-nazem0 \
  -u <github-user> -p <token> --store-password-in-clear-text
```

```ini
# .npmrc next to your Angular app's package.json (keep the token out of git: use an env var)
@nazem0:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### Backend

1. Reference the HTTP API package in the project that hosts your APIs (it brings `AbpAdmin.Application`):

   ```xml
   <PackageReference Include="AbpAdmin.HttpApi" Version="0.1.0" />
   ```

2. Depend on the module:

   ```csharp
   [DependsOn(typeof(AbpAdminHttpApiModule) /* , ... */)]
   public class YourHttpApiHostModule : AbpModule { }
   ```

3. Your host must already include what ABP Admin reads from (any standard ABP app template does):
   the **EF Core** integrations of Audit Logging, Identity, OpenIddict, Background Jobs,
   Setting Management and Permission Management, plus Tenant Management for the Tenants screens.
   (Tested with EF Core + SQL Server / SQLite; MongoDB is untested.) Areas whose module is missing
   simply don't show up (see below).

4. Recommended host settings (the packages don't impose them):

   ```csharp
   // Property-level entity history (powers Entity changes / history)
   Configure<AbpAuditingOptions>(o => o.EntityHistorySelectors.AddAllEntities());
   // UTC storage + per-user time zone (powers the time-zone setting and day boundaries)
   Configure<AbpClockOptions>(o => o.Kind = DateTimeKind.Utc);
   // in OnApplicationInitialization, after UseAbpRequestLocalization():
   app.UseAbpTimeZone();
   ```

5. Run your DbMigrator / `--migrate-database` once: ABP's seeder grants the new `AbpAdmin.*`
   permissions to the `admin` role. No database migration is needed — ABP Admin adds no tables.

### Angular

1. Install: `pnpm add @nazem0/abp-admin-ng` (peer dependencies: `@abp/ng.core`, `@angular/aria`, Angular 22).
2. Mount it under any path and enable component input binding (deep links such as
   `?user=`, `?correlation=`, `?new=1` are read as inputs):

   ```ts
   // app.routes.ts
   { path: 'admin', loadChildren: () => import('@nazem0/abp-admin-ng').then(m => m.ABP_ADMIN_ROUTES) }

   // app.config.ts
   provideRouter(routes, withComponentInputBinding())
   ```

3. API URL: the proxies use `apiName: 'AbpAdmin'`. Without an `apis.AbpAdmin` entry in your
   environment they use `apis.default` — add one only if ABP Admin's API lives elsewhere.

That's it — no stylesheet to register (the layout loads its own, scoped under `.abp-admin`), no theme
module. The theme switch writes `data-abp-admin-theme` on `<html>`, leaving your app's theme alone.

Everything is also exported for custom composition: `AbpAdminLayoutComponent`, `NAV`,
`PermissionsEditorComponent`, `AuditLogDetailComponent`, the entity diff/timeline/history
components, `Toaster`, `ThemeService`, and the typed proxies as `AbpAdminProxy`.

### Multi-tenancy

- **Runtime switch.** Keep `app.UseMultiTenancy()` in your pipeline; the Tenants page turns
  multi-tenancy on or off (stored as the `AbpAdmin.MultiTenancy.IsEnabled` setting, re-applied on start).
- **Tenant admins** use the same console, scoped to their tenant. Host-only areas are hidden, and
  identity settings they save apply to their tenant only, falling back to the host's values.
- **Users across tenants.** A host user with `AbpAdmin.Tenants.ManageUsers` sees every tenant's users
  on the Users page and manages each one inside its tenant. The Angular page sends ABP's `__tenant`
  header; since ABP ignores it for signed-in users, `AbpAdminHttpApiModule` adds a tenant resolver that
  honours it for that permission only, and only on the user, lockout and user-permission endpoints.
- **Own databases.** Tenants can get their own connection string when your host handles
  `TenantConnectionStringUpdatedEto` / `TenantCreatedEto` by migrating and seeding the database, the
  pattern ABP's templates use (the sample host's `TenantDatabaseMigrationHandler` is a copy-ready
  example).

### Audit logs keep the real error

ABP stores an audit log's exception with the same settings it uses for API responses, so with error
details hidden from clients the log only says "An internal error occurred". `AbpAdmin.Application`
replaces the audit-log converter to store the exception type, message and stack trace; API responses
are unchanged.

### What shows up follows your ABP setup

Nothing to configure: each area turns its permissions off when your host isn't set up for it, and the UI
hides whatever the user isn't granted.

| Area | Shown when your host has |
| --- | --- |
| Audit logs, entity changes | `AbpAuditingOptions.IsEnabled` and the Audit Logging EF Core/MongoDB module |
| Security logs, organization units | the Identity EF Core/MongoDB module |
| Applications, scopes | the OpenIddict EF Core/MongoDB module |
| Background jobs | the Background Jobs EF Core/MongoDB module |
| Tenants, users across tenants | the Tenant Management EF Core/MongoDB module |
| A tenant's own database | a `TenantConnectionStringUpdatedEto` handler that migrates and seeds it (ABP's template pattern) |
| Language menu | more than one language in `AbpLocalizationOptions.Languages` |
| Settings tabs, features | the matching Setting/Feature Management permissions |

## Develop the packages

Prerequisites: .NET 11 SDK, Node 22+, pnpm, ABP CLI, SQL Server LocalDB.

```bash
# backend: build, test, pack (→ backend/artifacts/*.nupkg)
cd backend
dotnet test AbpAdmin.Packages.slnx
dotnet pack AbpAdmin.Packages.slnx -c Release

# sample host: database "AbpAdminDemo", https://localhost:44368 (admin / 1q2w3E*)
cd samples/AbpAdmin.Host
abp install-libs                     # login page client libraries (not in git)
dotnet run -- --migrate-database
dotnet run

# frontend: build the library, then run the demo app against the sample host
cd frontend
pnpm install
pnpm build:lib            # → dist/abp-admin
pnpm start                # demo on http://localhost:4201, admin at /admin
npm pack ./dist/abp-admin --pack-destination artifacts

# regenerate the library's proxies (sample host running)
pnpm generate-proxy
```

The demo app imports `@nazem0/abp-admin-ng` from `dist/abp-admin` (tsconfig path), i.e. exactly what is
published — rebuild the library after changing it (`pnpm watch:lib` keeps it rebuilding).

### Publish (GitHub Packages)

Needs a token with `write:packages` (`gh auth refresh -s write:packages`).

```bash
dotnet nuget push "backend/artifacts/*.nupkg" -s https://nuget.pkg.github.com/nazem0/index.json -k $(gh auth token)
cd frontend/dist/abp-admin && NODE_AUTH_TOKEN=$(gh auth token) npm publish   # registry comes from publishConfig
```

Bump the version in `backend/Directory.Build.props` and `frontend/projects/abp-admin/package.json`
first — a published version can't be overwritten.

### Live demo

https://abp-admin.runasp.net (admin / 1q2w3E*) — the sample host serving the demo app under `/app/`, on SQLite.
`pwsh deploy-demo.ps1` rebuilds both and pushes them with Web Deploy; it needs a gitignored `.deploy/` folder
with the publish profile, `appsettings.Production.json` and `openiddict.pfx` (see the script header).
The sample host's switches it relies on: a `Data Source=` connection string selects SQLite, `App:MigrateOnStartup`
creates and seeds the database, `AuthServer:RequireHttps: false` allows plain-HTTP hosting.

Sample data (`DemoDataSeedContributor`, added once, every password `1q2w3E*`): multi-tenancy on, and

| Tenant (sign-in page's tenant box) | Users | Roles |
| --- | --- | --- |
| *(host)* | `admin`, `sara` (support), `omar` (auditor) | admin, support, auditor |
| `acme` | `admin`, `lina` (support), `khaled` (auditor), `noor` (inactive) | admin, support, auditor |
| `globex` | `admin`, `hana` (support), `ziad` | admin, support, auditor |

*support* manages users and reads security logs; *auditor* reads audit and security logs.

Things to try: host `admin` › Users (every tenant's users, edit one in `acme`); `acme` › `admin` (the
console scoped to a tenant); `sara` / `omar` (a limited role); the sidebar's language menu (Arabic, RTL).
The demo is public and shared, and it is recreated whenever its schema changes: don't put anything real in it.
On a local sample host the same data is seeded; turn multi-tenancy off from the Tenants page if you
don't want it (the seeder won't turn it back on).

## Origin

Extracted from the ABP Admin application: same code, namespaces (`AbpAdmin.Services.*`) and
permissions. Only the API root changes from `/api/app` to `/api/abp-admin`, component selectors from
`app-*` to `abp-*`, and links became relative so the UI can be mounted under any path.
