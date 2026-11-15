using AbpAdmin.Localization;
using AbpAdmin.Permissions;
using AbpAdmin.Services.Tenants;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp;
using Volo.Abp.TenantManagement;
using Volo.Abp.Application;
using Volo.Abp.AuditLogging;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Identity;
using Volo.Abp.Localization;
using Volo.Abp.Localization.ExceptionHandling;
using Volo.Abp.Mapperly;
using Volo.Abp.Modularity;
using Volo.Abp.OpenIddict;
using Volo.Abp.PermissionManagement;
using Volo.Abp.SettingManagement;
using Volo.Abp.Validation.Localization;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin;

/// <summary>
/// ABP Admin application layer. Wraps the repositories and domain services of the free ABP modules
/// (Audit Logging, Identity, OpenIddict, Background Jobs, Setting/Permission Management, Tenant Management) in application
/// services. Add <c>AbpAdminHttpApiModule</c> to expose them over HTTP under <c>/api/abp-admin</c>.
/// </summary>
[DependsOn(
    typeof(AbpDddApplicationModule),
    typeof(AbpMapperlyModule),
    typeof(AbpAuditLoggingDomainModule),
    typeof(AbpIdentityDomainModule),
    typeof(AbpIdentityApplicationContractsModule),
    typeof(AbpOpenIddictDomainModule),
    typeof(AbpBackgroundJobsDomainModule),
    typeof(AbpSettingManagementDomainModule),
    typeof(AbpPermissionManagementDomainModule),
    typeof(AbpTenantManagementDomainModule)
)]
public class AbpAdminApplicationModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options =>
        {
            options.FileSets.AddEmbedded<AbpAdminApplicationModule>();
        });

        Configure<AbpLocalizationOptions>(options =>
        {
            options.Resources
                .Add<AbpAdminResource>("en")
                .AddBaseTypes(typeof(AbpValidationResource))
                .AddVirtualJson("/Localization/AbpAdmin");
        });

        Configure<AbpExceptionLocalizationOptions>(options =>
        {
            options.MapCodeNamespace("AbpAdmin", typeof(AbpAdminResource));
        });

        // The free OpenIddict module maps client ("C") permissions to a Pro-only policy; use ours instead.
        Configure<PermissionManagementOptions>(options =>
            options.ProviderPolicies[ClientPermissionValueProvider.ProviderName] = AbpAdminPermissions.Applications.ManagePermissions);

        // Host admins with Tenants.ManageUsers keep their user-management permissions inside a tenant (Users page).
        Configure<AbpPermissionOptions>(options => options.ValueProviders.Add<HostUserInTenantPermissionValueProvider>());
    }

    // Re-applies the multi-tenancy switch saved from the Tenants page.
    public override async Task OnPostApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        using var scope = context.ServiceProvider.CreateScope();
        await scope.ServiceProvider.GetRequiredService<MultiTenancySwitch>().LoadAsync(scope.ServiceProvider);
    }
}
