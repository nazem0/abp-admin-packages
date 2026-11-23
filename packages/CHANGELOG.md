# Release notes

NuGet (`AbpAdmin.*`) and npm (`@nazem0/abp-admin-ng*`) packages share version numbers. A release that only changes
some packages publishes only those, so a package can stay on an earlier version (e.g. npm core 0.3.0 next to 0.3.1).

## Unreleased

NuGet: every `AbpAdmin.*` package.

### New

- **ABP 10 / .NET 10 support** next to ABP 11 / .NET 11: every NuGet package targets `net10.0` (ABP 10.7.x) and
  `net11.0` (ABP 11.0.x), and NuGet picks the build that matches the app.
- **`EntityExplorerOptions.AddAllFrom<TDbContext>(params Type[] except)`**: exposes every entity the context has a
  `DbSet<T>` property for, except the given types.
- **CSV export** of audit logs, entity changes and security logs (Angular and Razor Pages): a download button next to
  Refresh exports every row matching the page's current filters, up to 50,000 (`ExportAsync`,
  `ExportEntityChangesAsync`). Times are in the configured time zone.

### Changed

- `Csv` (CSV helper) moved from `AbpAdmin.Identity` (`AbpAdmin.Services.Identity`) to `AbpAdmin.Core`
  (`AbpAdmin.Services`), with `Csv.File(...)` for downloads.

- **Debuggable, verifiable NuGet packages** (nuget.org Health checks): each DLL embeds its PDB with Source Link and the
  compiler flags, and CI builds are deterministic. You can step into ABP Admin's source while debugging.
- ABP 11 moved from `11.0.0-rc.2` to `11.0.0`.
- Audit logs, security logs and background jobs no longer use ABP 11's `IQueryProjector` (ABP 10 has no such hook):
  their Get/GetList project in SQL through the shared `ProjectedReadOnlyAppService` base, the same code on both versions.
  The projectors (`AuditLogDtoProjector`, `SecurityLogDtoProjector`, `BackgroundJobDtoProjector`) are now static
  Mapperly classes and are no longer registered as `IQueryProjector<,>` services.

### Fixed

- `Add<TEntity>("Field")` now hides `Field`, as documented. It used to bind to the named overload and expose the entity
  under the name `Field` with nothing hidden. The named overload is now `AddAs<TEntity>(name, hiddenProperties)`
  (**breaking** for code that called `Add<TEntity>(name, ...)` with a name).
- Razor Pages console: the Users CSV export downloaded a JSON description of the file instead of the CSV (file
  downloads now ask for `application/octet-stream`).
- One misconfigured entity (no `IRepository<T>`, not in the EF model) no longer breaks the whole entity list: it is left
  out with a warning in the log, and opening it directly still reports the error. Easy to hit with several DbContexts,
  or with `AddAllFrom` on a context that only registers aggregate-root repositories.

## 0.3.1 — 2026-11-18

NuGet: every `AbpAdmin.*` package. npm: only `@nazem0/abp-admin-ng-entity-explorer` and `@nazem0/abp-admin-ng`.

### New

- **Entity explorer for the Razor Pages console** (`AbpAdmin.EntityExplorer.Web`, included in `AbpAdmin.Web`): the
  same page as Angular under `/AbpAdmin/Entities`: entity picker with `?entity=` deep links, search, sorting,
  paging, and create/edit/delete forms built from the schema (lookups for foreign keys, enums, check rows,
  Not set / Yes / No for `bool?`, JSON fields), in its sidebar section and Ctrl+K.

### Fixed

- Entity explorer: a missing or unknown foreign key (e.g. a book without an author) failed with a database error
  (HTTP 500). It is now a validation message ("AuthorId is required.", "No Author with id …"), and a tenant can't
  point a row at another tenant's data.
- Entity explorer: dates in the list read backwards in Arabic (right-to-left); they now keep their order.

### Upgrade

- Razor Pages with `AbpAdmin.Web`: bump it to `0.3.1`. Picking feature packages: add `AbpAdmin.EntityExplorer.Web`
  and depend on `AbpAdminEntityExplorerWebModule`.
- Angular: bump `@nazem0/abp-admin-ng` or `@nazem0/abp-admin-ng-entity-explorer` to `0.3.1`; the other npm
  packages stay `0.3.0`.

## 0.3.0 — 2026-11-18

### New

- **Entity explorer** (`AbpAdmin.EntityExplorer`, `@nazem0/abp-admin-ng-entity-explorer`; Angular only for now).
  Browse and edit the entities you list in `EntityExplorerOptions` as database rows. Columns and forms come from
  the EF model at runtime: protected/private setters, constructor binding, lookups for foreign keys, enums,
  optional (`bool?`) yes/no fields. Writes go through ABP repositories, so audit fields, soft delete, concurrency
  checks and entity history apply. Permissions per entity (`AbpAdmin.Entities.<Name>`), host-only entities
  without `TenantId`, and an optional `IEntityExplorerHandler<TEntity>` for domain rules.
- **Claim types** page, and claims on users and roles, checked against the claim type's value type and pattern.
- **Users**: CSV export and import. **Roles**: move all users to another role.
- **Tenants**: features per tenant (`AbpAdmin.Tenants.ManageFeatures`), set the tenant admin's password, or
  invite the admin by email (they pick their password from ABP's reset-password page).
- **Audit log retention**: a setting (Settings › Audit logs) and an hourly cleanup worker; off until a
  retention is set. A "clean up now" button runs it on demand.
- **Change history** links on users, roles and tenants; the Entity changes page opens `?type=&id=`.
- **Pagination everywhere**: one pager on every list (both UIs): range, page numbers, first/last, and a page
  size of 10/20/50/100 remembered per browser. Roles, tenants, applications, scopes, claim types and
  organization unit members used to load a fixed batch (100–500) and are now paged on the server.
  Angular exports `PagerComponent`, `savedPageSize()` and `keepPageInRange()` from `@nazem0/abp-admin-ng-core`.

### Fixed

- Users across tenants listed users of **deleted** tenants (ABP soft-deletes a tenant but keeps its users),
  so the Users page showed more tenants than the Tenants page.
- Deleting the last row on the last page left an empty list with no pager; the list now steps back a page.
- Tenant features failed with "No policy found: AbpTenantManagement.Tenants.ManageFeatures".
- Entity explorer: yes/no fields lined up badly in the form; they are now check rows like the rest of the console.

### Upgrade

- Bump every `AbpAdmin.*` and `@nazem0/abp-admin-ng*` reference to `0.3.0`.
- Run your DbMigrator / `--migrate-database` once so the `admin` role gets the new permissions
  (claim types, entity explorer, tenant features and admin password). ABP Admin still adds no tables.
- Entity explorer: reference the package, depend on `AbpAdminEntityExplorerModule` (included in
  `AbpAdmin.HttpApi` / `@nazem0/abp-admin-ng`) and list your entities, see the README.

## 0.2.1 — 2026-11-15

- npm packages published with Trusted Publishing.

## 0.2.0 — 2026-11-15

- First public release: one NuGet and one npm package per feature (core, audit logging, identity, OpenIddict,
  background jobs, tenant management) plus all-in-one packages, and the Razor Pages console (`AbpAdmin.Web`).
