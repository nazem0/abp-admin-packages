# Release notes

All NuGet (`AbpAdmin.*`) and npm (`@nazem0/abp-admin-ng*`) packages share one version.

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
