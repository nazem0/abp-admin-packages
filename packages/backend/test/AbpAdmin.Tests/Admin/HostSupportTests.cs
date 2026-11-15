using AbpAdmin.Permissions;
using Shouldly;
using System.Threading.Tasks;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.SimpleStateChecking;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class HostSupportTests : AbpAdminTestBase
{
    private interface INotRegistered;

    [Theory]
    [InlineData(AbpAdminPermissions.AuditLogs.Default)]
    [InlineData(AbpAdminPermissions.SecurityLogs.Default)]
    [InlineData(AbpAdminPermissions.Applications.Create)]
    [InlineData(AbpAdminPermissions.Scopes.Default)]
    [InlineData(AbpAdminPermissions.OrganizationUnits.ManageTree)]
    [InlineData(AbpAdminPermissions.Tenants.Default)]
    [InlineData(AbpAdminPermissions.Tenants.ManageConnectionStrings)] // the sample host handles tenant database setup
    [InlineData(AbpAdminPermissions.BackgroundJobs.Manage)]
    public async Task Areas_The_Host_Supports_Are_On(string name)
    {
        var permission = await GetRequiredService<IPermissionDefinitionManager>().GetAsync(name);
        (await GetRequiredService<ISimpleStateCheckerManager<PermissionDefinition>>().IsEnabledAsync(permission)).ShouldBeTrue();
    }

    [Fact]
    public async Task An_Area_The_Host_Lacks_Is_Off()
    {
        var any = await GetRequiredService<IPermissionDefinitionManager>().GetAsync(AbpAdminPermissions.AuditLogs.Default);
        var context = new SimpleStateCheckerContext<PermissionDefinition>(ServiceProvider, any);

        (await HostSupportStateChecker.Has<INotRegistered>().IsEnabledAsync(context)).ShouldBeFalse();
        (await HostSupportStateChecker.Has<IPermissionDefinitionManager>().IsEnabledAsync(context)).ShouldBeTrue();
    }
}
