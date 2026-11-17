using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using AbpAdmin.Services.Entities;
using Shouldly;
using Volo.Abp.MultiTenancy;
using Volo.Abp.TenantManagement;
using Volo.Abp.Validation;
using Xunit;

namespace AbpAdmin.Admin;

/// <summary>The sample's own entities: Author has no parameterless constructor, Book has protected setters and a FK.</summary>
[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class EntityExplorerLibraryTests : AbpAdminTestBase
{
    private EntityExplorerAppService Service => GetRequiredService<EntityExplorerAppService>();

    private static EntityValuesDto Values(object values) => new()
    {
        Values = JsonSerializer.SerializeToElement(values).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone()),
    };

    [Fact]
    public async Task Book_Schema_Has_Lookup_And_Enum()
    {
        var schema = await Service.GetSchemaAsync("Book");
        schema.DisplayField.ShouldBe("Title");
        var author = schema.Fields.Single(f => f.Name == "AuthorId");
        author.Reference.ShouldNotBeNull();
        author.Reference.Entity.ShouldBe("Author");
        author.Reference.KeyField.ShouldBe("Id");
        author.Reference.DisplayField.ShouldBe("Name");
        schema.Fields.Single(f => f.Name == "Genre").EnumValues!.Select(v => v.Name).ShouldContain("Poetry");
        schema.Fields.Single(f => f.Name == "Price").Type.ShouldBe("number");

        // Key, declared order, TenantId/ExtraProperties, then ABP's audit fields.
        var names = schema.Fields.Select(f => f.Name).ToList();
        names.Take(9).ShouldBe(["Id", "AuthorId", "Title", "Genre", "Price", "PublishDate", "InStock", "TenantId", "ExtraProperties"]);
        names.Skip(9).ShouldBe(["CreationTime", "CreatorId", "LastModificationTime", "LastModifierId", "IsDeleted", "DeleterId", "DeletionTime", "ConcurrencyStamp"]);
    }

    [Fact]
    public async Task Creates_Entity_Without_Parameterless_Constructor()
    {
        var author = await Service.CreateAsync("Author", Values(new { Name = "Explorer Author", Country = "Jordan", BirthDate = "1990-05-01T00:00:00Z" }));
        Guid.Parse(author["Id"]!.ToString()!).ShouldNotBe(Guid.Empty);
        author["Name"].ShouldBe("Explorer Author");

        var book = await Service.CreateAsync("Book", Values(new { AuthorId = author["Id"], Title = "Explorer Book", Genre = "Poetry", Price = 7.5, PublishDate = "2026-01-01T00:00:00Z", InStock = true }));
        book["AuthorId"].ShouldBe(author["Id"]);
        book["Price"].ShouldBe(7.5m);

        // The constructor's own checks (Check.NotNullOrWhiteSpace) come back as validation errors.
        (await Should.ThrowAsync<AbpValidationException>(() => Service.CreateAsync("Author", Values(new { Country = "Nowhere" }))))
            .ValidationErrors.SelectMany(e => e.MemberNames).ShouldContain("name");
    }

    [Fact]
    public async Task Tenants_See_Only_Their_Library()
    {
        var acme = await WithUnitOfWorkAsync(async () => (await GetRequiredService<ITenantRepository>().FindByNameAsync("ACME"))!.Id);
        using (GetRequiredService<ICurrentTenant>().Change(acme))
        {
            var titles = (await Service.GetListAsync("Book", new GetEntityRowsInput { MaxResultCount = 100 })).Items.Select(r => (string)r["Title"]!).ToList();
            titles.ShouldContain("Cosmos");
            titles.ShouldNotContain("Palace Walk"); // the host's
            titles.ShouldNotContain("Orientalism");     // globex's
        }

        // The host sees every tenant's rows.
        var all = (await Service.GetListAsync("Book", new GetEntityRowsInput { MaxResultCount = 100 })).Items.Select(r => (string)r["Title"]!).ToList();
        all.ShouldContain("Cosmos");
        all.ShouldContain("Palace Walk");
    }
}
