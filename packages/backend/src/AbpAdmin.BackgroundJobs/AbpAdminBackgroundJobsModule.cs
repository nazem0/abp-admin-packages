using AbpAdmin.Permissions;
using AbpAdmin.Services.Dashboard;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Modularity;
using Volo.Abp.MultiTenancy;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;
using static AbpAdmin.Permissions.HostSupportStateChecker;

namespace AbpAdmin;

/// <summary>The background job queue.</summary>
[DependsOn(typeof(AbpAdminCoreModule), typeof(AbpBackgroundJobsDomainModule))]
public class AbpAdminBackgroundJobsModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminBackgroundJobsModule).Assembly);

    public override void ConfigureServices(ServiceConfigurationContext context) =>
        context.Services.AddTransient<IAbpAdminDashboardContributor, BackgroundJobsDashboardContributor>();
}

public class BackgroundJobsPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var jobs = context.GetAbpAdminGroup().AddPermission(AbpAdminPermissions.BackgroundJobs.Default, L("Permission:BackgroundJobs"), MultiTenancySides.Host);
        jobs.AddChild(AbpAdminPermissions.BackgroundJobs.Manage, L("Permission:BackgroundJobs.Manage"));
        jobs.RequireHost(Has<IBackgroundJobRepository>());
    }
}

public class BackgroundJobsDashboardContributor : AbpAdminDashboardContributor
{
    public override async Task ContributeAsync(DashboardDto dashboard)
    {
        if (!await IsGrantedAsync(AbpAdminPermissions.BackgroundJobs.Default)) return;
        var q = await LazyServiceProvider.LazyGetRequiredService<IRepository<BackgroundJobRecord, Guid>>().GetQueryableAsync();
        dashboard.Jobs = new DashboardJobsDto
        {
            Waiting = await AsyncExecuter.CountAsync(q.Where(j => !j.IsAbandoned)),
            Abandoned = await AsyncExecuter.CountAsync(q.Where(j => j.IsAbandoned)),
        };
    }
}
