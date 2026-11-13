using AbpAdmin.Localization;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc.Localization;
using Volo.Abp.Modularity;

namespace AbpAdmin;

/// <summary>
/// Publishes the ABP Admin application services as conventional API controllers:
/// <c>/api/abp-admin/{service}/...</c>, remote service name <see cref="RemoteServiceName"/>.
/// </summary>
[DependsOn(
    typeof(AbpAdminApplicationModule),
    typeof(AbpAspNetCoreMvcModule)
)]
public class AbpAdminHttpApiModule : AbpModule
{
    public const string RemoteServiceName = "AbpAdmin";
    public const string RootPath = "abp-admin";

    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<AbpMvcDataAnnotationsLocalizationOptions>(options =>
            options.AddAssemblyResource(typeof(AbpAdminResource), typeof(AbpAdminApplicationModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpAspNetCoreMvcOptions>(options =>
        {
            options.ConventionalControllers.Create(typeof(AbpAdminApplicationModule).Assembly, setting =>
            {
                setting.RootPath = RootPath;
                setting.RemoteServiceName = RemoteServiceName;
            });
        });
    }
}
