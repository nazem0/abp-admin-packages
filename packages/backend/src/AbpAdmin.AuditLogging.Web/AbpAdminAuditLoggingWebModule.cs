using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Modularity;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin.Web;

/// <summary>Razor Pages for audit logs (statistics, request log and trace) and entity changes (feed, history).</summary>
[DependsOn(typeof(AbpAdminCoreWebModule), typeof(AbpAdminAuditLoggingModule))]
public class AbpAdminAuditLoggingWebModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        PreConfigure<IMvcBuilder>(mvc => mvc.AddApplicationPartIfNotExists(typeof(AbpAdminAuditLoggingWebModule).Assembly));
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminAuditLoggingWebModule>());

        Configure<AbpAdminWebOptions>(options =>
        {
            options.Nav.Add(new AbpAdminWebNavItem("AuditLogs", "AbpAdmin::Nav:AuditLogs", "Monitoring", "AbpAdmin.AuditLogs",
                "M4 5h16M4 12h10M4 19h7M17 15l2 2 3-4", "requests http trace errors"));
            options.Nav.Add(new AbpAdminWebNavItem("EntityChanges", "AbpAdmin::Nav:EntityChanges", "Monitoring", "AbpAdmin.AuditLogs",
                "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5", "history data diff"));
            options.Settings.Add(new AbpAdminWebSettingsSection("audit-logs", "AbpAdmin::Nav:SettingsAuditLogs", "AbpAdmin.AuditLogs.ManageRetention",
                "M4 5h16M4 12h10M4 19h7M17 15l2 2 3-4", "retention cleanup delete old logs")
            {
                Partial = "/Pages/AbpAdmin/Settings/_AuditLogSettings.cshtml",
                Order = 30,
            });
        });
    }
}
