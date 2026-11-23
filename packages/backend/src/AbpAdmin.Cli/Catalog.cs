namespace AbpAdmin.Cli;

/// <summary>One installable ABP Admin feature: its backend, Razor Pages and Angular packages.</summary>
public record Feature(string Key, string Title, string Description, string Package, string Module, string WebPackage, string WebModule, string Npm, string NgFeature);

public static class Catalog
{
    public static readonly Feature[] Features =
    [
        new("audit-logging", "Audit logging", "request log and dashboard, traces, entity changes and history, retention, CSV export",
            "AbpAdmin.AuditLogging", "AbpAdmin.AbpAdminAuditLoggingModule", "AbpAdmin.AuditLogging.Web", "AbpAdmin.Web.AbpAdminAuditLoggingWebModule",
            "@nazem0/abp-admin-ng-audit-logging", "abpAdminAuditLogging"),
        new("identity", "Identity", "users, roles, organization units, claim types, security logs, identity settings, cache clearing",
            "AbpAdmin.Identity", "AbpAdmin.AbpAdminIdentityModule", "AbpAdmin.Identity.Web", "AbpAdmin.Web.AbpAdminIdentityWebModule",
            "@nazem0/abp-admin-ng-identity", "abpAdminIdentity"),
        new("openiddict", "OpenIddict", "client applications, client permissions, scopes",
            "AbpAdmin.OpenIddict", "AbpAdmin.AbpAdminOpenIddictModule", "AbpAdmin.OpenIddict.Web", "AbpAdmin.Web.AbpAdminOpenIddictWebModule",
            "@nazem0/abp-admin-ng-openiddict", "abpAdminOpenIddict"),
        new("background-jobs", "Background jobs", "the persisted job queue",
            "AbpAdmin.BackgroundJobs", "AbpAdmin.AbpAdminBackgroundJobsModule", "AbpAdmin.BackgroundJobs.Web", "AbpAdmin.Web.AbpAdminBackgroundJobsWebModule",
            "@nazem0/abp-admin-ng-background-jobs", "abpAdminBackgroundJobs"),
        new("event-bus", "Event outbox & inbox", "distributed event bus boxes stored with EF Core",
            "AbpAdmin.EventBus", "AbpAdmin.AbpAdminEventBusModule", "AbpAdmin.EventBus.Web", "AbpAdmin.Web.AbpAdminEventBusWebModule",
            "@nazem0/abp-admin-ng-event-bus", "abpAdminEventBus"),
        new("tenant-management", "Tenants", "tenants, multi-tenancy switch, tenant databases, users across tenants",
            "AbpAdmin.TenantManagement", "AbpAdmin.AbpAdminTenantManagementModule", "AbpAdmin.TenantManagement.Web", "AbpAdmin.Web.AbpAdminTenantManagementWebModule",
            "@nazem0/abp-admin-ng-tenant-management", "abpAdminTenantManagement"),
        new("entity-explorer", "Entity explorer", "browse and edit the entities you expose",
            "AbpAdmin.EntityExplorer", "AbpAdmin.AbpAdminEntityExplorerModule", "AbpAdmin.EntityExplorer.Web", "AbpAdmin.Web.AbpAdminEntityExplorerWebModule",
            "@nazem0/abp-admin-ng-entity-explorer", "abpAdminEntityExplorer"),
    ];

    // Everything at once: one package per UI instead of one per feature.
    public const string AllPackage = "AbpAdmin.HttpApi", AllModule = "AbpAdmin.AbpAdminHttpApiModule";
    public const string AllWebPackage = "AbpAdmin.Web", AllWebModule = "AbpAdmin.Web.AbpAdminWebModule";
    public const string AllNpm = "@nazem0/abp-admin-ng";

    // Core (always needed; the feature packages bring it, the Angular core is installed explicitly).
    public const string CorePackage = "AbpAdmin.Core", CoreWebPackage = "AbpAdmin.Core.Web", CoreWebModule = "AbpAdmin.Web.AbpAdminCoreWebModule";
    public const string CoreNpm = "@nazem0/abp-admin-ng-core";
}
