using AbpAdmin.Services.AuditLogs;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Timing;

namespace AbpAdmin.Host.Data;

[BackgroundJobName(AuditLogCleanupJob.Name)]
public class AuditLogCleanupArgs
{
    /// <summary>Logs older than this many months are deleted.</summary>
    public int KeepMonths { get; set; } = 12;

    /// <summary>The job queues its next run this many months later.</summary>
    public int EveryMonths { get; set; } = 6;
}

/// <summary>
/// Demo: a recurring cleanup that keeps a year of audit logs, run every six months through the job queue so it
/// shows on the Background jobs page. (The package's own retention runs as an hourly worker, off unless a retention is set.)
/// </summary>
public class AuditLogCleanupJob(AuditLogCleaner cleaner, IBackgroundJobManager jobs, IClock clock)
    : AsyncBackgroundJob<AuditLogCleanupArgs>, ITransientDependency
{
    public const string Name = "AbpAdmin.AuditLogCleanup";

    public override async Task ExecuteAsync(AuditLogCleanupArgs args)
    {
        var deleted = await cleaner.DeleteBeforeAsync(clock.Now.AddMonths(-args.KeepMonths));
        Logger.LogInformation("Audit log cleanup: {Deleted} logs older than {Months} months deleted", deleted, args.KeepMonths);
        await jobs.EnqueueAsync(args, BackgroundJobPriority.Low, Delay(clock, args.EveryMonths));
    }

    public static TimeSpan Delay(IClock clock, int months) => clock.Now.AddMonths(months) - clock.Now;
}

/// <summary>Schedules the first cleanup (six months out) unless one is already queued.</summary>
public class AuditLogCleanupJobSeedContributor(IBackgroundJobManager jobs, IRepository<BackgroundJobRecord, Guid> records, IClock clock)
    : IDataSeedContributor, ITransientDependency
{
    public async Task SeedAsync(DataSeedContext context)
    {
        if (context.TenantId != null || await records.AnyAsync(j => j.JobName == AuditLogCleanupJob.Name && !j.IsAbandoned)) return;
        var args = new AuditLogCleanupArgs();
        await jobs.EnqueueAsync(args, BackgroundJobPriority.Low, AuditLogCleanupJob.Delay(clock, args.EveryMonths));
    }
}
