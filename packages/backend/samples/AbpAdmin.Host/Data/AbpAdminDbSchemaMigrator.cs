using Volo.Abp.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace AbpAdmin.Host.Data;

public class AbpAdminDbSchemaMigrator : ITransientDependency
{
    private readonly IServiceProvider _serviceProvider;

    public AbpAdminDbSchemaMigrator(
        IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task MigrateAsync()
    {
        
        /* We intentionally resolving the AbpAdminDbContext
         * from IServiceProvider (instead of directly injecting it)
         * to properly get the connection string of the current tenant in the
         * current scope.
         */

        var database = _serviceProvider.GetRequiredService<AbpAdminDbContext>().Database;

        // The migrations are SQL Server's; a SQLite demo database is created straight from the model.
        if (database.IsSqlite())
        {
            await database.EnsureCreatedAsync();
        }
        else
        {
            await database.MigrateAsync();
        }

    }
}
