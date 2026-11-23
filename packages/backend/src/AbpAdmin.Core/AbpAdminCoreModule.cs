using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using AbpAdmin.Localization;
using Volo.Abp.Application;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Mvc.Localization;
using Volo.Abp.Localization;
using Volo.Abp.Localization.ExceptionHandling;
using Volo.Abp.Mapperly;
using Volo.Abp.Modularity;
using Volo.Abp.SettingManagement;
using Volo.Abp.Authorization.Permissions;
using AbpAdmin.Permissions;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;
using Volo.Abp.Validation.Localization;
using Volo.Abp.VirtualFileSystem;

namespace AbpAdmin;

/// <summary>
/// What every ABP Admin feature package builds on: the <c>AbpAdmin</c> localization resource and permission group,
/// the overview dashboard (each installed feature adds its section) and the HTTP API conventions
/// (<c>/api/abp-admin/...</c>, remote service <c>AbpAdmin</c>).
/// </summary>
[DependsOn(
    typeof(AbpDddApplicationModule),
    typeof(AbpMapperlyModule),
    typeof(AbpAspNetCoreMvcModule),
    typeof(AbpSettingManagementDomainModule)
)]
public class AbpAdminCoreModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminCoreModule).Assembly);

    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        Configure<AbpVirtualFileSystemOptions>(options => options.FileSets.AddEmbedded<AbpAdminCoreModule>());

        Configure<AbpLocalizationOptions>(options =>
        {
            options.Resources
                .Add<AbpAdminResource>("en")
                .AddBaseTypes(typeof(AbpValidationResource))
                .AddVirtualJson("/Localization/AbpAdmin");
        });

        Configure<AbpExceptionLocalizationOptions>(options => options.MapCodeNamespace("AbpAdmin", typeof(AbpAdminResource)));
    }
}

public class CorePermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context) =>
        context.GetAbpAdminGroup().AddPermission(AbpAdminPermissions.Settings.Default, L("Permission:Settings"))
            .AddChild(AbpAdminPermissions.Settings.Update, L("Permission:Edit"));
}

public static class AbpAdminRemoteService
{
    public const string Name = "AbpAdmin";
    public const string RootPath = "abp-admin";
}

public static class AbpAdminFeatureRegistration
{
    /// <summary>
    /// Call from a feature module's PreConfigureServices: publishes the assembly's application services as API
    /// controllers under <c>/api/abp-admin</c> and localizes its DTO validation with the AbpAdmin resource.
    /// </summary>
    public static void AddAbpAdminFeature(this ServiceConfigurationContext context, Assembly assembly)
    {
        context.Services.PreConfigure<AbpMvcDataAnnotationsLocalizationOptions>(options =>
            options.AddAssemblyResource(typeof(AbpAdminResource), assembly));
        // Configure, not PreConfigure: pre-configured conventional controllers lose ABP's dynamic proxies (unit of work,
        // authorization, validation) when an app service is called directly, e.g. from a Razor page or a test.
        context.Services.Configure<AbpAspNetCoreMvcOptions>(options =>
            options.ConventionalControllers.Create(assembly, setting =>
            {
                setting.RootPath = AbpAdminRemoteService.RootPath;
                setting.RemoteServiceName = AbpAdminRemoteService.Name;
            }));
    }
}
