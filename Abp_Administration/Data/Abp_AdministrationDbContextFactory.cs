using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Abp_Administration.Data;

public class Abp_AdministrationDbContextFactory : IDesignTimeDbContextFactory<Abp_AdministrationDbContext>
{
    public Abp_AdministrationDbContext CreateDbContext(string[] args)
    {
        Abp_AdministrationGlobalFeatureConfigurator.Configure();
        Abp_AdministrationModuleExtensionConfigurator.Configure();

        Abp_AdministrationEfCoreEntityExtensionMappings.Configure();
        var configuration = BuildConfiguration();

        var builder = new DbContextOptionsBuilder<Abp_AdministrationDbContext>()
            .UseSqlServer(configuration.GetConnectionString("Default"));

        return new Abp_AdministrationDbContext(builder.Options);
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