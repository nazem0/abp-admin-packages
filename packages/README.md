# ABP Admin as packages

The same admin console as the app at the repository root, shipped as reusable packages so any ABP application
can add it, **feature by feature**: NuGet packages for the backend, npm packages for an Angular UI, and NuGet
packages for a **Razor Pages UI** with the same look (for ABP MVC apps). Take everything, or only the features
you want.

What changed in each version: [CHANGELOG.md](CHANGELOG.md).

```
packages/
  backend/
    src/AbpAdmin.Core/                 NuGet: shared core (permission group, localization en/ar, dashboard, API conventions)
    src/AbpAdmin.<Feature>/            NuGet: one per feature — services + APIs under /api/abp-admin
    src/AbpAdmin.Core.Web/             NuGet: Razor Pages console core (layout, overview, settings, features, browser runtime)
    src/AbpAdmin.<Feature>.Web/        NuGet: one per feature — its Razor pages
    src/AbpAdmin.Application, .HttpApi NuGet: every backend feature in one reference
    src/AbpAdmin.Web/                  NuGet: the whole Razor console (and every backend feature) in one reference
    samples/AbpAdmin.Host/             an ordinary ABP host that only references the packages (serves both UIs)
    test/AbpAdmin.Tests/               integration tests, run against the sample host
  frontend/
    projects/core/                     npm: @nazem0/abp-admin-ng-core
    projects/<feature>/                npm: one per feature
    projects/abp-admin/                npm: @nazem0/abp-admin-ng — every feature in one package
    projects/demo/                     an Angular app consuming the built packages
```

## Pick what you need

| Feature | Backend (NuGet) | Angular (npm) | Razor Pages (NuGet) | Needs in your host |
| --- | --- | --- | --- | --- |
| **Core**: overview, settings (time zone, email), host features, permissions editor, shell | `AbpAdmin.Core` | `@nazem0/abp-admin-ng-core` | `AbpAdmin.Core.Web` | Setting, Feature and Permission Management |
| **Audit logging**: request log and dashboard, traces, entity changes and history, retention (hourly cleanup) | `AbpAdmin.AuditLogging` | `@nazem0/abp-admin-ng-audit-logging` | `AbpAdmin.AuditLogging.Web` | Audit Logging |
| **Identity**: users (claims, CSV import/export), roles (claims, move all users), organization units, claim types, security logs, identity settings | `AbpAdmin.Identity` | `@nazem0/abp-admin-ng-identity` | `AbpAdmin.Identity.Web` | Identity, Setting Management |
| **OpenIddict**: client applications, client permissions, scopes | `AbpAdmin.OpenIddict` | `@nazem0/abp-admin-ng-openiddict` | `AbpAdmin.OpenIddict.Web` | OpenIddict, Permission Management |
| **Background jobs**: the persisted job queue | `AbpAdmin.BackgroundJobs` | `@nazem0/abp-admin-ng-background-jobs` | `AbpAdmin.BackgroundJobs.Web` | Background Jobs |
| **Tenants**: tenants, multi-tenancy switch, tenant databases, users across tenants, features per tenant, admin password and invitations | `AbpAdmin.TenantManagement` | `@nazem0/abp-admin-ng-tenant-management` | `AbpAdmin.TenantManagement.Web` | Tenant Management, Identity |
| **Entity explorer**: browse and edit the entities you expose, as database rows | `AbpAdmin.EntityExplorer` | `@nazem0/abp-admin-ng-entity-explorer` | *(not yet)* | EF Core |
| **Everything** | `AbpAdmin.HttpApi` (or `AbpAdmin.Application`) | `@nazem0/abp-admin-ng` | `AbpAdmin.Web` | all of the above |

Every list in both UIs is paged on the server, with a page size of 10/20/50/100 that each browser remembers.

Each feature package depends only on `AbpAdmin.Core` (or its UI counterpart) and the **domain** package of its ABP
module. Links between features (a security log's "open request trace", the overview's cards) appear only when the
target feature is installed.

## Entity explorer

Pick an entity, find rows by key or text, and edit them as if in the database, without writing a page per entity.
Columns and forms come from the entity's EF model at runtime. Nothing is exposed until you list it:

```csharp
Configure<EntityExplorerOptions>(options => options
    .Add<Book>()
    .Add<Author>()
    .Add<IdentityUser>("Email")); // extra fields to hide; PasswordHash, SecurityStamp and ClientSecret are always hidden
```

- **Any entity EF can load**: private/protected setters, and no parameterless constructor (it binds a constructor by
  parameter names, like EF does). Foreign keys get a lookup, enums a list, and optional `bool?` fields offer
  Not set / Yes / No. Writes go through ABP repositories, so audit fields, soft delete, concurrency
  checks and entity history (the Entity changes page) all apply.
- **Permissions** per entity: `AbpAdmin.Entities.<Name>` with `.Create`, `.Update`, `.Delete`.
- **Tenants**: a tenant sees and writes only its own rows, and its `TenantId` is fixed. Entities without `TenantId`
  (not `IMultiTenant`, e.g. `Tenant`, `OpenIddictApplication`) are shared by all tenants, so they are host only. The
  host sees every tenant's rows in the shared database and may set `TenantId`.
- **Domain rules**: register an `IEntityExplorerHandler<TEntity>` to take over create/update/delete for an entity
  (e.g. go through `IdentityUserManager`); without one, values are written straight to the entity's properties.

The sample host exposes `Book` and `Author` (each tenant has its own library) plus some ABP entities.

## Add it to an ABP application

The packages are public: NuGet packages on **nuget.org**, Angular packages on **npmjs.com** (scope `@nazem0`).
No feed setup or token is needed.

### Backend

1. Reference the packages in the project that hosts your APIs: everything, or the features you want.

   ```xml
   <PackageReference Include="AbpAdmin.HttpApi" Version="0.3.0" />
   <!-- or, for example: -->
   <PackageReference Include="AbpAdmin.Identity" Version="0.3.0" />
   <PackageReference Include="AbpAdmin.AuditLogging" Version="0.3.0" />
   ```

2. Depend on the module(s). Each feature module publishes its own APIs under `/api/abp-admin`:

   ```csharp
   [DependsOn(typeof(AbpAdminHttpApiModule) /* , ... */)]                                       // everything
   [DependsOn(typeof(AbpAdminIdentityModule), typeof(AbpAdminAuditLoggingModule) /* , ... */)] // or pick
   public class YourHttpApiHostModule : AbpModule { }
   ```

3. Your host must already include the **EF Core** integrations of the ABP modules your features read from
   (any standard ABP app template does; see the table above). Tested with EF Core + SQL Server / SQLite;
   MongoDB is untested. Areas whose module is missing simply don't show up (see below).

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
   permissions to the `admin` role. No database migration is needed; ABP Admin adds no tables.

### Angular

1. Install everything (`pnpm add @nazem0/abp-admin-ng`), or core plus the features you want
   (`pnpm add @nazem0/abp-admin-ng-core @nazem0/abp-admin-ng-identity ...`). Peer dependencies: `@abp/ng.core`,
   `@angular/aria`, Angular 22.
2. Mount it under any path and enable component input binding (deep links such as
   `?user=`, `?correlation=`, `?new=1` are read as inputs):

   ```ts
   // app.routes.ts: everything
   { path: 'admin', loadChildren: () => import('@nazem0/abp-admin-ng').then(m => m.ABP_ADMIN_ROUTES) }

   // ...or pick features (core's overview, settings and features pages are always included)
   { path: 'admin', loadChildren: async () => (await import('@nazem0/abp-admin-ng-core')).abpAdminRoutes(
       (await import('@nazem0/abp-admin-ng-identity')).abpAdminIdentity,
       (await import('@nazem0/abp-admin-ng-audit-logging')).abpAdminAuditLogging) }

   // app.config.ts
   provideRouter(routes, withComponentInputBinding())
   ```

3. API URL: the proxies use `apiName: 'AbpAdmin'`. Without an `apis.AbpAdmin` entry in your
   environment they use `apis.default`; add one only if ABP Admin's API lives elsewhere.

No stylesheet to register (the layout loads its own, scoped under `.abp-admin`) and no theme module. The theme
switch writes `data-abp-admin-theme` on `<html>`, leaving your app's theme alone.

A feature is an `AbpAdminFeature` (`nav`, `routes`, `actions` for Ctrl+K, `settings` tabs): pass your own to
`abpAdminRoutes(...)` to add pages to the console. Also exported for custom composition:
`AbpAdminLayoutComponent`, `PermissionsEditorComponent`, `AuditLogDetailComponent`, the entity
diff/timeline/history components, `Toaster`, `ThemeService`, and the typed API clients (from
`@nazem0/abp-admin-ng-core`).

### Razor Pages (ABP MVC apps)

The same console as server-rendered Razor pages under **`/AbpAdmin`**, with the Angular UI's look (sidebar,
Ctrl+K, light/dark/system theme, English and Arabic with right-to-left). Use it instead of, or next to, the
Angular UI.

1. Reference `AbpAdmin.Web` (everything, backend included), or `AbpAdmin.Core.Web` plus the
   `AbpAdmin.<Feature>.Web` packages you want, in your MVC / Razor Pages host.
2. Depend on `AbpAdminWebModule`, or on `AbpAdminCoreWebModule` and the feature web modules
   (`AbpAdminIdentityWebModule`, `AbpAdminAuditLoggingWebModule`, ...; each brings its backend module).
3. Your host needs what an ABP MVC app already has: Razor Pages, cookie sign-in (the Account module's login
   page), `UseStaticFiles()` (the pages' CSS and JS are served from ABP's virtual file system under
   `/abp-admin/...`) and ABP's language switch endpoint `/Abp/Languages/Switch`.

Pages render on the server and call the same `/api/abp-admin` and ABP APIs from the browser (with ABP's
antiforgery header), so both UIs behave the same. Feature web modules register their sidebar items, Ctrl+K
actions and Settings tabs in `AbpAdminWebOptions`; add your own pages the same way. The Razor stylesheet is
generated from the Angular SCSS (`pnpm build:razor-css` in `frontend/`), so both UIs share one design.

### Multi-tenancy

- **Runtime switch.** Keep `app.UseMultiTenancy()` in your pipeline; the Tenants page turns
  multi-tenancy on or off (stored as the `AbpAdmin.MultiTenancy.IsEnabled` setting, re-applied on start).
- **Tenant admins** use the same console, scoped to their tenant. Host-only areas are hidden, and
  identity settings they save apply to their tenant only, falling back to the host's values.
- **Users across tenants.** A host user with `AbpAdmin.Tenants.ManageUsers` sees every tenant's users
  on the Users page and manages each one inside its tenant. Both UIs send ABP's `__tenant`
  header; since ABP ignores it for signed-in users, `AbpAdminTenantManagementModule` adds a tenant resolver that
  honours it for that permission only, and only on the user, lockout and user-permission endpoints.
- **Own databases.** Tenants can get their own connection string when your host handles
  `TenantConnectionStringUpdatedEto` / `TenantCreatedEto` by migrating and seeding the database, the
  pattern ABP's templates use (the sample host's `TenantDatabaseMigrationHandler` is a copy-ready
  example).

### Audit logs keep the real error

ABP stores an audit log's exception with the same settings it uses for API responses, so with error
details hidden from clients the log only says "An internal error occurred". `AbpAdmin.AuditLogging`
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

# Razor console: https://localhost:44368/AbpAdmin (same sample host)

# frontend: build the packages (core first), then run the demo app against the sample host
cd frontend
pnpm install
pnpm build:lib            # → dist/core, dist/<feature>..., dist/abp-admin
pnpm start                # demo on http://localhost:4201, admin at /admin
pnpm build:razor-css      # after changing the SCSS: regenerates the Razor console's stylesheet

# regenerate the API clients in the core package (sample host running)
pnpm generate-proxy
```

The demo app imports the packages from `dist/` (tsconfig paths), i.e. exactly what is published; rebuild after
changing them (`pnpm watch:lib` keeps core rebuilding).

### Publish

Push a version tag (`git tag v0.3.0 && git push origin v0.3.0`) or run the *Publish packages* workflow
(`.github/workflows/publish.yml`). It publishes the NuGet packages to nuget.org and the Angular packages to
npmjs.com with Trusted Publishing on both: no stored API keys (the `NUGET_USER` repo secret only holds the
nuget.org profile name). Versions already published are skipped.

Add the version's notes to [CHANGELOG.md](CHANGELOG.md) and bump the version first, in `backend/Directory.Build.props` and in every `frontend/projects/*/package.json`
(including the `@nazem0/abp-admin-ng-*` peer dependency versions): a published version can't be overwritten.

### Live demo

https://abp-admin.runasp.net (admin / 1q2w3E*): the sample host on SQLite, serving the Angular demo app under
`/app/` and the Razor Pages console under `/AbpAdmin`.
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
