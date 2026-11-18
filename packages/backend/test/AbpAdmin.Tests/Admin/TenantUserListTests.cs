using System.Threading.Tasks;
using AbpAdmin.Services.Tenants;
using Shouldly;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class TenantUserListTests : AbpAdminTestBase
{
    [Fact]
    public async Task Users_Of_Deleted_Tenants_Are_Not_Listed()
    {
        var tenants = GetRequiredService<TenantAppService>();
        var list = GetRequiredService<TenantUserAppService>();
        var gone = await tenants.CreateAsync(new CreateTenantDto { Name = "gone-tenant", AdminEmailAddress = "admin@gone.test", AdminPassword = "1q2w3E*" });
        (await list.GetListAsync(new GetTenantUserListInput { MaxResultCount = 1000 })).TenantNames.ShouldContainKey(gone.Id);

        await tenants.DeleteAsync(gone.Id);
        var all = await list.GetListAsync(new GetTenantUserListInput { MaxResultCount = 1000 });
        all.Items.ShouldNotContain(u => u.TenantId == gone.Id);
        all.TenantNames.ShouldNotContainKey(gone.Id);
        all.TotalCount.ShouldBe(all.Items.Count);
        (await list.GetListAsync(new GetTenantUserListInput { TenantId = gone.Id })).TotalCount.ShouldBe(0);
    }
}
