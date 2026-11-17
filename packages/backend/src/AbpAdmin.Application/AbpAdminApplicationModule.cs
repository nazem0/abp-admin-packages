using Volo.Abp.Modularity;

namespace AbpAdmin;

/// <summary>Every ABP Admin feature. Depend on the feature modules (AbpAdminAuditLoggingModule, ...) to pick only some.</summary>
[DependsOn(
    typeof(AbpAdminCoreModule),
    typeof(AbpAdminAuditLoggingModule),
    typeof(AbpAdminIdentityModule),
    typeof(AbpAdminOpenIddictModule),
    typeof(AbpAdminBackgroundJobsModule),
    typeof(AbpAdminTenantManagementModule),
    typeof(AbpAdminEntityExplorerModule)
)]
public class AbpAdminApplicationModule : AbpModule
{
}
