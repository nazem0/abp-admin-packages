using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore.Sqlite;
using Abp_Administration.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Volo.Abp;
using Volo.Abp.AspNetCore.TestBase;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Data;
using Volo.Abp.FeatureManagement;
using Volo.Abp.Modularity;
using Volo.Abp.OpenIddict;
using Volo.Abp.PermissionManagement;
using Volo.Abp.Threading;
using Volo.Abp.UI.Navigation;
using Volo.Abp.Uow;

namespace Abp_Administration;

[DependsOn(
    typeof(AbpTestBaseModule),
    typeof(AbpAspNetCoreTestBaseModule),
    typeof(AbpEntityFrameworkCoreSqliteModule),
    typeof(Abp_AdministrationModule)
)]
public class Abp_AdministrationTestModule : AbpModule
{
    public override void PreConfigureServices(ServiceConfigurationContext context)
    {
        var builder = new ConfigurationBuilder();
        builder.AddJsonFile("appsettings.json", false);
        builder.AddJsonFile("appsettings.secrets.json", true);
        context.Services.ReplaceConfiguration(builder.Build());

        context.Services.PreConfigure<IMvcBuilder>(builder =>
        {
            builder.PartManager.ApplicationParts.Add(new CompiledRazorAssemblyPart(typeof(Abp_AdministrationModule).Assembly));
        });

        context.Services.GetPreConfigureActions<OpenIddictServerBuilder>().Clear();
        PreConfigure<AbpOpenIddictAspNetCoreOptions>(options =>
        {
            options.AddDevelopmentEncryptionAndSigningCertificate = true;
        });
        PreConfigure<AbpSqliteOptions>(x => x.BusyTimeout = null);
    }

    public override void ConfigureServices(ServiceConfigurationContext context)
    {

        Configure<AbpBackgroundJobOptions>(options =>
        {
            options.IsJobExecutionEnabled = false;
        });

        context.Services.AddAlwaysAllowAuthorization();
        context.Services.AddAlwaysDisableUnitOfWorkTransaction();

        Configure<FeatureManagementOptions>(options =>
        {
            options.SaveStaticFeaturesToDatabase = false;
            options.IsDynamicFeatureStoreEnabled = false;
        });
        Configure<PermissionManagementOptions>(options =>
        {
            options.SaveStaticPermissionsToDatabase = false;
            options.IsDynamicPermissionStoreEnabled = false;
        });


        ConfigureInMemorySqlite(context.Services);
    }
    
    private AbpUnitTestSqliteDatabase? _database;

    private void ConfigureInMemorySqlite(IServiceCollection services)
    {
        _database = new AbpUnitTestSqliteDatabase();
        _database.CreateTables(
            new Abp_AdministrationDbContext(new DbContextOptionsBuilder<Abp_AdministrationDbContext>().UseSqlite(_database.ConnectionString).Options));

        services.Configure<AbpDbConnectionOptions>(options =>
        {
            options.ConnectionStrings.Default = _database.ConnectionString;
        });

        services.Configure<AbpDbContextOptions>(options =>
        {
            options.Configure(context =>
            {
                context.UseSqlite();
            });
        });
    }

    public override void OnApplicationShutdown(ApplicationShutdownContext context)
    {
        _database?.Dispose();
    }
    public override void OnApplicationInitialization(ApplicationInitializationContext context)
    {
        SeedTestData(context);
    }

    private static void SeedTestData(ApplicationInitializationContext context)
    {
        AsyncHelper.RunSync(async () =>
        {
            using (var scope = context.ServiceProvider.CreateScope())
            {
                await scope.ServiceProvider
                    .GetRequiredService<IDataSeeder>()
                    .SeedAsync();
            }
        });
    }
}
