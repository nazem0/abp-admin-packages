using Abp_Administration.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;
using Volo.Abp.MultiTenancy;

namespace Abp_Administration.Permissions;

public class Abp_AdministrationPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var myGroup = context.AddGroup(Abp_AdministrationPermissions.GroupName);


        var booksPermission = myGroup.AddPermission(Abp_AdministrationPermissions.Books.Default, L("Permission:Books"));
        booksPermission.AddChild(Abp_AdministrationPermissions.Books.Create, L("Permission:Books.Create"));
        booksPermission.AddChild(Abp_AdministrationPermissions.Books.Edit, L("Permission:Books.Edit"));
        booksPermission.AddChild(Abp_AdministrationPermissions.Books.Delete, L("Permission:Books.Delete"));

        var authorsPermission = myGroup.AddPermission(Abp_AdministrationPermissions.Authors.Default, L("Permission:Authors"));
        authorsPermission.AddChild(Abp_AdministrationPermissions.Authors.Create, L("Permission:Authors.Create"));
        authorsPermission.AddChild(Abp_AdministrationPermissions.Authors.Edit, L("Permission:Authors.Edit"));
        authorsPermission.AddChild(Abp_AdministrationPermissions.Authors.Delete, L("Permission:Authors.Delete"));

        //Define your own permissions here. Example:
        //myGroup.AddPermission(Abp_AdministrationPermissions.MyPermission1, L("Permission:MyPermission1"));
    }

    private static LocalizableString L(string name)
    {
        return LocalizableString.Create<Abp_AdministrationResource>(name);
    }
}
