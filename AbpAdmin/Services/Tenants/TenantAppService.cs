using System.ComponentModel.DataAnnotations;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.EventBus.Distributed;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Identity;
using Volo.Abp.Mapperly;
using Volo.Abp.MultiTenancy;
using Volo.Abp.SettingManagement;
using Volo.Abp.Settings;
using Volo.Abp.TenantManagement;
using Volo.Abp.Uow;
using Volo.Abp.Validation;

namespace AbpAdmin.Services.Tenants;

public class GetTenantListInput : PagedAndSortedResultRequestDto
{
    public string? Filter { get; set; }
}

public class TenantDto : EntityDto<Guid>
{
    public string Name { get; set; } = "";
    /// <summary>False: the tenant can't be resolved, so its users can't sign in or call the API.</summary>
    public bool IsActive { get; set; }
    /// <summary>True when the tenant has its own database (a Default connection string); false: the shared one.</summary>
    public bool HasOwnDatabase { get; set; }
    public DateTime CreationTime { get; set; }
}

public class CreateTenantDto
{
    /// <summary>Own database; empty for the shared one. Needs the ManageConnectionStrings permission.</summary>
    [StringLength(1024)] public string? ConnectionString { get; set; }
    [Required, DynamicStringLength(typeof(TenantConsts), nameof(TenantConsts.MaxNameLength))] public string Name { get; set; } = "";
    [Required, EmailAddress, StringLength(256)] public string AdminEmailAddress { get; set; } = "";
    [Required, StringLength(128)] public string AdminPassword { get; set; } = "";
}

public class UpdateTenantDto
{
    [Required, DynamicStringLength(typeof(TenantConsts), nameof(TenantConsts.MaxNameLength))] public string Name { get; set; } = "";
}

public class TenantConnectionStringDto
{
    /// <summary>Empty: the tenant uses the shared database.</summary>
    [StringLength(1024)] public string? ConnectionString { get; set; }
}

public class UpdateTenantConnectionStringDto : TenantConnectionStringDto
{
    /// <summary>Admin user to create if the database has none yet (a new, empty one); ABP's defaults when empty.</summary>
    [EmailAddress, StringLength(256)] public string? AdminEmailAddress { get; set; }
    [StringLength(128)] public string? AdminPassword { get; set; }
}

public class ConnectionStringCheckDto
{
    public bool Connected { get; set; }
    public bool DatabaseExists { get; set; }
}

public class MultiTenancyDto
{
    public bool IsEnabled { get; set; }
}

/// <summary>
/// Tenants (free TenantManagement module), a per-tenant active flag and the global multi-tenancy switch.
/// Like ABP's own TenantAppService, creating a tenant or changing its connection string publishes
/// <see cref="TenantCreatedEto"/> / <see cref="TenantConnectionStringUpdatedEto"/>; the host migrates the tenant's
/// database (when it has its own) and seeds it, admin user included. Published after commit, so with the default
/// in-process event bus a failed database setup comes back as this request's error.
/// </summary>
[Authorize(AbpAdminPermissions.Tenants.Default)]
public class TenantAppService(ITenantRepository repository, ITenantManager manager, IDistributedEventBus eventBus,
    IConnectionStringChecker connectionChecker, MultiTenancySwitch multiTenancy)
    : AbpAdminAppService
{
    /// <summary>Extra property holding the active flag; missing means active.</summary>
    public const string IsActiveProperty = "IsActive";

    public static bool IsActive(Tenant tenant) => tenant.GetProperty(IsActiveProperty, true);

    public virtual async Task<PagedResultDto<TenantDto>> GetListAsync(GetTenantListInput input)
    {
        var items = await repository.GetListAsync(input.Sorting ?? nameof(Tenant.Name), input.MaxResultCount, input.SkipCount, input.Filter, includeDetails: true);
        return new PagedResultDto<TenantDto>(await repository.GetCountAsync(input.Filter), items.Select(ToDto).ToList());
    }

    public virtual async Task<TenantDto> GetAsync(Guid id) => ToDto(await repository.GetAsync(id));

    [Authorize(AbpAdminPermissions.Tenants.Create)]
    [UnitOfWork(IsDisabled = true)] // the tenant is committed before its database is set up
    public virtual async Task<TenantDto> CreateAsync(CreateTenantDto input)
    {
        var connectionString = input.ConnectionString?.Trim();
        if (!connectionString.IsNullOrEmpty()) await EnsureConnectableAsync(connectionString!);

        Tenant tenant;
        using (var uow = UnitOfWorkManager.Begin(requiresNew: true, isTransactional: true))
        {
            tenant = await manager.CreateAsync(input.Name.Trim());
            if (!connectionString.IsNullOrEmpty()) tenant.SetDefaultConnectionString(connectionString!);
            await repository.InsertAsync(tenant);
            await uow.CompleteAsync();
        }

        var eto = new TenantCreatedEto { Id = tenant.Id, Name = tenant.Name };
        eto.Properties["AdminEmail"] = input.AdminEmailAddress.Trim();
        eto.Properties["AdminPassword"] = input.AdminPassword;
        await SetUpDatabaseAsync(tenant.Name, eto);
        return ToDto(tenant);
    }

    [Authorize(AbpAdminPermissions.Tenants.ManageConnectionStrings)]
    public virtual async Task<TenantConnectionStringDto> GetConnectionStringAsync(Guid id) =>
        new() { ConnectionString = (await repository.GetAsync(id)).FindDefaultConnectionString() };

    /// <summary>Sets the tenant's own database, or clears it (back to the shared one). No data is copied.</summary>
    [Authorize(AbpAdminPermissions.Tenants.ManageConnectionStrings)]
    [UnitOfWork(IsDisabled = true)]
    public virtual async Task<TenantDto> UpdateConnectionStringAsync(Guid id, UpdateTenantConnectionStringDto input)
    {
        var connectionString = input.ConnectionString?.Trim();
        if (!connectionString.IsNullOrEmpty()) await EnsureConnectableAsync(connectionString!);

        Tenant tenant;
        string? old;
        using (var uow = UnitOfWorkManager.Begin(requiresNew: true, isTransactional: true))
        {
            tenant = await repository.GetAsync(id);
            old = tenant.FindDefaultConnectionString();
            if (connectionString.IsNullOrEmpty()) tenant.RemoveDefaultConnectionString();
            else tenant.SetDefaultConnectionString(connectionString!);
            await repository.UpdateAsync(tenant);
            await uow.CompleteAsync();
        }

        if (!connectionString.IsNullOrEmpty())
        {
            var eto = new TenantConnectionStringUpdatedEto
            {
                Id = tenant.Id,
                Name = tenant.Name,
                ConnectionStringName = ConnectionStrings.DefaultConnectionStringName,
                OldValue = old,
                NewValue = connectionString,
            };
            if (!input.AdminEmailAddress.IsNullOrWhiteSpace()) eto.Properties["AdminEmail"] = input.AdminEmailAddress!.Trim();
            if (!input.AdminPassword.IsNullOrEmpty()) eto.Properties["AdminPassword"] = input.AdminPassword!;
            await SetUpDatabaseAsync(tenant.Name, eto);
        }
        return ToDto(tenant);
    }

    /// <summary>Can the server reach this database? Changes nothing.</summary>
    [Authorize(AbpAdminPermissions.Tenants.ManageConnectionStrings)]
    public virtual async Task<ConnectionStringCheckDto> CheckConnectionStringAsync(TenantConnectionStringDto input)
    {
        var result = await connectionChecker.CheckAsync(input.ConnectionString?.Trim() ?? "");
        return new ConnectionStringCheckDto { Connected = result.Connected, DatabaseExists = result.DatabaseExists };
    }

    [Authorize(AbpAdminPermissions.Tenants.Update)]
    public virtual async Task<TenantDto> UpdateAsync(Guid id, UpdateTenantDto input)
    {
        var tenant = await repository.GetAsync(id);
        await manager.ChangeNameAsync(tenant, input.Name.Trim());
        return ToDto(await repository.UpdateAsync(tenant));
    }

    [Authorize(AbpAdminPermissions.Tenants.Delete)]
    public virtual Task DeleteAsync(Guid id) => repository.DeleteAsync(id);

    [Authorize(AbpAdminPermissions.Tenants.Update)]
    public virtual Task<TenantDto> ActivateAsync(Guid id) => SetActiveAsync(id, true);

    [Authorize(AbpAdminPermissions.Tenants.Update)]
    public virtual Task<TenantDto> DeactivateAsync(Guid id) => SetActiveAsync(id, false);

    public virtual Task<MultiTenancyDto> GetMultiTenancyAsync() => Task.FromResult(new MultiTenancyDto { IsEnabled = multiTenancy.IsEnabled });

    [Authorize(AbpAdminPermissions.Tenants.ManageMultiTenancy)]
    public virtual async Task<MultiTenancyDto> UpdateMultiTenancyAsync(MultiTenancyDto input)
    {
        await LazyServiceProvider.LazyGetRequiredService<ISettingManager>()
            .SetGlobalAsync(MultiTenancySwitch.SettingName, input.IsEnabled.ToString());
        multiTenancy.Apply(input.IsEnabled);
        return input;
    }

    private async Task EnsureConnectableAsync(string connectionString)
    {
        await AuthorizationService.CheckAsync(AbpAdminPermissions.Tenants.ManageConnectionStrings);
        if (!(await connectionChecker.CheckAsync(connectionString)).Connected)
            throw new UserFriendlyException("Can't connect to that database server. Check the connection string.");
    }

    private async Task SetUpDatabaseAsync<TEto>(string tenantName, TEto eto) where TEto : class
    {
        // Not through the outbox: the database is set up in this request, so a failure reaches the admin who saved the tenant.
        try { await eventBus.PublishAsync(eto, useOutbox: false); }
        catch (Exception e)
        {
            Logger.LogError(e, "Setting up the database of tenant {Tenant} failed.", tenantName);
            throw new UserFriendlyException($"{tenantName} is saved, but setting up its database failed: {e.Message} Fix the connection string and save it again.");
        }
    }

    private async Task<TenantDto> SetActiveAsync(Guid id, bool active)
    {
        var tenant = await repository.GetAsync(id);
        tenant.SetProperty(IsActiveProperty, active);
        // The tenant store's cache is invalidated by the entity update.
        return ToDto(await repository.UpdateAsync(tenant));
    }

    private static TenantDto ToDto(Tenant t) => new() { Id = t.Id, Name = t.Name, IsActive = IsActive(t), HasOwnDatabase = !t.FindDefaultConnectionString().IsNullOrEmpty(), CreationTime = t.CreationTime };
}

/// <summary>
/// Turns <see cref="AbpMultiTenancyOptions.IsEnabled"/> on and off at runtime (sign-in tenant switch, app configuration).
/// The choice is a global setting, re-applied at startup; without one the host's configured value stays.
/// </summary>
// ponytail: in-process only; with several instances the others pick the change up on restart.
public class MultiTenancySwitch(IOptions<AbpMultiTenancyOptions> options, IOptionsMonitorCache<AbpMultiTenancyOptions> monitorCache)
    : ISingletonDependency
{
    public const string SettingName = "AbpAdmin.MultiTenancy.IsEnabled";

    public bool IsEnabled => options.Value.IsEnabled;

    public void Apply(bool isEnabled)
    {
        options.Value.IsEnabled = isEnabled;
        monitorCache.TryRemove(Options.DefaultName);
    }

    public async Task LoadAsync(IServiceProvider services)
    {
        try
        {
            using var uow = services.GetRequiredService<IUnitOfWorkManager>().Begin();
            if (bool.TryParse(await services.GetRequiredService<ISettingManager>().GetOrNullGlobalAsync(SettingName), out var enabled))
                Apply(enabled);
        }
        catch (Exception e) // e.g. first start, before the database exists
        {
            services.GetRequiredService<ILogger<MultiTenancySwitch>>().LogWarning(e, "Couldn't read {Setting}; keeping the configured multi-tenancy.", SettingName);
        }
    }
}

public class MultiTenancySettingDefinitionProvider : SettingDefinitionProvider
{
    public override void Define(ISettingDefinitionContext context) => context.Add(new SettingDefinition(MultiTenancySwitch.SettingName));
}

/// <summary>Carries the tenant's active flag into <see cref="TenantConfiguration.IsActive"/>, which ABP enforces on tenant resolution.</summary>
[Dependency(ReplaceServices = true)]
[ExposeServices(typeof(IAbpMapperlyMapper<Tenant, TenantConfiguration>))]
public class ActiveTenantConfigurationMapper : MapperBase<Tenant, TenantConfiguration>
{
    private readonly Volo.Abp.TenantManagement.Domain.Volo.Abp.TenantManagement.TenantToTenantConfigurationMapper _inner = new();

    public override TenantConfiguration Map(Tenant source)
    {
        var configuration = _inner.Map(source);
        configuration.IsActive = TenantAppService.IsActive(source);
        return configuration;
    }

    public override void Map(Tenant source, TenantConfiguration destination)
    {
        _inner.Map(source, destination);
        destination.IsActive = TenantAppService.IsActive(source);
    }
}
