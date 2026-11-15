using AbpAdmin.Localization;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using System.Linq.Dynamic.Core;
using System.Text.RegularExpressions;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.AuditLogging;
using Volo.Abp.Domain.Repositories;

namespace AbpAdmin.Services.AuditLogs;

[Authorize(AbpAdminPermissions.AuditLogs.Default)]
public class AuditLogAppService : ReadOnlyAppService<AuditLog, AuditLogDto, Guid, GetAuditLogListInput>
{
    // ponytail: statistics are computed live over the date range; add a rollup table if the log table grows past a few million rows.
    private const int MaxStatisticsDays = 92;

    public AuditLogAppService(IRepository<AuditLog, Guid> repository)
        : base(repository)
    {
        LocalizationResource = typeof(AbpAdminResource);
        GetPolicyName = GetListPolicyName = AbpAdminPermissions.AuditLogs.Default;
    }

    // GetAsync / GetListAsync come from ReadOnlyAppService and are projected by AuditLogDtoProjector.

    protected override async Task<IQueryable<AuditLog>> CreateEntityQueryOrNullAsync(Guid id) =>
        (await ReadOnlyRepository.GetQueryableAsync()).Where(x => x.Id == id);

    protected override async Task<IQueryable<AuditLog>> CreateFilteredQueryAsync(GetAuditLogListInput input) =>
        (await ReadOnlyRepository.GetQueryableAsync())
            .WhereIf(input.StartTime.HasValue, x => x.ExecutionTime >= input.StartTime)
            .WhereIf(input.EndTime.HasValue, x => x.ExecutionTime <= input.EndTime)
            .WhereIf(!input.Url.IsNullOrWhiteSpace(), x => x.Url != null && x.Url.Contains(input.Url!))
            .WhereIf(!input.UserName.IsNullOrWhiteSpace(), x => x.UserName == input.UserName)
            .WhereIf(!input.HttpMethod.IsNullOrWhiteSpace(), x => x.HttpMethod == input.HttpMethod)
            .WhereIf(input.HttpStatusCode.HasValue, x => x.HttpStatusCode == input.HttpStatusCode)
            .WhereIf(input.MinExecutionDuration.HasValue, x => x.ExecutionDuration >= input.MinExecutionDuration)
            .WhereIf(input.MaxExecutionDuration.HasValue, x => x.ExecutionDuration <= input.MaxExecutionDuration)
            .WhereIf(input.HasException == true, x => x.Exceptions != null && x.Exceptions != "")
            .WhereIf(input.HasException == false, x => x.Exceptions == null || x.Exceptions == "")
            .WhereIf(!input.CorrelationId.IsNullOrWhiteSpace(), x => x.CorrelationId == input.CorrelationId)
            .WhereIf(!input.ClientIpAddress.IsNullOrWhiteSpace(), x => x.ClientIpAddress == input.ClientIpAddress);

    protected override IQueryable<AuditLog> ApplyDefaultSorting(IQueryable<AuditLog> query) =>
        query.OrderByDescending(x => x.ExecutionTime);

    /// <summary>Entity changes across all requests, newest first: the "what happened to my data" feed.</summary>
    public async Task<PagedResultDto<EntityChangeListItemDto>> GetEntityChangesAsync(GetEntityChangeListInput input)
    {
        var query = FilterChanges(await EntityChangesAsync(), input)
            .WhereIf(input.AuditLogId.HasValue, c => c.AuditLogId == input.AuditLogId)
            .WhereIf(input.EntityTypeFullNames is { Count: > 0 }, c => input.EntityTypeFullNames!.Contains(c.EntityTypeFullName))
            .WhereIf(input.ExcludedEntityTypeFullNames is { Count: > 0 }, c => !input.ExcludedEntityTypeFullNames!.Contains(c.EntityTypeFullName));

        var totalCount = await AsyncExecuter.CountAsync(query);
        var page = query
            .OrderBy(input.Sorting.IsNullOrWhiteSpace() ? nameof(EntityChange.ChangeTime) + " desc" : input.Sorting)
            .Skip(input.SkipCount).Take(input.MaxResultCount);

        return new PagedResultDto<EntityChangeListItemDto>(totalCount, await WithRequestsAsync(page));
    }

    /// <summary>Full change history of a single entity, oldest first.</summary>
    // ponytail: unbounded per entity; page it if a single entity ever collects thousands of changes.
    public async Task<List<EntityChangeListItemDto>> GetEntityHistoryAsync(string entityId, string entityTypeFullName)
    {
        var query = (await EntityChangesAsync())
            .Where(c => c.EntityId == entityId && c.EntityTypeFullName == entityTypeFullName)
            .OrderBy(c => c.ChangeTime);
        return await WithRequestsAsync(query);
    }

    /// <summary>
    /// Entity types with how many changes each has under the current range / change type / id filters
    /// (not the type filters themselves), most-changed first. Drives the type picker.
    /// </summary>
    public async Task<List<EntityTypeCountDto>> GetEntityTypeCountsAsync(GetEntityTypeCountsInput input) =>
        await AsyncExecuter.ToListAsync(FilterChanges(await EntityChangesAsync(), input)
            .GroupBy(c => c.EntityTypeFullName)
            .Select(g => new EntityTypeCountDto { EntityTypeFullName = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count).ThenBy(x => x.EntityTypeFullName));

    private static IQueryable<EntityChange> FilterChanges(IQueryable<EntityChange> query, GetEntityTypeCountsInput input) =>
        query
            .WhereIf(input.StartTime.HasValue, c => c.ChangeTime >= input.StartTime)
            .WhereIf(input.EndTime.HasValue, c => c.ChangeTime <= input.EndTime)
            .WhereIf(input.ChangeType.HasValue, c => c.ChangeType == input.ChangeType)
            .WhereIf(!input.EntityId.IsNullOrWhiteSpace(), c => c.EntityId != null && c.EntityId.Contains(input.EntityId!));

    /// <summary>EntityChange is not an aggregate root, so it is reached through its AuditLog.</summary>
    private async Task<IQueryable<EntityChange>> EntityChangesAsync() =>
        (await ReadOnlyRepository.GetQueryableAsync()).SelectMany(a => a.EntityChanges);

    /// <summary>Projects the changes, then fills who/which request from their audit logs in one extra query.</summary>
    private async Task<List<EntityChangeListItemDto>> WithRequestsAsync(IQueryable<EntityChange> query)
    {
        var items = await AsyncExecuter.ToListAsync(query.ProjectToListItem());
        var ids = items.Select(x => x.AuditLogId).Distinct().ToList();
        var requests = (await AsyncExecuter.ToListAsync((await ReadOnlyRepository.GetQueryableAsync())
                .Where(a => ids.Contains(a.Id))
                .Select(a => new { a.Id, a.UserName, a.HttpMethod, a.Url })))
            .ToDictionary(a => a.Id);

        foreach (var item in items)
        {
            if (!requests.TryGetValue(item.AuditLogId, out var request)) continue;
            item.UserName = request.UserName;
            item.HttpMethod = request.HttpMethod;
            item.Url = request.Url;
        }
        return items;
    }

    public async Task<AuditLogStatisticsDto> GetStatisticsAsync(GetAuditLogStatisticsInput input)
    {
        if (input.EndTime <= input.StartTime || (input.EndTime - input.StartTime).TotalDays > MaxStatisticsDays)
        {
            throw new UserFriendlyException($"The date range must be positive and at most {MaxStatisticsDays} days.");
        }

        var query = (await ReadOnlyRepository.GetQueryableAsync())
            .Where(x => x.ExecutionTime >= input.StartTime && x.ExecutionTime <= input.EndTime);

        // One narrow projection, aggregated in memory: keeps every metric consistent and the SQL trivial.
        var rows = await AsyncExecuter.ToListAsync(query.Select(x => new
        {
            x.ExecutionTime,
            x.ExecutionDuration,
            x.HttpMethod,
            x.Url,
            x.HttpStatusCode,
            x.UserName,
            Failed = x.Exceptions != null || x.HttpStatusCode >= 400,
            Changes = x.EntityChanges.Count
        }));

        var stats = new AuditLogStatisticsDto
        {
            TotalRequests = rows.Count,
            FailedRequests = rows.Count(x => x.Failed),
            AverageDuration = rows.Count == 0 ? 0 : Math.Round(rows.Average(x => x.ExecutionDuration), 1),
            MaxDuration = rows.Count == 0 ? 0 : rows.Max(x => x.ExecutionDuration),
            UniqueUsers = rows.Where(x => x.UserName != null).Select(x => x.UserName).Distinct().Count(),
            EntityChanges = rows.Sum(x => x.Changes)
        };

        // Days are cut in the configured time zone (Abp.Timing.TimeZone), not in UTC.
        var byDay = rows.ToLookup(x => Clock.ConvertToUserTime(x.ExecutionTime).Date);
        var lastDay = Clock.ConvertToUserTime(input.EndTime).Date;
        for (var day = Clock.ConvertToUserTime(input.StartTime).Date; day <= lastDay; day = day.AddDays(1))
        {
            var dayRows = byDay[day].ToList();
            stats.Days.Add(new AuditLogDayStatDto
            {
                Date = day.ToString("yyyy-MM-dd"),
                Requests = dayRows.Count,
                Failed = dayRows.Count(x => x.Failed),
                AverageDuration = dayRows.Count == 0 ? 0 : Math.Round(dayRows.Average(x => x.ExecutionDuration), 1)
            });
        }

        stats.StatusCodes = Buckets(rows.Select(x => x.HttpStatusCode?.ToString() ?? "—"));
        stats.HttpMethods = Buckets(rows.Select(x => x.HttpMethod ?? "—"));
        stats.TopUsers = Buckets(rows.Select(x => x.UserName ?? "anonymous")).Take(5).ToList();

        var endpoints = rows
            .GroupBy(x => new { x.HttpMethod, Url = NormalizeUrl(x.Url) })
            .Select(g => new AuditLogEndpointStatDto
            {
                HttpMethod = g.Key.HttpMethod,
                Url = g.Key.Url,
                Count = g.Count(),
                Failed = g.Count(x => x.Failed),
                AverageDuration = Math.Round(g.Average(x => x.ExecutionDuration), 1)
            })
            .ToList();
        stats.TopEndpoints = endpoints.OrderByDescending(x => x.Count).Take(8).ToList();
        stats.SlowestEndpoints = endpoints.OrderByDescending(x => x.AverageDuration).Take(8).ToList();

        return stats;
    }

    private static List<AuditLogBucketDto> Buckets(IEnumerable<string> keys) =>
        keys.GroupBy(k => k)
            .Select(g => new AuditLogBucketDto { Key = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToList();

    private static readonly Regex IdSegment = new(@"/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\d+)(?=/|$)", RegexOptions.Compiled);

    /// <summary>"/api/users/3fa8…?x=1" → "/api/users/{id}", so endpoints aggregate instead of splitting per entity.</summary>
    private static string? NormalizeUrl(string? url)
    {
        if (url == null) return null;
        var i = url.IndexOf('?');
        return IdSegment.Replace(i < 0 ? url : url[..i], "/{id}");
    }
}
