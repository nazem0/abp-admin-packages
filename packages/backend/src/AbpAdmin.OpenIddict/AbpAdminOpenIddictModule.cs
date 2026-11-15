using AbpAdmin.Permissions;
using AbpAdmin.Services.Dashboard;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Modularity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.OpenIddict;
using Volo.Abp.OpenIddict.Applications;
using Volo.Abp.OpenIddict.Scopes;
using Volo.Abp.PermissionManagement;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;
using static AbpAdmin.Permissions.HostSupportStateChecker;

namespace AbpAdmin;

/// <summary>OpenIddict applications and scopes.</summary>
[DependsOn(typeof(AbpAdminCoreModule), typeof(AbpOpenIddictDomainModule), typeof(AbpPermissionManagementDomainModule))]
public class AbpAdminOpenIddictModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminOpenIddictModule).Assembly);

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        // The free OpenIddict module maps client ("C") permissions to a Pro-only policy; use ours instead.
        Configure<PermissionManagementOptions>(options =>
            options.ProviderPolicies[ClientPermissionValueProvider.ProviderName] = AbpAdminPermissions.Applications.ManagePermissions);
        context.Services.AddTransient<IAbpAdminDashboardContributor, OpenIddictDashboardContributor>();
    }
}

public class OpenIddictPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var group = context.GetAbpAdminGroup();
        var apps = group.AddPermission(AbpAdminPermissions.Applications.Default, L("Permission:Applications"), MultiTenancySides.Host);
        apps.AddChild(AbpAdminPermissions.Applications.Create, L("Permission:Create"));
        apps.AddChild(AbpAdminPermissions.Applications.Update, L("Permission:Edit"));
        apps.AddChild(AbpAdminPermissions.Applications.Delete, L("Permission:Delete"));
        apps.AddChild(AbpAdminPermissions.Applications.ManagePermissions, L("Permission:ManagePermissions"));
        apps.RequireHost(Has<IOpenIddictApplicationRepository>());

        var scopes = group.AddPermission(AbpAdminPermissions.Scopes.Default, L("Permission:Scopes"), MultiTenancySides.Host);
        scopes.AddChild(AbpAdminPermissions.Scopes.Create, L("Permission:Create"));
        scopes.AddChild(AbpAdminPermissions.Scopes.Update, L("Permission:Edit"));
        scopes.AddChild(AbpAdminPermissions.Scopes.Delete, L("Permission:Delete"));
        scopes.RequireHost(Has<IOpenIddictScopeRepository>());
    }
}

public class OpenIddictDashboardContributor : AbpAdminDashboardContributor
{
    public override async Task ContributeAsync(DashboardDto dashboard)
    {
        if (await IsGrantedAsync(AbpAdminPermissions.Applications.Default))
            dashboard.Applications = (int)await LazyServiceProvider.LazyGetRequiredService<IRepository<OpenIddictApplication, Guid>>().GetCountAsync();
    }
}
