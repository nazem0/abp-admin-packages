using AbpAdmin.Permissions;
using AbpAdmin.Services.Tenants;
using Microsoft.AspNetCore.Identity;
using AbpAdmin.Host.Entities;
using Volo.Abp.Data;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Guids;
using Volo.Abp.Identity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.PermissionManagement;
using Volo.Abp.SettingManagement;
using Volo.Abp.TenantManagement;
using Volo.Abp.Uow;
using IdentityRole = Volo.Abp.Identity.IdentityRole;
using IdentityUser = Volo.Abp.Identity.IdentityUser;

namespace AbpAdmin.Host.Data;

/// <summary>
/// Sample data for trying ABP Admin: host roles and users, and two tenants with their own admin, roles and users.
/// Only adds what's missing, so it's safe on every start. Every password is <see cref="AbpAdminConsts.AdminPasswordDefaultValue"/>.
/// </summary>
public class DemoDataSeedContributor(
    IDataSeeder dataSeeder,
    ICurrentTenant currentTenant,
    ITenantRepository tenants,
    ITenantManager tenantManager,
    IdentityUserManager users,
    IdentityRoleManager roles,
    IPermissionManager permissions,
    ISettingManager settings,
    MultiTenancySwitch multiTenancy,
    IGuidGenerator guids,
    IRepository<Author, Guid> authors,
    IRepository<Book, Guid> books)
    : IDataSeedContributor, ITransientDependency
{
    private const string Password = AbpAdminConsts.AdminPasswordDefaultValue;

    // Role → permissions; users → (user name, display name, role, active).
    private static readonly (string Role, string[] Permissions)[] Roles =
    [
        ("support", ["AbpIdentity.Users", "AbpIdentity.Users.Update", AbpAdminPermissions.SecurityLogs.Default]),
        ("auditor", [AbpAdminPermissions.AuditLogs.Default, AbpAdminPermissions.SecurityLogs.Default]),
    ];

    private static readonly (string Tenant, (string User, string Name, string Surname, string Role, bool Active)[] Users)[] Data =
    [
        ("", [("sara", "Sara", "Haddad", "support", true), ("omar", "Omar", "Saleh", "auditor", true)]),
        ("acme", [("lina", "Lina", "Nasser", "support", true), ("khaled", "Khaled", "Fares", "auditor", true), ("noor", "Noor", "Aziz", "", false)]),
        ("globex", [("hana", "Hana", "Yousef", "support", true), ("ziad", "Ziad", "Kamal", "", true)]),
    ];

    // Tenant → authors (name, country, birth year) with their books (title, genre, price, year).
    private static readonly Dictionary<string, (string Name, string Country, int Born, (string Title, BookGenre Genre, decimal Price, int Year)[] Books)[]> Library = new()
    {
        [""] =
        [
            ("Naguib Mahfouz", "Egypt", 1911, [("Palace Walk", BookGenre.Fiction, 14.5m, 1956), ("Children of the Alley", BookGenre.Fiction, 12m, 1959)]),
            ("Mahmoud Darwish", "Palestine", 1941, [("Unfortunately, It Was Paradise", BookGenre.Poetry, 11m, 2003)]),
            ("Ibn Khaldun", "Tunisia", 1332, [("The Muqaddimah", BookGenre.History, 22m, 1377)]),
        ],
        ["acme"] =
        [
            ("Carl Sagan", "United States", 1934, [("Cosmos", BookGenre.Science, 18m, 1980), ("Pale Blue Dot", BookGenre.Science, 16.75m, 1994)]),
            ("Mary Shelley", "United Kingdom", 1797, [("Frankenstein", BookGenre.Fiction, 9.99m, 1818)]),
        ],
        ["globex"] =
        [
            ("Edward Said", "Palestine", 1935, [("Orientalism", BookGenre.NonFiction, 18m, 1978)]),
        ],
    };

    [UnitOfWork]
    public virtual async Task SeedAsync(DataSeedContext context)
    {
        if (context.TenantId != null) return; // runs once, from the host seed

        // Multi-tenancy on, unless someone already switched it on or off from the Tenants page.
        if (await settings.GetOrNullGlobalAsync(MultiTenancySwitch.SettingName) == null)
        {
            await settings.SetGlobalAsync(MultiTenancySwitch.SettingName, "true");
            multiTenancy.Apply(true);
        }

        foreach (var (tenantName, people) in Data)
        {
            Guid? tenantId = null;
            if (tenantName != "")
            {
                var tenant = await tenants.FindByNameAsync(tenantName.ToUpperInvariant());
                if (tenant == null)
                {
                    tenant = await tenants.InsertAsync(await tenantManager.CreateAsync(tenantName), autoSave: true);
                    // The tenant's admin user (admin@acme.demo) and its permissions, like creating it from the Tenants page.
                    await dataSeeder.SeedAsync(new DataSeedContext(tenant.Id)
                        .WithProperty(IdentityDataSeedContributor.AdminEmailPropertyName, $"admin@{tenantName}.demo")
                        .WithProperty(IdentityDataSeedContributor.AdminPasswordPropertyName, Password));
                }
                tenantId = tenant.Id;
            }

            using (currentTenant.Change(tenantId))
            {
                foreach (var (role, granted) in Roles)
                {
                    if (await roles.FindByNameAsync(role) != null) continue;
                    Check(await roles.CreateAsync(new IdentityRole(guids.Create(), role, tenantId)));
                    foreach (var p in granted) await permissions.SetForRoleAsync(role, p, true);
                }

                var domain = tenantName == "" ? "host" : tenantName;
                foreach (var (userName, name, surname, role, active) in people)
                {
                    if (await users.FindByNameAsync(userName) != null) continue;
                    var user = new IdentityUser(guids.Create(), userName, $"{userName}@{domain}.demo", tenantId) { Name = name, Surname = surname };
                    user.SetIsActive(active);
                    Check(await users.CreateAsync(user, Password));
                    if (role != "") Check(await users.AddToRoleAsync(user, role));
                }

                if (!await authors.AnyAsync())
                {
                    foreach (var (name, country, born, written) in Library[tenantName])
                    {
                        var author = await authors.InsertAsync(new Author(guids.Create(), name, country, new DateTime(born, 1, 1, 0, 0, 0, DateTimeKind.Utc), tenantId));
                        foreach (var (title, genre, price, year) in written)
                        {
                            await books.InsertAsync(new Book(guids.Create(), author.Id, title, genre, price, new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc), year > 1900, tenantId));
                        }
                    }
                }
            }
        }
    }

    private static void Check(IdentityResult result)
    {
        if (!result.Succeeded) throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
    }
}
