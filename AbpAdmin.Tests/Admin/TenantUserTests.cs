using System;
using System.Security.Claims;
using System.Threading.Tasks;
using AbpAdmin.Permissions;
using Shouldly;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Identity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.Security.Claims;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class TenantUserTests : AbpAdminTestBase
{
    private const string UsersUpdate = "AbpIdentity.Users.Update";

    [Fact]
    public async Task Host_Admin_Keeps_Only_User_Management_Inside_A_Tenant()
    {
        var admin = await GetRequiredService<IIdentityUserRepository>().FindByNormalizedUserNameAsync("ADMIN");
        var host = Principal(new Claim(AbpClaimTypes.UserId, admin!.Id.ToString()), new Claim(AbpClaimTypes.Role, "admin"));
        // The real checker: the test module swaps IPermissionChecker for always-allow.
        var checker = GetRequiredService<PermissionChecker>();
        var currentTenant = GetRequiredService<ICurrentTenant>();
        var inTenant = async (ClaimsPrincipal p, string name) => { using (currentTenant.Change(Guid.NewGuid())) return await checker.IsGrantedAsync(p, name); };

        (await inTenant(host, UsersUpdate)).ShouldBeTrue();
        (await inTenant(host, AbpAdminPermissions.AuditLogs.Default)).ShouldBeFalse(); // nothing beyond users

        var tenantUser = Principal(new Claim(AbpClaimTypes.UserId, Guid.NewGuid().ToString()), new Claim(AbpClaimTypes.TenantId, Guid.NewGuid().ToString()));
        (await inTenant(tenantUser, UsersUpdate)).ShouldBeFalse();
    }

    private static ClaimsPrincipal Principal(params Claim[] claims) => new(new ClaimsIdentity(claims, "test"));
}
