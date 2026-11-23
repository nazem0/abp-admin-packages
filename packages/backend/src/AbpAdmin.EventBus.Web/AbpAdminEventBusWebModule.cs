using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

[DependsOn(typeof(AbpAdminCoreWebModule), typeof(AbpAdminEventBusModule))]
public class AbpAdminEventBusWebModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminEventBusWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminEventBusWebModule>());

        Configure<AbpAdminWebOptions>(options =>
        {
            options.Nav.Add(new AbpAdminWebNavItem("Events", "AbpAdmin::Nav:Events", "Monitoring", "AbpAdmin.EventBoxes",
                "M4 7h12M12 3l4 4-4 4M20 17H8M12 13l-4 4 4 4", "outbox inbox distributed event bus messages retry"));
        });
    }
}
