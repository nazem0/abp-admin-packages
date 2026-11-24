using AbpAdmin.Permissions;
using AbpAdmin.Services.Dashboard;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;
using Volo.Abp.SettingManagement;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;
using static AbpAdmin.Permissions.HostSupportStateChecker;

namespace AbpAdmin;

/// <summary>Security logs, organization units, claim types and claims, user lock/unlock, import/export, and identity settings.</summary>
[DependsOn(
    typeof(AbpAdminCoreModule),
    typeof(AbpIdentityDomainModule),
    typeof(AbpIdentityApplicationContractsModule),
    typeof(AbpSettingManagementDomainModule)
    // Permission/Feature Management: only their cache item types are used (cache page). Their Domain modules aren't
    // depended on: they save static definitions to the database at startup and fail in apps without those EF modules.
)]
public class AbpAdminIdentityModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminIdentityModule).Assembly);

    public override void ConfigureServices(ServiceConfigurationContext context) =>
        context.Services.AddTransient<IAbpAdminDashboardContributor, IdentityDashboardContributor>();
}

public class IdentityPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var group = context.GetAbpAdminGroup();
        group.AddPermission(AbpAdminPermissions.SecurityLogs.Default, L("Permission:SecurityLogs")).RequireHost(Has<IIdentitySecurityLogRepository>());
        group.AddPermission(AbpAdminPermissions.IdentitySettings.Default, L("Permission:IdentitySettings"));
        group.AddPermission(AbpAdminPermissions.Cache.Default, L("Permission:Cache"));

        var ous = group.AddPermission(AbpAdminPermissions.OrganizationUnits.Default, L("Permission:OrganizationUnits"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageTree, L("Permission:OrganizationUnits.ManageTree"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageMembers, L("Permission:OrganizationUnits.ManageMembers"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageRoles, L("Permission:OrganizationUnits.ManageRoles"));
        ous.RequireHost(Has<IOrganizationUnitRepository>());

        var claimTypes = group.AddPermission(AbpAdminPermissions.ClaimTypes.Default, L("Permission:ClaimTypes"), Volo.Abp.MultiTenancy.MultiTenancySides.Host);
        claimTypes.AddChild(AbpAdminPermissions.ClaimTypes.Create, L("Permission:Create"), Volo.Abp.MultiTenancy.MultiTenancySides.Host);
        claimTypes.AddChild(AbpAdminPermissions.ClaimTypes.Update, L("Permission:Edit"), Volo.Abp.MultiTenancy.MultiTenancySides.Host);
        claimTypes.AddChild(AbpAdminPermissions.ClaimTypes.Delete, L("Permission:Delete"), Volo.Abp.MultiTenancy.MultiTenancySides.Host);
    }
}

public class IdentityDashboardContributor : AbpAdminDashboardContributor
{
    private IRepository<T, Guid> Repo<T>() where T : class, Volo.Abp.Domain.Entities.IEntity<Guid> =>
        LazyServiceProvider.LazyGetRequiredService<IRepository<T, Guid>>();

    public override async Task ContributeAsync(DashboardDto dashboard)
    {
        if (await IsGrantedAsync(IdentityPermissions.Users.Default))
        {
            var q = await Repo<IdentityUser>().GetQueryableAsync();
            var weekAgo = Clock.Now.AddDays(-7);
            var utcNow = DateTimeOffset.UtcNow;
            dashboard.Users = new DashboardUsersDto
            {
                Total = await AsyncExecuter.CountAsync(q),
                Inactive = await AsyncExecuter.CountAsync(q.Where(u => !u.IsActive)),
                // DateTimeOffset comparison isn't translatable on every provider (SQLite); only users with a lockout date are read.
                Locked = (await AsyncExecuter.ToListAsync(q.Where(u => u.LockoutEnd != null).Select(u => u.LockoutEnd))).Count(e => e > utcNow),
                NewLast7Days = await AsyncExecuter.CountAsync(q.Where(u => u.CreationTime >= weekAgo)),
            };
        }
        if (await IsGrantedAsync(IdentityPermissions.Roles.Default))
            dashboard.Roles = (int)await Repo<IdentityRole>().GetCountAsync();
        if (await IsGrantedAsync(AbpAdminPermissions.SecurityLogs.Default))
        {
            var since = Since24Hours;
            var q = (await Repo<IdentitySecurityLog>().GetQueryableAsync()).Where(s => s.CreationTime >= since);
            dashboard.SignIns = new DashboardSignInsDto
            {
                Succeeded = await AsyncExecuter.CountAsync(q.Where(s => s.Action == IdentitySecurityLogActionConsts.LoginSucceeded)),
                Failed = await AsyncExecuter.CountAsync(q.Where(s => s.Action != null && s.Action.StartsWith("Login")
                    && s.Action != IdentitySecurityLogActionConsts.LoginSucceeded)),
                Lockouts = await AsyncExecuter.CountAsync(q.Where(s => s.Action == IdentitySecurityLogActionConsts.LoginLockedout)),
            };
        }
    }
}
