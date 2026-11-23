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
        // EnsureCreated skips a database that has tables, so the model's schema hash is kept in PRAGMA user_version and
        // a database from an older model is rebuilt (demo data is re-seeded, not migrated).
        if (database.IsSqlite())
        {
            var hash = BitConverter.ToInt32(System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(database.GenerateCreateScript())), 0) & int.MaxValue;
            var current = database.CanConnect()
                ? await database.SqlQueryRaw<int>("SELECT user_version AS Value FROM pragma_user_version").SingleAsync()
                : -1;
            if (current != hash)
            {
                // Drop the tables in place rather than deleting the file: on a server the file can still be open
                // (startup work that already used the old database, or the previous worker process), and the delete
                // then fails with "being used by another process".
                await database.OpenConnectionAsync(); // one connection, so the foreign_keys pragma applies to the drops
                try
                {
                    await database.ExecuteSqlRawAsync("PRAGMA foreign_keys = OFF");
                    var tables = await database.SqlQueryRaw<string>(
                        "SELECT name AS Value FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").ToListAsync();
                    foreach (var table in tables)
                        await database.ExecuteSqlRawAsync($"DROP TABLE IF EXISTS \"{table.Replace("\"", "\"\"")}\"");
                    await database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON");
                }
                finally
                {
                    await database.CloseConnectionAsync();
                }
                await database.EnsureCreatedAsync(); // creates the schema: the database now has no tables
                await database.ExecuteSqlRawAsync($"PRAGMA user_version = {hash}");
            }
        }
        else
        {
            await database.MigrateAsync();
        }

    }
}
