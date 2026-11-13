using System.ComponentModel.DataAnnotations;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Auditing;

namespace AbpAdmin.Services.AuditLogs;

public class GetAuditLogListInput : PagedAndSortedResultRequestDto
{
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public string? Url { get; set; }
    public string? UserName { get; set; }
    public string? HttpMethod { get; set; }
    public int? HttpStatusCode { get; set; }
    public int? MinExecutionDuration { get; set; }
    public int? MaxExecutionDuration { get; set; }
    public bool? HasException { get; set; }
    public string? CorrelationId { get; set; }
    public string? ClientIpAddress { get; set; }
}

/// <summary>Filters shared by the change feed and the per-type counts.</summary>
public class GetEntityTypeCountsInput
{
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public EntityChangeType? ChangeType { get; set; }
    public string? EntityId { get; set; }
}

public class GetEntityChangeListInput : GetEntityTypeCountsInput, IPagedAndSortedResultRequest
{
    public Guid? AuditLogId { get; set; }
    /// <summary>Only these entity types (any of them). Empty = all.</summary>
    public List<string>? EntityTypeFullNames { get; set; }
    /// <summary>Never these entity types, e.g. framework bookkeeping like tokens and security logs.</summary>
    public List<string>? ExcludedEntityTypeFullNames { get; set; }
    public string? Sorting { get; set; }
    [Range(0, int.MaxValue)] public int SkipCount { get; set; }
    [Range(1, 1000)] public int MaxResultCount { get; set; } = 10;
}

public class EntityTypeCountDto
{
    public string EntityTypeFullName { get; set; } = "";
    public int Count { get; set; }
}

public class GetAuditLogStatisticsInput
{
    [Required] public DateTime StartTime { get; set; }
    [Required] public DateTime EndTime { get; set; }
}

public class AuditLogDto : EntityDto<Guid>
{
    public string? ApplicationName { get; set; }
    public Guid? UserId { get; set; }
    public string? UserName { get; set; }
    public Guid? ImpersonatorUserId { get; set; }
    public string? ImpersonatorUserName { get; set; }
    [Required] public DateTime ExecutionTime { get; set; }
    [Required] public int ExecutionDuration { get; set; }
    public string? ClientIpAddress { get; set; }
    public string? ClientName { get; set; }
    public string? ClientId { get; set; }
    public string? CorrelationId { get; set; }
    public string? BrowserInfo { get; set; }
    public string? HttpMethod { get; set; }
    public string? Url { get; set; }
    public string? Exceptions { get; set; }
    public string? Comments { get; set; }
    public int? HttpStatusCode { get; set; }
    [Required] public List<AuditLogActionDto> Actions { get; set; } = new();
    [Required] public List<EntityChangeDto> EntityChanges { get; set; } = new();
}

public class AuditLogActionDto : EntityDto<Guid>
{
    public string? ServiceName { get; set; }
    public string? MethodName { get; set; }
    public string? Parameters { get; set; }
    [Required] public DateTime ExecutionTime { get; set; }
    [Required] public int ExecutionDuration { get; set; }
}

public class EntityChangeDto : EntityDto<Guid>
{
    public Guid AuditLogId { get; set; }
    [Required] public DateTime ChangeTime { get; set; }
    [Required] public EntityChangeType ChangeType { get; set; }
    public string? EntityId { get; set; }
    public string? EntityTypeFullName { get; set; }
    [Required] public List<EntityPropertyChangeDto> PropertyChanges { get; set; } = new();
}

public class EntityPropertyChangeDto : EntityDto<Guid>
{
    public string? PropertyName { get; set; }
    public string? PropertyTypeFullName { get; set; }
    public string? OriginalValue { get; set; }
    public string? NewValue { get; set; }
}

/// <summary>An entity change plus who made it and in which request.</summary>
public class EntityChangeListItemDto : EntityChangeDto
{
    public string? UserName { get; set; }
    public string? HttpMethod { get; set; }
    public string? Url { get; set; }
}

public class AuditLogStatisticsDto
{
    [Required] public long TotalRequests { get; set; }
    [Required] public long FailedRequests { get; set; }
    [Required] public double AverageDuration { get; set; }
    [Required] public int MaxDuration { get; set; }
    [Required] public int UniqueUsers { get; set; }
    [Required] public long EntityChanges { get; set; }
    [Required] public List<AuditLogDayStatDto> Days { get; set; } = new();
    [Required] public List<AuditLogBucketDto> StatusCodes { get; set; } = new();
    [Required] public List<AuditLogBucketDto> HttpMethods { get; set; } = new();
    [Required] public List<AuditLogEndpointStatDto> TopEndpoints { get; set; } = new();
    [Required] public List<AuditLogEndpointStatDto> SlowestEndpoints { get; set; } = new();
    [Required] public List<AuditLogBucketDto> TopUsers { get; set; } = new();
}

public class AuditLogDayStatDto
{
    /// <summary>Calendar day (yyyy-MM-dd) in the configured time zone.</summary>
    [Required] public string Date { get; set; } = default!;
    [Required] public int Requests { get; set; }
    [Required] public int Failed { get; set; }
    [Required] public double AverageDuration { get; set; }
}

public class AuditLogBucketDto
{
    [Required] public string Key { get; set; } = default!;
    [Required] public int Count { get; set; }
}

public class AuditLogEndpointStatDto
{
    public string? HttpMethod { get; set; }
    public string? Url { get; set; }
    [Required] public int Count { get; set; }
    [Required] public int Failed { get; set; }
    [Required] public double AverageDuration { get; set; }
}
