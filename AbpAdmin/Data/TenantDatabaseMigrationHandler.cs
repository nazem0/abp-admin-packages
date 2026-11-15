using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.EventBus.Distributed;
using Volo.Abp.Identity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.TenantManagement;
using Volo.Abp.Uow;

namespace AbpAdmin.Data;

/// <summary>
/// Sets up a tenant's database when it's created or gets a new connection string: migrates it (own database only;
/// the shared one is migrated with the host) and seeds it, which creates the tenant's admin user and its permissions.
/// </summary>
public class TenantDatabaseMigrationHandler(
    AbpAdminDbSchemaMigrator migrator,
    IDataSeeder dataSeeder,
    ICurrentTenant currentTenant,
    ITenantStore tenantStore,
    IUnitOfWorkManager unitOfWorkManager)
    : IDistributedEventHandler<TenantCreatedEto>, IDistributedEventHandler<TenantConnectionStringUpdatedEto>, ITransientDependency
{
    public Task HandleEventAsync(TenantCreatedEto eventData) => SetUpAsync(eventData.Id, eventData.Properties);

    public Task HandleEventAsync(TenantConnectionStringUpdatedEto eventData) =>
        eventData.ConnectionStringName == ConnectionStrings.DefaultConnectionStringName && !eventData.NewValue.IsNullOrEmpty()
            ? SetUpAsync(eventData.Id, eventData.Properties)
            : Task.CompletedTask;

    private async Task SetUpAsync(Guid tenantId, Dictionary<string, string> properties)
    {
        using (currentTenant.Change(tenantId))
        {
            var connectionString = (await tenantStore.FindAsync(tenantId))?.ConnectionStrings?.Default;
            if (!connectionString.IsNullOrEmpty())
            {
                using var uow = unitOfWorkManager.Begin(requiresNew: true, isTransactional: false);
                await migrator.MigrateAsync(); // creates the database if it doesn't exist
                await uow.CompleteAsync();
            }

            using (var uow = unitOfWorkManager.Begin(requiresNew: true, isTransactional: true))
            {
                await dataSeeder.SeedAsync(new DataSeedContext(tenantId)
                    .WithProperty(IdentityDataSeedContributor.AdminEmailPropertyName,
                        properties.GetValueOrDefault("AdminEmail") ?? AbpAdminConsts.AdminEmailDefaultValue)
                    .WithProperty(IdentityDataSeedContributor.AdminPasswordPropertyName,
                        properties.GetValueOrDefault("AdminPassword") ?? AbpAdminConsts.AdminPasswordDefaultValue));
                await uow.CompleteAsync();
            }
        }
    }
}
