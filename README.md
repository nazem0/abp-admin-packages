# ABP Admin

An open-source, headless admin console for [ABP Framework](https://abp.io) applications.
It gives the free ABP modules the admin screens they ship without: an **overview dashboard**,
**audit, security and entity-change logs**, **users, roles, organization units and permissions**,
**OpenIddict applications and scopes**, **background jobs**, **tenants** (with per-tenant databases),
**features**, and **identity, email and time-zone settings**, in English and Arabic.

> Community project. Not affiliated with or endorsed by Volosoft (the company behind ABP).

To add the console to your own ABP application, use the NuGet and npm packages in
[`packages/`](packages/README.md).

## Live demo

**https://abp-admin.runasp.net/app/** — the [`packages/`](packages/README.md) sample host on SQLite,
with sample data. Every password is `1q2w3E*`. To sign in to a tenant, pick it in the sign-in
page's tenant box first.

| Tenant | Users | Roles |
| --- | --- | --- |
| *(host)* | `admin`, `sara` (support), `omar` (auditor) | admin, support, auditor |
| `acme` | `admin`, `lina` (support), `khaled` (auditor), `noor` (inactive) | admin, support, auditor |
| `globex` | `admin`, `hana` (support), `ziad` | admin, support, auditor |

*support* manages users and reads security logs; *auditor* reads audit and security logs.

Things to try:

- **Host `admin` › Users** — every tenant's users in one list, with a Tenant column and filter; edit,
  lock, delete or set permissions of an `acme` user without signing in to `acme`.
- **`acme` › `admin`** — the same panel scoped to the tenant: its own users, roles, logs and settings;
  host-only screens (applications, scopes, tenants, features, background jobs) are hidden.
- **`sara` or `omar`** — what a limited role sees: only the screens its permissions allow.
- **Language menu** (sidebar footer) — switch to Arabic (right-to-left) and back.
- **Tenants** — create a tenant (optionally with its own database), disable it, or switch
  multi-tenancy off and see the sign-in page drop the tenant box.

The demo is public and shared: anyone can change its data, and it may be reset (it is recreated
whenever its schema changes). Don't put anything real in it.

## Features

- **Overview** — users, sign-ins, requests and job health for the last 24 hours, with a "needs
  attention" strip (lockouts, failed sign-ins, failing requests, abandoned jobs) linking to each screen.
- **Audit log dashboard** — request volume, error rate, latency, active users and data changes over
  24 h / 7 d / 30 d / 90 d, a daily traffic chart, status codes, methods, and the busiest and slowest
  endpoints (ids in URLs are grouped as `{id}`). Click any figure to filter the request list.
- **Request trace** — every request as a timing waterfall tree:
  request → API controller → application service → the entity changes it caused.
- **Entity changes** — a feed of every create, update and delete across all requests, with
  created/updated/deleted totals. Filter by change type, id, time range and a searchable multi-select
  entity-type picker (grouped by module, with per-type change counts); framework noise such as
  OpenIddict tokens and security logs is hidden by default.
- **Entity history** — the full life of any entity (old → new values per property, who and when),
  linked to the request that made each change.
- **Security logs** — ABP Identity's sign-in log: successes, failures, lockouts, sign-outs and
  credential changes with user, client app, IP and browser; filter by action, user or IP; jump from
  an event to the HTTP request that caused it (correlation id).
- **Background jobs** — the persisted ABP job queue: waiting, retrying and abandoned jobs with their
  arguments and schedule; run now (re-queue) or delete.
- **Users** — search, create, edit (profile, password, roles, active/lockout), delete, lock/unlock,
  per-user permissions and a link to each user's sign-in history. With multi-tenancy on, the host
  sees every tenant's users (Tenant column and filter) and manages each one inside its tenant.
- **Tenants** — create, rename, enable/disable and delete tenants; switch multi-tenancy on or off at
  runtime; give a tenant its own database (connection test, then created, migrated and seeded) or move
  it back to the shared one.
- **Tenant admins** — a tenant's admin uses the same console scoped to their tenant; settings they
  save apply to their tenant only and fall back to the host's values.
- **Organization units** — the free Identity module's OU tree with a UI: create, rename, move and
  delete units; add members and roles (members inherit the roles of their unit and its parents).
- **Roles** — create, edit (default/public flags), delete non-static roles, and manage each role's permissions.
- **Permissions editor** — grouped tree with search, select-all per group, parent/child rules
  (granting a child grants its parents, revoking a parent revokes its children), and grants
  inherited from roles shown as locked "via role …".
- **OpenIddict applications** — register clients: public/confidential (secret generation, hashed
  storage, rotation), grant types (endpoint and response-type permissions are derived), PKCE,
  redirect URIs, scopes, consent; plus **client permissions** for client-credentials backends.
- **OpenIddict scopes** — API scopes and the resources (audiences) they map to.
- **Features** — host feature values for toggle, free-text (numeric limits) and selection
  features; children lock while their parent toggle is off; reset to defaults.
- **Identity & sign-in settings** — password policy, lockout, email/phone confirmation,
  self-registration and local login, rendered from ABP's own setting definitions.
- **Email settings** — SMTP sender, server, SSL and credentials, plus a "send test email" form.
- **Time-zone settings** — pick the zone (or keep each user's browser zone) used for every time,
  day boundary and chart; backed by ABP's `Abp.Timing.TimeZone` setting with a UTC clock.
- **English and Arabic** — every screen localized through ABP's `AbpAdmin` resource, right-to-left
  layout for Arabic, and a language menu in the sidebar (shown when the app has more than one language).
- **Headless Angular UI** — no theme packages; only `@abp/ng.core` + `@abp/ng.oauth`, hand-built
  accessible components on `@angular/aria`, light (default)/dark/system theme switch, a **Ctrl+K command
  palette** (pages and quick actions, filtered by permission), toasts, responsive down to phone width.

## Stack

| Layer    | Tech |
|----------|------|
| Backend  | .NET 11, ABP 11 (single-layer), EF Core + SQL Server, OpenIddict |
| Frontend | Angular 22 (signals, standalone), `@angular/aria`, pnpm |
| Mapping  | Mapperly, including ABP 11 `IQueryProjector` query projection |

> ABP 11 is currently a release candidate (`11.0.0-rc.2`); the project tracks it until 11.0 is stable.

## Getting started

Prerequisites: [.NET 11 SDK](https://dotnet.microsoft.com/download), [Node 20+](https://nodejs.org),
[pnpm](https://pnpm.io), [ABP CLI](https://abp.io/docs/latest/cli), SQL Server (LocalDB works).

```bash
# 1. Database (creates and seeds the AbpAdmin database)
cd AbpAdmin
dotnet run -- --migrate-database

# 2. Backend client libraries for the login page, then the API
abp install-libs
dotnet run            # https://localhost:44366  (Swagger at /swagger)

# 3. Angular app
cd ../angular
pnpm install
pnpm start            # http://localhost:4200
```

Sign in with `admin` / `1q2w3E*` (change it right away outside development).

To try tenants locally: Tenants › switch multi-tenancy on › New tenant (its admin is created with the
email and password you enter), then sign in with that tenant picked on the sign-in page.

Edit `ConnectionStrings:Default` in `AbpAdmin/appsettings.json` for a different database.

## Project layout

```
AbpAdmin/          ASP.NET Core host: app services, EF Core DbContext, OpenIddict, login UI
  Services/AuditLogs/   AuditLogAppService (ReadOnlyAppService + statistics), DTOs, Mapperly projector
  Services/SecurityLogs/  security log (ReadOnlyAppService + projection)
  Services/Identity/    organization units, user lock/unlock
  Services/OpenIddict/  applications and scopes (through OpenIddict's managers)
  Services/BackgroundJobs/  job queue viewer, retry, delete
  Services/Settings/    identity & account settings (global for the host, per tenant for a tenant)
  Services/Tenants/     tenants, multi-tenancy switch, tenant databases, users across tenants
  Data/                 DbContext, migrations, TenantDatabaseMigrationHandler (sets up tenant databases)
  Services/Dashboard/   overview numbers (permission-aware)
AbpAdmin.Tests/    xUnit integration tests (SQLite in-memory)
angular/           Headless Angular admin UI
  src/app/audit-logs/   dashboard, request list, trace/changes sheet
  src/app/entity-changes/  change feed, entity history sheet, shared diff/timeline
  src/app/overview/     dashboard
  src/app/security-logs/  security log
  src/app/background-jobs/  job queue
  src/app/identity/     users, roles, organization units
  src/app/openiddict/   applications and scopes
  src/app/permissions/  permissions editor sheet (roles, users, clients)
  src/app/features/     host features
  src/app/settings/     identity, time-zone and email settings (one routed tab each)
  src/app/tenants/      tenants and tenant databases
  src/app/shared/       nav, command palette, toasts, theme, sheet directive, API error helper,
                        i18n helpers, tenant scope (sends a screen's calls to another tenant)
  src/app/proxy/        generated by `pnpm generate-proxy` — do not edit
etc/               Docker build and compose scripts
```

## How the APIs reach Angular

The free ABP Audit Logging and OpenIddict modules ship **no HTTP API**, so ABP Admin wraps their
repositories in its own application services (module `app`, routes under `/api/app/...`).
ABP's built-in endpoints (e.g. `/api/setting-management/timezone`) are used as they are.

With the API running, regenerate the typed Angular services:

```bash
cd angular
pnpm generate-proxy   # modules `app` (our services) and `settingManagement`
```

Always-present DTO members carry `[Required]` so the generated TypeScript types are non-optional.

## Notes

- **New permissions need a seed.** ABP grants every permission to the `admin` role only when the data
  seeder runs. After pulling a version that adds screens, run `dotnet run --migrate-database` in
  `AbpAdmin/` once (or grant them in Roles › admin › Permissions).
- **Client permissions** (provider `C`) are mapped to `AbpAdmin.Applications.ManagePermissions`;
  the free OpenIddict module points them at a Pro-only policy that doesn't exist.
- **Read-only services use ABP 11 query projection.** `AuditLogAppService` derives from
  `ReadOnlyAppService`; `AuditLogDtoProjector` (Mapperly, `IQueryProjector<AuditLog, AuditLogDto>`)
  turns `GetAsync`/`GetListAsync` into a single SQL `SELECT` of the DTO shape.
- **Times are stored in UTC** (`AbpClockOptions.Kind = Utc`) and the pipeline calls `UseAbpTimeZone()`,
  so statistics are bucketed into days in the viewer's zone.
- **GET requests are not audited** by ABP's default. Enable `AbpAuditingOptions.IsEnabledForGetRequests`
  if you want reads in the dashboard.
- **Multi-tenancy is switched at runtime.** `UseMultiTenancy()` is always in the pipeline; the
  Tenants page stores the switch as a setting and re-applies it on start.
- **The host acts in a tenant through ABP's `__tenant` header.** ABP ignores that header for
  signed-in users, so `HostUserInTenantResolveContributor` honours it only for a host user with
  `AbpAdmin.Tenants.ManageUsers`, and only on the user, lockout and user-permission endpoints; inside
  the tenant that user keeps only their `AbpIdentity.Users*` permissions.
- **Tenant databases** are set up by `TenantDatabaseMigrationHandler` (ABP's `TenantCreatedEto` /
  `TenantConnectionStringUpdatedEto`): migrate (own database only), then seed the admin user. Data is
  never copied between databases.
- **Localization keys** live in `AbpAdmin/Localization/AbpAdmin/{en,ar}.json` and are written `::Key`
  in Angular (`localization.defaultResourceName` is `AbpAdmin`). Arabic is a draft without a native
  review yet.
- **Statistics are computed live** over at most 92 days; very large audit tables would want a
  pre-aggregated rollup.

## Production checklist

- Replace `AuthServer:CertificatePassPhrase` and `StringEncryption:DefaultPassPhrase` in `appsettings.json`.
- Provide a real signing/encryption certificate (`openiddict.pfx` is git-ignored):
  `dotnet dev-certs https -v -ep openiddict.pfx -p <passphrase>` — see
  [Configuring OpenIddict](https://abp.io/docs/latest/Deployment/Configuring-OpenIddict#production-environment).
- Restore the identity password rules relaxed in `appsettings.json` for development.
- Docker: `etc/build/build-images-locally.ps1`, then `etc/docker/run-docker.ps1`.

## Roadmap

- [x] Audit log dashboard, trace and entity history
- [x] Entity change feed
- [x] Time-zone and email settings
- [x] Users, roles and permissions
- [x] Host features
- [x] Security logs, background jobs, overview dashboard
- [x] OpenIddict applications, scopes and client permissions
- [x] Organization units
- [x] Identity & sign-in settings, user lock/unlock
- [ ] Claim types and user/role claims
- [ ] Session management (needs ABP session tracking enabled)
- [x] Tenants, per-tenant databases, users across tenants, tenant-scoped console
- [x] Localization of the admin UI (English, Arabic)

## Contributing

Issues and pull requests are welcome. Please run `dotnet test` and `pnpm build` before opening a PR.

## License

[MIT](LICENSE)
