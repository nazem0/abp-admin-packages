using Volo.Abp.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

/// <summary>Razor Pages for OpenIddict client applications and API scopes under <c>/AbpAdmin</c>.</summary>
[DependsOn(typeof(AbpAdminCoreWebModule), typeof(AbpAdminOpenIddictModule))]
public class AbpAdminOpenIddictWebModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminOpenIddictWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminOpenIddictWebModule>());

        Configure<AbpAdminWebOptions>(options =>
        {
            options.Nav.Add(new AbpAdminWebNavItem("Applications", "AbpAdmin::Nav:Applications", "OpenIddict", "AbpAdmin.Applications",
                "M4 5h16v14H4zM4 9h16M8 13h3", "clients oauth oidc secret redirect"));
            options.Nav.Add(new AbpAdminWebNavItem("Scopes", "AbpAdmin::Nav:Scopes", "OpenIddict", "AbpAdmin.Scopes",
                "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z", "api resources audience"));

            options.Actions.Add(new AbpAdminWebQuickAction("new-app", "AbpAdmin::Palette:NewApplication", "AbpAdmin::Palette:Action",
                "AbpAdmin.Applications.Create", "Applications?new=1", "create client oauth"));
            options.Actions.Add(new AbpAdminWebQuickAction("new-scope", "AbpAdmin::Palette:NewScope", "AbpAdmin::Palette:Action",
                "AbpAdmin.Scopes.Create", "Scopes?new=1", "create api"));
        });
    }
}
