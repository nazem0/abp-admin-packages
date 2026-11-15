using AbpAdmin.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;
using Volo.Abp.MultiTenancy;

namespace AbpAdmin.Permissions;

public class AbpAdminPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var group = context.AddGroup(AbpAdminPermissions.GroupName, L("Permission:AbpAdmin"));
        group.AddPermission(AbpAdminPermissions.AuditLogs.Default, L("Permission:AuditLogs"));
        group.AddPermission(AbpAdminPermissions.SecurityLogs.Default, L("Permission:SecurityLogs"));
        group.AddPermission(AbpAdminPermissions.IdentitySettings.Default, L("Permission:IdentitySettings"));

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

        var jobs = group.AddPermission(AbpAdminPermissions.BackgroundJobs.Default, L("Permission:BackgroundJobs"), MultiTenancySides.Host);
        jobs.AddChild(AbpAdminPermissions.BackgroundJobs.Manage, L("Permission:BackgroundJobs.Manage"));
    }

    private static LocalizableString L(string name)
    {
        return LocalizableString.Create<AbpAdminResource>(name);
    }
}
