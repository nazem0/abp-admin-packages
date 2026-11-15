using AbpAdmin.Permissions;
using AbpAdmin.Services.Dashboard;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.AuditLogging;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Modularity;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;
using static AbpAdmin.Permissions.HostSupportStateChecker;

namespace AbpAdmin;

/// <summary>Audit logs, request traces, entity changes and entity history.</summary>
[DependsOn(typeof(AbpAdminCoreModule), typeof(AbpAuditLoggingDomainModule))]
public class AbpAdminAuditLoggingModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminAuditLoggingModule).Assembly);

    public override void ConfigureServices(ServiceConfigurationContext context) =>
        context.Services.AddTransient<IAbpAdminDashboardContributor, AuditLoggingDashboardContributor>();
}

public class AuditLoggingPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context) =>
        context.GetAbpAdminGroup().AddPermission(AbpAdminPermissions.AuditLogs.Default, L("Permission:AuditLogs")).RequireHost(Auditing<IAuditLogRepository>());
}

public class AuditLoggingDashboardContributor : AbpAdminDashboardContributor
{
    public override async Task ContributeAsync(DashboardDto dashboard)
    {
        if (!await IsGrantedAsync(AbpAdminPermissions.AuditLogs.Default)) return;
        var since = Since24Hours;
        var q = (await LazyServiceProvider.LazyGetRequiredService<IRepository<AuditLog, Guid>>().GetQueryableAsync())
            .Where(a => a.ExecutionTime >= since);
        var count = await AsyncExecuter.CountAsync(q);
        dashboard.Requests = new DashboardRequestsDto
        {
            Last24Hours = count,
            Failed = await AsyncExecuter.CountAsync(q.Where(a => a.HttpStatusCode >= 400 || (a.Exceptions != null && a.Exceptions != ""))),
            AverageMs = count == 0 ? 0 : (int)await AsyncExecuter.AverageAsync(q.Select(a => (double)a.ExecutionDuration)),
        };
    }
}
