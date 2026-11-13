# ABP Admin

An open-source, headless admin console for [ABP Framework](https://abp.io) applications.
It gives the free ABP modules the admin screens they ship without: an **overview dashboard**,
**audit, security and entity-change logs**, **users, roles, organization units and permissions**,
**OpenIddict applications and scopes**, **background jobs**, **features**, and **identity, email and
time-zone settings**.

> Community project. Not affiliated with or endorsed by Volosoft (the company behind ABP).

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
  per-user permissions and a link to each user's sign-in history.
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
- **Headless Angular UI** — no theme packages; only `@abp/ng.core` + `@abp/ng.oauth`, hand-built
  accessible components on `@angular/aria`, light/dark/system theme switch, a **Ctrl+K command
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

Edit `ConnectionStrings:Default` in `AbpAdmin/appsettings.json` for a different database.

## Project layout

```
AbpAdmin/          ASP.NET Core host: app services, EF Core DbContext, OpenIddict, login UI
  Services/AuditLogs/   AuditLogAppService (ReadOnlyAppService + statistics), DTOs, Mapperly projector
  Services/SecurityLogs/  security log (ReadOnlyAppService + projection)
  Services/Identity/    organization units, user lock/unlock
  Services/OpenIddict/  applications and scopes (through OpenIddict's managers)
  Services/BackgroundJobs/  job queue viewer, retry, delete
  Services/Settings/    identity & account settings
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
  src/app/settings/     identity, time-zone and email settings
  src/app/shared/       nav, command palette, toasts, theme, sheet directive, API error helper
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
- [ ] Localization of the admin UI (English only today)

## Contributing

Issues and pull requests are welcome. Please run `dotnet test` and `pnpm build` before opening a PR.

## License

[MIT](LICENSE)
