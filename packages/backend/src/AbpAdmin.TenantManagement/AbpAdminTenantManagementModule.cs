using AbpAdmin.Permissions;
using AbpAdmin.Services.Tenants;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Identity;
using Volo.Abp.Modularity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.SettingManagement;
using Volo.Abp.TenantManagement;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;
using static AbpAdmin.Permissions.HostSupportStateChecker;

namespace AbpAdmin;

/// <summary>Tenants, the runtime multi-tenancy switch, tenant databases and users across tenants.</summary>
[DependsOn(
    typeof(AbpAdminCoreModule),
    typeof(AbpTenantManagementDomainModule),
    typeof(AbpIdentityDomainModule),
    typeof(AbpIdentityApplicationContractsModule),
    typeof(AbpSettingManagementDomainModule),
    typeof(Volo.Abp.Emailing.AbpEmailingModule)
)]
public class AbpAdminTenantManagementModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminTenantManagementModule).Assembly);

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        // Host admins with Tenants.ManageUsers keep their user-management permissions inside a tenant (Users page)...
        Configure<AbpPermissionOptions>(options => options.ValueProviders.Add<HostUserInTenantPermissionValueProvider>());
        // ...and may send the __tenant header on user-management endpoints (ABP ignores it for signed-in users).
        Configure<AbpTenantResolveOptions>(options => options.TenantResolvers.Insert(0, new HostUserInTenantResolveContributor()));
        // A tenant's features (provider "T" with its id) need a policy; the free modules don't define one.
        PostConfigure<Volo.Abp.FeatureManagement.FeatureManagementOptions>(options => // Post: ABP's TenantManagement module sets its own Pro-style policy.
            options.ProviderPolicies[Volo.Abp.Features.TenantFeatureValueProvider.ProviderName] = AbpAdminPermissions.Tenants.ManageFeatures);
    }

    // Re-applies the multi-tenancy switch saved from the Tenants page.
    public override async Task OnPostApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        using var scope = context.ServiceProvider.CreateScope();
        await scope.ServiceProvider.GetRequiredService<MultiTenancySwitch>().LoadAsync(scope.ServiceProvider);
    }
}

public class TenantManagementPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var tenants = context.GetAbpAdminGroup().AddPermission(AbpAdminPermissions.Tenants.Default, L("Permission:Tenants"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.Create, L("Permission:Create"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.Update, L("Permission:Edit"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.Delete, L("Permission:Delete"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.ManageMultiTenancy, L("Permission:Tenants.ManageMultiTenancy"), MultiTenancySides.Host);
        var connectionStrings = tenants.AddChild(AbpAdminPermissions.Tenants.ManageConnectionStrings, L("Permission:Tenants.ManageConnectionStrings"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.ManageUsers, L("Permission:Tenants.ManageUsers"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.ManageFeatures, L("Permission:Tenants.ManageFeatures"), MultiTenancySides.Host);
        tenants.RequireHost(Has<ITenantRepository>());
        // Own databases need the host to migrate and seed them: ABP's TenantConnectionStringUpdatedEto handler.
        connectionStrings.RequireHost(Handles<TenantConnectionStringUpdatedEto>());
    }
}
