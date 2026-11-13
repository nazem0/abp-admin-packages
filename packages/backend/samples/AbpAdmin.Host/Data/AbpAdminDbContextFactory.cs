using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AbpAdmin.Host.Data;

public class AbpAdminDbContextFactory : IDesignTimeDbContextFactory<AbpAdminDbContext>
{
    public AbpAdminDbContext CreateDbContext(string[] args)
    {
        AbpAdminGlobalFeatureConfigurator.Configure();
        AbpAdminModuleExtensionConfigurator.Configure();

        AbpAdminEfCoreEntityExtensionMappings.Configure();
        var configuration = BuildConfiguration();

        var builder = new DbContextOptionsBuilder<AbpAdminDbContext>()
            .UseSqlServer(configuration.GetConnectionString("Default"));

        return new AbpAdminDbContext(builder.Options);
    }

    private static IConfigurationRoot BuildConfiguration()
    {
        var builder = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false)
            .AddEnvironmentVariables();

        return builder.Build();
    }
}