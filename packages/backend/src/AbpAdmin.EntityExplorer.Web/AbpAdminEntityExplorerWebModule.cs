using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

[DependsOn(typeof(AbpAdminCoreWebModule), typeof(AbpAdminEntityExplorerModule))]
public class AbpAdminEntityExplorerWebModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminEntityExplorerWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminEntityExplorerWebModule>());

        Configure<AbpAdminWebOptions>(options =>
        {
            options.Nav.Add(new AbpAdminWebNavItem("Entities", "AbpAdmin::Nav:Entities", "System", "AbpAdmin.Entities",
                "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
                "data rows database table records edit"));
        });
    }
}
