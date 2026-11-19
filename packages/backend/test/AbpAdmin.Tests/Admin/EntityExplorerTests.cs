using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using AbpAdmin.Services.Entities;
using Shouldly;
using Volo.Abp;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.OpenIddict.Scopes;
using Volo.Abp.TenantManagement;
using Volo.Abp.Validation;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class EntityExplorerTests : AbpAdminTestBase
{
    private EntityExplorerAppService Service => GetRequiredService<EntityExplorerAppService>();

    private static EntityValuesDto Values(object values) => new()
    {
        Values = JsonSerializer.SerializeToElement(values).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone()),
    };

    /// <summary>Registered but unresolvable: no DbSet, so no IRepository and not in the EF model.</summary>
    public class OrphanEntity : Entity<Guid>
    {
    }

    [Fact]
    public async Task A_Misconfigured_Entity_Is_Left_Out_Of_The_List_Instead_Of_Breaking_It()
    {
        var options = GetRequiredService<Microsoft.Extensions.Options.IOptions<EntityExplorerOptions>>().Value;
        options.Add<OrphanEntity>();
        try
        {
            var names = (await Service.GetEntitiesAsync()).Select(e => e.Name).ToList();
            names.ShouldContain("IdentityUser");
            names.ShouldNotContain(nameof(OrphanEntity));
            await Should.ThrowAsync<AbpException>(() => Service.GetSchemaAsync(nameof(OrphanEntity)));
        }
        finally
        {
            options.Entities.Remove(nameof(OrphanEntity));
        }
    }

    [Fact]
    public async Task Lists_Only_Configured_Entities_And_Hides_Secrets()
    {
        var entities = await Service.GetEntitiesAsync();
        entities.Select(e => e.Name).ShouldContain("IdentityUser");
        entities.Select(e => e.Name).ShouldNotContain("IdentityUserLogin");

        var schema = await Service.GetSchemaAsync("IdentityUser");
        schema.KeyFields.ShouldBe(["Id"]);
        schema.DisplayField.ShouldBe("UserName");
        schema.Fields.Select(f => f.Name).ShouldNotContain("PasswordHash");
        schema.Fields.First(f => f.Name == "UserName").ShouldSatisfyAllConditions(
            f => f.Type.ShouldBe("string"), f => f.Required.ShouldBeTrue(), f => f.MaxLength.ShouldNotBeNull());
        schema.Fields.First(f => f.Name == "CreationTime").ReadOnly.ShouldBeTrue();

        await Should.ThrowAsync<EntityNotFoundException>(() => Service.GetSchemaAsync("IdentityUserLogin"));
    }

    [Fact]
    public async Task Crud_Writes_Private_Setters_Through_Abp()
    {
        // Tenant: protected constructor, protected setters, soft delete, concurrency stamp.
        var created = await Service.CreateAsync("Tenant", Values(new { Name = "explorer", NormalizedName = "EXPLORER" }));
        var id = created["Id"]!.ToString()!;
        Guid.Parse(id).ShouldNotBe(Guid.Empty);
        created["Name"].ShouldBe("explorer");
        created["CreationTime"].ShouldNotBeNull();

        var page = await Service.GetListAsync("Tenant", new GetEntityRowsInput { Filter = "xplor", MaxResultCount = 10 });
        page.Items.ShouldContain(r => r["Id"]!.ToString() == id);
        (await Service.GetListAsync("Tenant", new GetEntityRowsInput { Filter = id })).TotalCount.ShouldBe(1);

        var updated = await Service.UpdateAsync("Tenant", id, Values(new { Name = "explorer2", ConcurrencyStamp = (string)created["ConcurrencyStamp"]! }));
        updated["Name"].ShouldBe("explorer2");
        updated["ConcurrencyStamp"].ShouldNotBe(created["ConcurrencyStamp"]);

        await Service.DeleteAsync("Tenant", id);
        await Should.ThrowAsync<EntityNotFoundException>(() => Service.GetAsync("Tenant", id));
        await WithUnitOfWorkAsync(async () =>
        {
            using (GetRequiredService<IDataFilter>().Disable<ISoftDelete>())
            {
                (await GetRequiredService<IRepository<Tenant, Guid>>().GetAsync(Guid.Parse(id))).IsDeleted.ShouldBeTrue();
            }
        });
    }

    [Fact]
    public async Task Validates_Against_The_Schema()
    {
        var error = await Should.ThrowAsync<AbpValidationException>(() =>
            Service.CreateAsync("Tenant", Values(new { Name = new string('x', 500), Nope = 1, ActivationState = "Bogus" })));
        error.ValidationErrors.SelectMany(e => e.MemberNames).ShouldBe(["Name", "Nope", "ActivationState"], ignoreOrder: true);

        // NormalizedName is required and nothing set it.
        (await Should.ThrowAsync<AbpValidationException>(() => Service.CreateAsync("Tenant", Values(new { Name = "noname" }))))
            .ValidationErrors.SelectMany(e => e.MemberNames).ShouldBe(["NormalizedName"]);

        await Should.ThrowAsync<AbpValidationException>(() =>
            Service.GetListAsync("Tenant", new GetEntityRowsInput { Sorting = "Name; drop table" }));
    }

    [Fact]
    public async Task Handler_Takes_Over_Writes()
    {
        var created = await Service.CreateAsync("OpenIddictScope", Values(new { Name = "explorer_scope" }));
        created["DisplayName"].ShouldBe("by handler");
    }
}

/// <summary>Proves a registered handler replaces the generic write path.</summary>
[ExposeServices(typeof(IEntityExplorerHandler<OpenIddictScope>))]
public class TestScopeHandler(IRepository<OpenIddictScope, Guid> repository) : IEntityExplorerHandler<OpenIddictScope>, ITransientDependency
{
    public async Task<OpenIddictScope> CreateAsync(IReadOnlyDictionary<string, object?> values)
        => await repository.InsertAsync(new OpenIddictScope(Guid.NewGuid()) { Name = (string)values["Name"]!, DisplayName = "by handler" }, autoSave: true);

    public Task UpdateAsync(OpenIddictScope entity, IReadOnlyDictionary<string, object?> values) => Task.CompletedTask;

    public Task DeleteAsync(OpenIddictScope entity) => repository.DeleteAsync(entity);
}
