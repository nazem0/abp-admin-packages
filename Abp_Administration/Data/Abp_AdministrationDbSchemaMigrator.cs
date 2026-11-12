using Volo.Abp.DependencyInjection;
using Microsoft.EntityFrameworkCore;

namespace Abp_Administration.Data;

public class Abp_AdministrationDbSchemaMigrator : ITransientDependency
{
    private readonly IServiceProvider _serviceProvider;

    public Abp_AdministrationDbSchemaMigrator(
        IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task MigrateAsync()
    {
        
        /* We intentionally resolving the Abp_AdministrationDbContext
         * from IServiceProvider (instead of directly injecting it)
         * to properly get the connection string of the current tenant in the
         * current scope.
         */

        await _serviceProvider
            .GetRequiredService<Abp_AdministrationDbContext>()
            .Database
            .MigrateAsync();

    }
}
