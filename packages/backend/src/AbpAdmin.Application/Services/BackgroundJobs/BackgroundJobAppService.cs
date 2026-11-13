using AbpAdmin.Localization;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Riok.Mapperly.Abstractions;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.ObjectMapping;

namespace AbpAdmin.Services.BackgroundJobs;

public enum BackgroundJobState
{
    /// <summary>Queued and never tried.</summary>
    Waiting,
    /// <summary>Failed at least once; will be tried again at NextTryTime.</summary>
    Retrying,
    /// <summary>Gave up after too many failures or the job timed out.</summary>
    Abandoned,
}

public class BackgroundJobDto : EntityDto<Guid>
{
    public string? ApplicationName { get; set; }
    public string JobName { get; set; } = "";
    public string JobArgs { get; set; } = "";
    public short TryCount { get; set; }
    public DateTime CreationTime { get; set; }
    public DateTime NextTryTime { get; set; }
    public DateTime? LastTryTime { get; set; }
    public bool IsAbandoned { get; set; }
    public BackgroundJobPriority Priority { get; set; }
}

public class GetBackgroundJobListInput : PagedAndSortedResultRequestDto
{
    public BackgroundJobState? State { get; set; }
    public string? JobName { get; set; }
}

public class BackgroundJobCountsDto
{
    public int Waiting { get; set; }
    public int Retrying { get; set; }
    public int Abandoned { get; set; }
}

/// <summary>ABP's persisted background job queue (AbpBackgroundJobs): inspect, retry abandoned jobs, delete.</summary>
[Authorize(AbpAdminPermissions.BackgroundJobs.Default)]
public class BackgroundJobAppService : ReadOnlyAppService<BackgroundJobRecord, BackgroundJobDto, Guid, GetBackgroundJobListInput>
{
    private readonly IRepository<BackgroundJobRecord, Guid> _repository;

    public BackgroundJobAppService(IRepository<BackgroundJobRecord, Guid> repository) : base(repository)
    {
        _repository = repository;
        LocalizationResource = typeof(AbpAdminResource);
        GetPolicyName = GetListPolicyName = AbpAdminPermissions.BackgroundJobs.Default;
    }

    protected override async Task<IQueryable<BackgroundJobRecord>> CreateEntityQueryOrNullAsync(Guid id) =>
        (await ReadOnlyRepository.GetQueryableAsync()).Where(x => x.Id == id);

    protected override async Task<IQueryable<BackgroundJobRecord>> CreateFilteredQueryAsync(GetBackgroundJobListInput input) =>
        (await ReadOnlyRepository.GetQueryableAsync())
            .WhereIf(input.State == BackgroundJobState.Waiting, x => !x.IsAbandoned && x.TryCount == 0)
            .WhereIf(input.State == BackgroundJobState.Retrying, x => !x.IsAbandoned && x.TryCount > 0)
            .WhereIf(input.State == BackgroundJobState.Abandoned, x => x.IsAbandoned)
            .WhereIf(!input.JobName.IsNullOrWhiteSpace(), x => x.JobName.Contains(input.JobName!));

    protected override IQueryable<BackgroundJobRecord> ApplyDefaultSorting(IQueryable<BackgroundJobRecord> query) =>
        query.OrderBy(x => x.NextTryTime);

    public virtual async Task<BackgroundJobCountsDto> GetCountsAsync()
    {
        await CheckGetListPolicyAsync();
        var q = await ReadOnlyRepository.GetQueryableAsync();
        return new BackgroundJobCountsDto
        {
            Waiting = await AsyncExecuter.CountAsync(q.Where(x => !x.IsAbandoned && x.TryCount == 0)),
            Retrying = await AsyncExecuter.CountAsync(q.Where(x => !x.IsAbandoned && x.TryCount > 0)),
            Abandoned = await AsyncExecuter.CountAsync(q.Where(x => x.IsAbandoned)),
        };
    }

    /// <summary>Puts the job back in the queue to run as soon as the worker polls.</summary>
    [Authorize(AbpAdminPermissions.BackgroundJobs.Manage)]
    public virtual async Task RetryAsync(Guid id)
    {
        var job = await _repository.GetAsync(id);
        job.IsAbandoned = false;
        job.NextTryTime = Clock.Now;
        await _repository.UpdateAsync(job);
    }

    [Authorize(AbpAdminPermissions.BackgroundJobs.Manage)]
    public virtual Task DeleteAsync(Guid id) => _repository.DeleteAsync(id);
}

[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
[ExposeServices(typeof(IQueryProjector<BackgroundJobRecord, BackgroundJobDto>))]
public partial class BackgroundJobDtoProjector : IQueryProjector<BackgroundJobRecord, BackgroundJobDto>, ITransientDependency
{
    public partial IQueryable<BackgroundJobDto> ProjectTo(IQueryable<BackgroundJobRecord> query);
}
