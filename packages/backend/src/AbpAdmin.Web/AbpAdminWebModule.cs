using Volo.Abp.Modularity;

namespace AbpAdmin.Web;

/// <summary>The whole Razor Pages console (under /AbpAdmin) with every feature and its APIs. Depend on the AbpAdmin*WebModule feature modules to pick only some.</summary>
[DependsOn(
    typeof(AbpAdminHttpApiModule),
    typeof(AbpAdminCoreWebModule),
    typeof(AbpAdminAuditLoggingWebModule),
    typeof(AbpAdminIdentityWebModule),
    typeof(AbpAdminOpenIddictWebModule),
    typeof(AbpAdminBackgroundJobsWebModule),
    typeof(AbpAdminEventBusWebModule),
    typeof(AbpAdminTenantManagementWebModule),
    typeof(AbpAdminEntityExplorerWebModule)
)]
public class AbpAdminWebModule : AbpModule
{
}
