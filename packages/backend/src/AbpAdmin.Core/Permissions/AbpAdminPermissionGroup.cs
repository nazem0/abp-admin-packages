using AbpAdmin.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;

namespace AbpAdmin.Permissions;

public static class AbpAdminPermissionGroup
{
    /// <summary>The shared "ABP Admin" group; each feature package adds its permissions to it.</summary>
    public static PermissionGroupDefinition GetAbpAdminGroup(this IPermissionDefinitionContext context) =>
        context.GetGroupOrNull(AbpAdminPermissions.GroupName) ?? context.AddGroup(AbpAdminPermissions.GroupName, L("Permission:AbpAdmin"));

    public static LocalizableString L(string name) => LocalizableString.Create<AbpAdminResource>(name);
}
