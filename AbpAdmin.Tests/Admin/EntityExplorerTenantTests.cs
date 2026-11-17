using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using AbpAdmin.Services.Entities;
using Shouldly;
using Volo.Abp.Authorization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.MultiTenancy;
using Xunit;

namespace AbpAdmin.Admin;

/// <summary>A tenant admin sees and writes only their own tenant's rows, and never the shared (host-only) entities.</summary>
[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class EntityExplorerTenantTests : AbpAdminTestBase
{
    private EntityExplorerAppService Service => GetRequiredService<EntityExplorerAppService>();
    private ICurrentTenant CurrentTenant => GetRequiredService<ICurrentTenant>();

    private static EntityValuesDto Values(object values) => new()
    {
        Values = JsonSerializer.SerializeToElement(values).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone()),
    };

    [Fact]
    public async Task Tenant_Sees_Only_Its_Own_Rows()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid();
        // The host may target any tenant.
        await Service.CreateAsync("OrganizationUnit", Values(new { Code = "91001", DisplayName = "ou-a", TenantId = a }));
        await Service.CreateAsync("OrganizationUnit", Values(new { Code = "91002", DisplayName = "ou-b", TenantId = b }));
        var bId = (await Service.GetListAsync("OrganizationUnit", new GetEntityRowsInput { Filter = "ou-b" })).Items.Single()["Id"]!.ToString()!;

        using (CurrentTenant.Change(a))
        {
            var rows = (await Service.GetListAsync("OrganizationUnit", new GetEntityRowsInput { MaxResultCount = 100 })).Items;
            rows.Select(r => r["DisplayName"]).ShouldBe(["ou-a"]);
            await Should.ThrowAsync<Volo.Abp.Domain.Entities.EntityNotFoundException>(() => Service.GetAsync("OrganizationUnit", bId));
            await Should.ThrowAsync<Volo.Abp.Domain.Entities.EntityNotFoundException>(() =>
                Service.UpdateAsync("OrganizationUnit", bId, Values(new { DisplayName = "hijacked" })));
        }
    }

    [Fact]
    public async Task Tenant_Cannot_Set_TenantId()
    {
        Guid a = Guid.NewGuid(), b = Guid.NewGuid();
        using (CurrentTenant.Change(a))
        {
            (await Service.GetSchemaAsync("OrganizationUnit")).Fields.Single(f => f.Name == "TenantId").ReadOnly.ShouldBeTrue();

            var created = await Service.CreateAsync("OrganizationUnit", Values(new { Code = "92001", DisplayName = "mine", TenantId = b }));
            created["TenantId"].ShouldBe(a);

            var id = created["Id"]!.ToString()!;
            var updated = await Service.UpdateAsync("OrganizationUnit", id, Values(new { TenantId = b, DisplayName = "still mine" }));
            updated["TenantId"].ShouldBe(a);
            updated["DisplayName"].ShouldBe("still mine");
        }
    }

    [Fact]
    public async Task Shared_Entities_Are_Host_Only()
    {
        var permissions = GetRequiredService<IPermissionDefinitionManager>();
        (await permissions.GetAsync("AbpAdmin.Entities.Tenant")).MultiTenancySide.ShouldBe(MultiTenancySides.Host);
        (await permissions.GetAsync("AbpAdmin.Entities.Tenant.Update")).MultiTenancySide.ShouldBe(MultiTenancySides.Host);
        (await permissions.GetAsync("AbpAdmin.Entities.IdentityUser")).MultiTenancySide.ShouldBe(MultiTenancySides.Both);

        (await Service.GetEntitiesAsync()).Select(e => e.Name).ShouldContain("Tenant");
        using (CurrentTenant.Change(Guid.NewGuid()))
        {
            var names = (await Service.GetEntitiesAsync()).Select(e => e.Name).ToList();
            names.ShouldContain("IdentityUser");
            names.ShouldNotContain("Tenant");
            names.ShouldNotContain("OpenIddictApplication");
            names.ShouldNotContain("Setting");

            await Should.ThrowAsync<AbpAuthorizationException>(() => Service.GetListAsync("Tenant", new GetEntityRowsInput()));
            await Should.ThrowAsync<AbpAuthorizationException>(() => Service.CreateAsync("OpenIddictApplication", Values(new { ClientId = "x" })));
        }
    }
}
