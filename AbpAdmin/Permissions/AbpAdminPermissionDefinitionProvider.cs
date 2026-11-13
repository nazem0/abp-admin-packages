using AbpAdmin.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;

namespace AbpAdmin.Permissions;

public class AbpAdminPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var group = context.AddGroup(AbpAdminPermissions.GroupName, L("Permission:AbpAdmin"));
        group.AddPermission(AbpAdminPermissions.AuditLogs.Default, L("Permission:AuditLogs"));
        group.AddPermission(AbpAdminPermissions.SecurityLogs.Default, L("Permission:SecurityLogs"));
        group.AddPermission(AbpAdminPermissions.IdentitySettings.Default, L("Permission:IdentitySettings"));

        var apps = group.AddPermission(AbpAdminPermissions.Applications.Default, L("Permission:Applications"));
        apps.AddChild(AbpAdminPermissions.Applications.Create, L("Permission:Create"));
        apps.AddChild(AbpAdminPermissions.Applications.Update, L("Permission:Edit"));
        apps.AddChild(AbpAdminPermissions.Applications.Delete, L("Permission:Delete"));
        apps.AddChild(AbpAdminPermissions.Applications.ManagePermissions, L("Permission:ManagePermissions"));

        var scopes = group.AddPermission(AbpAdminPermissions.Scopes.Default, L("Permission:Scopes"));
        scopes.AddChild(AbpAdminPermissions.Scopes.Create, L("Permission:Create"));
        scopes.AddChild(AbpAdminPermissions.Scopes.Update, L("Permission:Edit"));
        scopes.AddChild(AbpAdminPermissions.Scopes.Delete, L("Permission:Delete"));

        var ous = group.AddPermission(AbpAdminPermissions.OrganizationUnits.Default, L("Permission:OrganizationUnits"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageTree, L("Permission:OrganizationUnits.ManageTree"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageMembers, L("Permission:OrganizationUnits.ManageMembers"));
        ous.AddChild(AbpAdminPermissions.OrganizationUnits.ManageRoles, L("Permission:OrganizationUnits.ManageRoles"));

        var jobs = group.AddPermission(AbpAdminPermissions.BackgroundJobs.Default, L("Permission:BackgroundJobs"));
        jobs.AddChild(AbpAdminPermissions.BackgroundJobs.Manage, L("Permission:BackgroundJobs.Manage"));
    }

    private static LocalizableString L(string name)
    {
        return LocalizableString.Create<AbpAdminResource>(name);
    }
}
