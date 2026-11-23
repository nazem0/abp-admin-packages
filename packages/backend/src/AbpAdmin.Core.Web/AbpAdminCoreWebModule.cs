using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

/// <summary>
/// The Razor Pages console: layout, overview, settings and features pages under <c>/AbpAdmin</c>, and the browser
/// runtime (<c>/abp-admin/core/abp-admin.js</c>) the feature packages' pages build on. Add AbpAdmin.*.Web feature
/// modules for the other screens; each registers its pages in <see cref="AbpAdminWebOptions"/>.
/// </summary>
[DependsOn(typeof(AbpAdminCoreModule), typeof(AbpAspNetCoreMvcModule))]
public class AbpAdminCoreWebModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminCoreWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminCoreWebModule>());

        // Every console page needs a signed-in user; each page also checks its own permission.
        Configure<RazorPagesOptions>(options => options.Conventions.AuthorizeFolder("/AbpAdmin"));

        Configure<AbpAdminWebOptions>(options =>
        {
            options.Nav.Add(new AbpAdminWebNavItem("Overview", "AbpAdmin::Nav:Overview", "", "",
                "M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v4h-6zM4 20h6v-3H4z", "home dashboard") { Order = -100 });
            options.Nav.Add(new AbpAdminWebNavItem("Features", "AbpAdmin::Nav:Features", "System", "FeatureManagement.ManageHostFeatures",
                "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4", "toggles limits") { Order = 100 });
            options.Nav.Add(new AbpAdminWebNavItem("Settings", "AbpAdmin::Nav:Settings", "System", "",
                AbpAdminWebOptions.SettingsIcon, "email smtp time zone password lockout identity") { Order = 200 });

            options.Settings.Add(new AbpAdminWebSettingsSection("time-zone", "AbpAdmin::Nav:SettingsTimeZone", "SettingManagement.TimeZone",
                "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "clock utc timezone") { Order = 10 });
            options.Settings.Add(new AbpAdminWebSettingsSection("email", "AbpAdmin::Nav:SettingsEmail", "SettingManagement.Emailing",
                "M3 6h18v12H3zM3 7l9 6 9-6", "smtp mail sender") { Order = 20 });
            options.Settings.Add(new AbpAdminWebSettingsSection("all", "AbpAdmin::Nav:SettingsAll", "AbpAdmin.Settings",
                "M4 6h16M4 12h16M4 18h16", "every setting module configuration value override") { Order = 1000 });
        });
    }
}
