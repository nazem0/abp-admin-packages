using System.Linq;
using AbpAdmin.Services.Entities;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using Volo.Abp.Identity;
using Xunit;

namespace AbpAdmin.Admin;

public class EntityExplorerOptionsTests
{
    private class NotAnEntity { public int Id { get; set; } }

    private class SampleDbContext(DbContextOptions<SampleDbContext> options) : DbContext(options)
    {
        public DbSet<IdentityUser> Users { get; set; } = null!;
        public DbSet<IdentityRole> Roles { get; set; } = null!;
        public DbSet<OrganizationUnit> OrganizationUnits { get; set; } = null!;
        public DbSet<NotAnEntity> Others { get; set; } = null!;
    }

    [Fact]
    public void AddAllFrom_Takes_Every_Entity_DbSet()
    {
        var options = new EntityExplorerOptions().AddAllFrom<SampleDbContext>();
        options.Entities.Keys.Order().ShouldBe(["IdentityRole", "IdentityUser", "OrganizationUnit"]);
        options.Entities["IdentityUser"].EntityType.ShouldBe(typeof(IdentityUser));
    }

    [Fact]
    public void AddAllFrom_Skips_Excepted_Types_And_Add_Still_Overrides()
    {
        var options = new EntityExplorerOptions()
            .AddAllFrom<SampleDbContext>(typeof(IdentityRole), typeof(OrganizationUnit))
            .Add<IdentityUser>("Email");
        options.Entities.Keys.ShouldBe(["IdentityUser"]);
        options.Entities["identityuser"].HiddenProperties.ShouldContain("email");
    }
}
