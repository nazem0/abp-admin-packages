using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

/// <summary>Razor Pages for identity: users, roles, organization units, claim types, security logs and the identity settings tab.</summary>
[DependsOn(typeof(AbpAdminCoreWebModule), typeof(AbpAdminIdentityModule))]
public class AbpAdminIdentityWebModule : AbpModule
{
    const string SecurityIcon = "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2";

    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminIdentityWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(o => o.FileSets.AddEmbedded<AbpAdminIdentityWebModule>());

        Configure<AbpAdminWebOptions>(o =>
        {
            o.Nav.Add(new AbpAdminWebNavItem("SecurityLogs", "AbpAdmin::Nav:SecurityLogs", "Monitoring", "AbpAdmin.SecurityLogs", SecurityIcon, "login sign in failed lockout"));
            o.Nav.Add(new AbpAdminWebNavItem("Users", "AbpAdmin::Nav:Users", "Identity", "AbpIdentity.Users",
                "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2a6.5 6.5 0 0 1 3.5 5.8", "accounts people lock"));
            o.Nav.Add(new AbpAdminWebNavItem("Roles", "AbpAdmin::Nav:Roles", "Identity", "AbpIdentity.Roles",
                "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6zM9 12l2 2 4-4", "permissions groups"));
            o.Nav.Add(new AbpAdminWebNavItem("OrganizationUnits", "AbpAdmin::Nav:OrganizationUnits", "Identity", "AbpAdmin.OrganizationUnits",
                "M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 17v-3h12v3", "departments teams tree ou"));
            o.Nav.Add(new AbpAdminWebNavItem("ClaimTypes", "AbpAdmin::Nav:ClaimTypes", "Identity", "AbpAdmin.ClaimTypes",
                "M20 12 12 20 4 12V4h8zM8.5 8.5v.01", "claims attributes user role"));

            o.Actions.Add(new AbpAdminWebQuickAction("new-user", "AbpAdmin::Palette:NewUser", "AbpAdmin::Palette:Action", "AbpIdentity.Users.Create", "Users?new=1", "create add account"));
            o.Actions.Add(new AbpAdminWebQuickAction("new-role", "AbpAdmin::Palette:NewRole", "AbpAdmin::Palette:Action", "AbpIdentity.Roles.Create", "Roles?new=1", "create add"));
            o.Actions.Add(new AbpAdminWebQuickAction("failed", "AbpAdmin::Palette:FailedSignIns", "AbpAdmin::Nav:SecurityLogs", "AbpAdmin.SecurityLogs", "SecurityLogs?failed=1", "login invalid password", SecurityIcon));

            o.Settings.Add(new AbpAdminWebSettingsSection("identity", "AbpAdmin::Nav:SettingsIdentity", "AbpAdmin.IdentitySettings",
                "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z", "password lockout sign in registration")
            {
                Partial = "/Pages/AbpAdmin/Settings/_IdentitySettings.cshtml",
                Order = 0,
            });
        });
    }
}
