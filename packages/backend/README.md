# ABP Admin (backend)

Admin APIs for [ABP Framework](https://abp.io) applications, built on the free ABP modules:
audit, security and entity-change logs, background jobs, organization units, user lock/unlock,
OpenIddict applications/scopes/client permissions, identity & sign-in settings and an overview dashboard.

- `AbpAdmin.Application` — application services, DTOs, permissions (`AbpAdmin.*`), localization.
- `AbpAdmin.HttpApi` — exposes them under `/api/abp-admin` (remote service `AbpAdmin`).

```csharp
[DependsOn(typeof(AbpAdminHttpApiModule))]
public class YourHttpApiHostModule : AbpModule { }
```

Requires the Audit Logging, Identity, OpenIddict, Background Jobs, Setting Management and Permission
Management modules (any ABP app template has them). Run your data seeder once so the `admin` role
gets the new permissions. Pair with the Angular UI package `@abp-admin/ng`.

MIT licensed. Community project, not affiliated with Volosoft.
