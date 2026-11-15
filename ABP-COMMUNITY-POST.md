# ABP Admin: An Open-Source Admin UI for ABP Framework

**ABP Admin** adds administration screens to ABP Framework applications. It’s an independent, MIT-licensed community project with two UI options, **Angular** and **Razor Pages**, built on the same backend packages.

## Follow an audited request to the data it changed

When a support ticket comes in about an unexpected data change, two questions come up quickly. Who made the change, and which request caused it?

In **Audit Logs**, open an audited request to see a timing waterfall of its controller and application-service calls. From there, inspect the entity changes recorded for the request, including the old and new property values. If you already know which entity changed, start from its history and follow the change back to the request.

## Manage users and tenants from the same UI

Host admins with the appropriate permissions can filter the user list by tenant and manage a user within that tenant. Tenant admins use the same UI scoped to their own tenant. The tenant management screen also supports provisioning a dedicated database for a tenant.

ABP Admin includes screens for users, roles, organization units and permissions, security logs, OpenIddict applications and scopes, background jobs, features, and application settings. Both UIs support English and Arabic, including a right-to-left layout.

## Try it in Angular or Razor Pages

The two demos use the same sample data. Sign in as `admin` with the demo password `1q2w3E*`. Open **Audit Logs** to explore requests or **Users** to see the host-wide view. To try the tenant-scoped view, select `acme` on the sign-in page and use the same demo credentials.

- [Angular demo](https://abp-admin.runasp.net/app/)
- [Razor Pages demo](https://abp-admin.runasp.net/AbpAdmin)

To add ABP Admin to an existing project, choose the features you need. The backend packages are available through NuGet, the Angular UI through npm, and the Razor Pages UI through NuGet. [Source code and setup instructions](https://github.com/nazem0/abp-admin-packages) · [Package guide](https://github.com/nazem0/abp-admin-packages/tree/HEAD/packages)

Which admin workflow in your ABP app do you still handle with custom screens or scripts? If you try one of the packages, I’d also like to hear where the integration could be clearer.
