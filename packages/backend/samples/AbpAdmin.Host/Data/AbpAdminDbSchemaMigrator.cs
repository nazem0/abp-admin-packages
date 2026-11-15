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
        // EnsureCreated skips an existing file, so the model's schema hash is kept in PRAGMA user_version and a
        // database from an older model is recreated (demo data is re-seeded, not migrated).
        if (database.IsSqlite())
        {
            var hash = BitConverter.ToInt32(System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(database.GenerateCreateScript())), 0) & int.MaxValue;
            var current = database.CanConnect()
                ? await database.SqlQueryRaw<int>("SELECT user_version AS Value FROM pragma_user_version").SingleAsync()
                : -1;
            if (current != hash)
            {
                await database.EnsureDeletedAsync();
                await database.EnsureCreatedAsync();
                await database.ExecuteSqlRawAsync($"PRAGMA user_version = {hash}");
            }
        }
        else
        {
            await database.MigrateAsync();
        }

    }
}
