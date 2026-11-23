using AbpAdmin.Permissions;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.Modularity;
using Volo.Abp.MultiTenancy;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;

namespace AbpAdmin;

/// <summary>The distributed event bus outbox and inbox (EF Core boxes, <c>UseDbContext&lt;T&gt;()</c>).</summary>
[DependsOn(typeof(AbpAdminCoreModule), typeof(AbpEntityFrameworkCoreModule))]
public class AbpAdminEventBusModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminEventBusModule).Assembly);
}

public class EventBusPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context) =>
        context.GetAbpAdminGroup().AddPermission(AbpAdminPermissions.EventBoxes.Default, L("Permission:EventBoxes"), MultiTenancySides.Host)
            .AddChild(AbpAdminPermissions.EventBoxes.Manage, L("Permission:EventBoxes.Manage"), MultiTenancySides.Host);
}
