using AbpAdmin.Services.Tenants;
using Microsoft.Extensions.Options;
using Shouldly;
using System.Threading.Tasks;
using Volo.Abp.MultiTenancy;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class TenantServiceTests : AbpAdminTestBase
{
    [Fact]
    public async Task Disabled_Tenant_Is_Inactive_For_Tenant_Resolution()
    {
        var service = GetRequiredService<TenantAppService>();
        var store = GetRequiredService<ITenantStore>();
        var tenant = await service.CreateAsync(new CreateTenantDto { Name = "contoso", AdminEmailAddress = "admin@contoso.test", AdminPassword = "1q2w3E*" });
        (await store.FindAsync("CONTOSO"))!.IsActive.ShouldBeTrue();

        await service.DeactivateAsync(tenant.Id);
        (await service.GetAsync(tenant.Id)).IsActive.ShouldBeFalse();
        (await store.FindAsync(tenant.Id))!.IsActive.ShouldBeFalse();

        await service.ActivateAsync(tenant.Id);
        (await store.FindAsync(tenant.Id))!.IsActive.ShouldBeTrue();
    }

    [Fact]
    public async Task Multi_Tenancy_Switch_Updates_Options()
    {
        var service = GetRequiredService<TenantAppService>();
        var options = GetRequiredService<IOptions<AbpMultiTenancyOptions>>().Value;
        var initial = options.IsEnabled;

        await service.UpdateMultiTenancyAsync(new MultiTenancyDto { IsEnabled = !initial });
        options.IsEnabled.ShouldBe(!initial);
        (await service.GetMultiTenancyAsync()).IsEnabled.ShouldBe(!initial);

        await service.UpdateMultiTenancyAsync(new MultiTenancyDto { IsEnabled = initial });
        options.IsEnabled.ShouldBe(initial);
    }
}
