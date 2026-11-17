using System.ComponentModel.DataAnnotations;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Volo.Abp.AuditLogging;
using Volo.Abp.BackgroundWorkers;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.MultiTenancy;
using Volo.Abp.SettingManagement;
using Volo.Abp.Settings;
using Volo.Abp.Linq;
using Volo.Abp.Threading;
using Volo.Abp.Timing;
using Volo.Abp.Uow;

namespace AbpAdmin.Services.AuditLogs;

public class AuditLogRetentionDto
{
    /// <summary>Audit logs (with their actions and entity changes) older than this are deleted; 0 keeps them forever.</summary>
    [Range(0, 36500)] public int Days { get; set; }
}

public class AuditLogCleanupResultDto
{
    public int Deleted { get; set; }
    public DateTime? Before { get; set; }
}

/// <summary>How long audit logs are kept (host-wide), and a "clean up now" button; <see cref="AuditLogCleanupWorker"/> runs it hourly.</summary>
[Authorize(AbpAdminPermissions.AuditLogs.ManageRetention)]
public class AuditLogRetentionAppService(ISettingManager settings, AuditLogCleaner cleaner) : AbpAdminAppService
{
    public virtual async Task<AuditLogRetentionDto> GetAsync() => new() { Days = await cleaner.GetRetentionDaysAsync() };

    public virtual async Task<AuditLogRetentionDto> UpdateAsync(AuditLogRetentionDto input)
    {
        await settings.SetGlobalAsync(AuditLogCleaner.SettingName, input.Days.ToString());
        return input;
    }

    public virtual Task<AuditLogCleanupResultDto> CleanupAsync() => cleaner.CleanAsync();
}

public class AuditLogCleaner(
    ISettingManager settings,
    IRepository<AuditLog, Guid> auditLogs,
    IDataFilter dataFilter,
    IClock clock,
    IAsyncQueryableExecuter executer) : ITransientDependency
{
    public const string SettingName = "AbpAdmin.AuditLogs.RetentionDays";

    public async Task<int> GetRetentionDaysAsync() =>
        int.TryParse(await settings.GetOrNullGlobalAsync(SettingName), out var days) && days > 0 ? days : 0;

    /// <summary>Deletes every tenant's logs older than the retention (actions and entity changes go with them, by cascade).</summary>
    // ponytail: shared database only; tenants with their own database keep their logs. Loop over them if that matters.
    [UnitOfWork]
    public virtual async Task<AuditLogCleanupResultDto> CleanAsync()
    {
        var days = await GetRetentionDaysAsync();
        if (days == 0) return new AuditLogCleanupResultDto();

        var before = clock.Now.AddDays(-days);
        using (dataFilter.Disable<IMultiTenant>())
        {
            var count = await executer.CountAsync((await auditLogs.GetQueryableAsync()).Where(x => x.ExecutionTime < before));
            if (count > 0) await auditLogs.DeleteDirectAsync(x => x.ExecutionTime < before);
            return new AuditLogCleanupResultDto { Deleted = count, Before = before };
        }
    }
}

/// <summary>Applies the audit log retention every hour.</summary>
public class AuditLogCleanupWorker : AsyncPeriodicBackgroundWorkerBase
{
    public AuditLogCleanupWorker(AbpAsyncTimer timer, IServiceScopeFactory serviceScopeFactory) : base(timer, serviceScopeFactory)
    {
        Timer.Period = (int)TimeSpan.FromHours(1).TotalMilliseconds;
    }

    protected override async Task DoWorkAsync(PeriodicBackgroundWorkerContext workerContext)
    {
        var result = await workerContext.ServiceProvider.GetRequiredService<AuditLogCleaner>().CleanAsync();
        if (result.Deleted > 0) Logger.LogInformation("Deleted {Count} audit logs older than {Before}.", result.Deleted, result.Before);
    }
}

public class AuditLogRetentionSettingDefinitionProvider : SettingDefinitionProvider
{
    public override void Define(ISettingDefinitionContext context) => context.Add(new SettingDefinition(AuditLogCleaner.SettingName, "0"));
}
