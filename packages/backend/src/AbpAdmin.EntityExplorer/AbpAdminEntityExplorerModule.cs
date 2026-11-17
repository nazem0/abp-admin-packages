using AbpAdmin.Permissions;
using AbpAdmin.Services.Entities;
using Microsoft.Extensions.Options;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.Localization;
using Volo.Abp.Modularity;
using Volo.Abp.MultiTenancy;
using static AbpAdmin.Permissions.AbpAdminPermissionGroup;

namespace AbpAdmin;

/// <summary>
/// Entity explorer. Nothing is exposed until the host lists entities:
/// <c>Configure&lt;EntityExplorerOptions&gt;(o =&gt; o.Add&lt;Book&gt;().Add&lt;Author&gt;());</c>
/// </summary>
[DependsOn(
    typeof(AbpAdminCoreModule),
    typeof(AbpEntityFrameworkCoreModule)
)]
public class AbpAdminEntityExplorerModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context) => context.AddAbpAdminFeature(typeof(AbpAdminEntityExplorerModule).Assembly);
}

/// <summary>AbpAdmin.Entities, then AbpAdmin.Entities.&lt;Name&gt;[.Create/.Update/.Delete] per exposed entity.</summary>
public class EntityExplorerPermissionDefinitionProvider(IOptions<EntityExplorerOptions> options) : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var entities = context.GetAbpAdminGroup().AddPermission(AbpAdminPermissions.Entities.Default, L("Permission:Entities"));
        foreach (var e in options.Value.Entities.Values.OrderBy(e => e.Name))
        {
            // Entities without TenantId are shared by all tenants: host only.
            var side = e.IsHostOnly ? MultiTenancySides.Host : MultiTenancySides.Both;
            var entity = entities.AddChild(AbpAdminPermissions.Entities.Read(e.Name), new FixedLocalizableString(e.Name), side);
            entity.AddChild(AbpAdminPermissions.Entities.Create(e.Name), L("Permission:Create"), side);
            entity.AddChild(AbpAdminPermissions.Entities.Update(e.Name), L("Permission:Edit"), side);
            entity.AddChild(AbpAdminPermissions.Entities.Delete(e.Name), L("Permission:Delete"), side);
        }
    }
}
