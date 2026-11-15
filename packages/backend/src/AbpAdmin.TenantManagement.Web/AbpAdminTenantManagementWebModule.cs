using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

[DependsOn(typeof(AbpAdminCoreWebModule), typeof(AbpAdminTenantManagementModule))]
public class AbpAdminTenantManagementWebModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminTenantManagementWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminTenantManagementWebModule>());

        Configure<AbpAdminWebOptions>(options =>
        {
            options.Nav.Add(new AbpAdminWebNavItem("Tenants", "AbpAdmin::Nav:Tenants", "System", "AbpAdmin.Tenants",
                "M4 21V6l7-3v18M11 21h9V10l-9-3M7.5 9v.01M7.5 13v.01M7.5 17v.01M15 13v.01M15 17v.01M3 21h18", "multi-tenancy saas customers enable disable") { Order = 0 });
        });
    }
}
