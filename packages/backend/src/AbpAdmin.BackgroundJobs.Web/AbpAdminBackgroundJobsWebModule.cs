using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

[DependsOn(typeof(AbpAdminCoreWebModule), typeof(AbpAdminBackgroundJobsModule))]
public class AbpAdminBackgroundJobsWebModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminBackgroundJobsWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminBackgroundJobsWebModule>());

        Configure<AbpAdminWebOptions>(options =>
        {
            options.Nav.Add(new AbpAdminWebNavItem("BackgroundJobs", "AbpAdmin::Nav:BackgroundJobs", "Monitoring", "AbpAdmin.BackgroundJobs",
                "M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v4h-4", "queue retry abandoned"));
        });
    }
}
