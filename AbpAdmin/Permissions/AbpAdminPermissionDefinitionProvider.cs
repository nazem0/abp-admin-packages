using AbpAdmin.Localization;
using AbpAdmin.Services.Entities;
using Microsoft.Extensions.Options;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;
using Volo.Abp.MultiTenancy;

namespace AbpAdmin.Permissions;

public class AbpAdminPermissionDefinitionProvider(IOptions<EntityExplorerOptions> entityOptions) : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var group = context.AddGroup(AbpAdminPermissions.GroupName, L("Permission:AbpAdmin"));
        var auditLogs = group.AddPermission(AbpAdminPermissions.AuditLogs.Default, L("Permission:AuditLogs"));
        auditLogs.AddChild(AbpAdminPermissions.AuditLogs.ManageRetention, L("Permission:AuditLogs.ManageRetention"), MultiTenancySides.Host);

        var claimTypes = group.AddPermission(AbpAdminPermissions.ClaimTypes.Default, L("Permission:ClaimTypes"), MultiTenancySides.Host);
        claimTypes.AddChild(AbpAdminPermissions.ClaimTypes.Create, L("Permission:Create"), MultiTenancySides.Host);
        claimTypes.AddChild(AbpAdminPermissions.ClaimTypes.Update, L("Permission:Edit"), MultiTenancySides.Host);
        claimTypes.AddChild(AbpAdminPermissions.ClaimTypes.Delete, L("Permission:Delete"), MultiTenancySides.Host);
        group.AddPermission(AbpAdminPermissions.SecurityLogs.Default, L("Permission:SecurityLogs"));
        group.AddPermission(AbpAdminPermissions.IdentitySettings.Default, L("Permission:IdentitySettings"));
        group.AddPermission(AbpAdminPermissions.Settings.Default, L("Permission:Settings"))
            .AddChild(AbpAdminPermissions.Settings.Update, L("Permission:Edit"));
        group.AddPermission(AbpAdminPermissions.Cache.Default, L("Permission:Cache"));
        group.AddPermission(AbpAdminPermissions.EventBoxes.Default, L("Permission:EventBoxes"), MultiTenancySides.Host)
            .AddChild(AbpAdminPermissions.EventBoxes.Manage, L("Permission:EventBoxes.Manage"), MultiTenancySides.Host);

        var apps = group.AddPermission(AbpAdminPermissions.Applications.Default, L("Permission:Applications"), MultiTenancySides.Host);
        apps.AddChild(AbpAdminPermissions.Applications.Create, L("Permission:Create"));
        apps.AddChild(AbpAdminPermissions.Applications.Update, L("Permission:Edit"));
        apps.AddChild(AbpAdminPermissions.Applications.Delete, L("Permission:Delete"));
        apps.AddChild(AbpAdminPermissions.Applications.ManagePermissions, L("Permission:ManagePermissions"));

        var scopes = group.AddPermission(AbpAdminPermissions.Scopes.Default, L("Permission:Scopes"), MultiTenancySides.Host);
        scopes.AddChild(AbpAdminPermissions.Scopes.Create, L("Permission:Create"));
        scopes.AddChild(AbpAdminPermissions.Scopes.Update, L("Permission:Edit"));
        scopes.AddChild(AbpAdminPermissions.Scopes.Delete, L("Permission:Delete"));

        var ous = group.AddPermission(AbpAdminPermissions.OrganizationUnits.Default, L("Permission:OrganizationUnits"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageTree, L("Permission:OrganizationUnits.ManageTree"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageMembers, L("Permission:OrganizationUnits.ManageMembers"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageRoles, L("Permission:OrganizationUnits.ManageRoles"));

        var tenants = group.AddPermission(AbpAdminPermissions.Tenants.Default, L("Permission:Tenants"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.Create, L("Permission:Create"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.Update, L("Permission:Edit"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.Delete, L("Permission:Delete"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.ManageMultiTenancy, L("Permission:Tenants.ManageMultiTenancy"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.ManageConnectionStrings, L("Permission:Tenants.ManageConnectionStrings"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.ManageUsers, L("Permission:Tenants.ManageUsers"), MultiTenancySides.Host);
        tenants.AddChild(AbpAdminPermissions.Tenants.ManageFeatures, L("Permission:Tenants.ManageFeatures"), MultiTenancySides.Host);

        var jobs = group.AddPermission(AbpAdminPermissions.BackgroundJobs.Default, L("Permission:BackgroundJobs"), MultiTenancySides.Host);
        jobs.AddChild(AbpAdminPermissions.BackgroundJobs.Manage, L("Permission:BackgroundJobs.Manage"));

        var entities = group.AddPermission(AbpAdminPermissions.Entities.Default, L("Permission:Entities"));
        foreach (var e in entityOptions.Value.Entities.Values.OrderBy(e => e.Name))
        {
            // Entities without TenantId are shared by all tenants: host only.
            var side = e.IsHostOnly ? MultiTenancySides.Host : MultiTenancySides.Both;
            var entity = entities.AddChild(AbpAdminPermissions.Entities.Read(e.Name), new FixedLocalizableString(e.Name), side);
            entity.AddChild(AbpAdminPermissions.Entities.Create(e.Name), L("Permission:Create"), side);
            entity.AddChild(AbpAdminPermissions.Entities.Update(e.Name), L("Permission:Edit"), side);
            entity.AddChild(AbpAdminPermissions.Entities.Delete(e.Name), L("Permission:Delete"), side);
        }
    }

    private static LocalizableString L(string name)
    {
        return LocalizableString.Create<AbpAdminResource>(name);
    }
}
