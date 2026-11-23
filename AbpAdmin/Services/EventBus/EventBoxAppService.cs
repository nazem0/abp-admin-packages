using System.Text;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore.DistributedEvents;
using Volo.Abp.EventBus.Distributed;

namespace AbpAdmin.Services.EventBus;

public enum EventBoxKind { Outbox, Inbox }

public enum EventRecordStatus
{
    /// <summary>Not sent (outbox) or not handled (inbox) yet.</summary>
    Waiting,
    /// <summary>Inbox: a handler failed at least once; tried again at NextRetryTime.</summary>
    Retrying,
    /// <summary>Inbox: gave up after too many failures.</summary>
    Discarded,
    /// <summary>Inbox: handled; kept until ABP's cleanup deletes it.</summary>
    Processed,
}

public class EventBoxDto
{
    /// <summary>The name the box is registered under in AbpDistributedEventBusOptions.</summary>
    public string Name { get; set; } = "";
    public EventBoxKind Kind { get; set; }
    public string DbContext { get; set; } = "";
    public int Waiting { get; set; }
    public int Retrying { get; set; }
    public int Discarded { get; set; }
    public int Processed { get; set; }
}

public class EventRecordDto
{
    public Guid Id { get; set; }
    public string EventName { get; set; } = "";
    /// <summary>The serialized event (JSON for ABP's serializer).</summary>
    public string EventData { get; set; } = "";
    public DateTime CreationTime { get; set; }
    public EventRecordStatus Status { get; set; }
    public string? MessageId { get; set; }
    public int RetryCount { get; set; }
    public DateTime? NextRetryTime { get; set; }
    public DateTime? HandledTime { get; set; }
}

public class GetEventRecordListInput : PagedResultRequestDto
{
    public EventBoxKind Kind { get; set; }
    public string Box { get; set; } = "";
    public EventRecordStatus? Status { get; set; }
    public string? EventName { get; set; }
}

/// <summary>
/// The distributed event bus outbox (events waiting to be sent) and inbox (received events waiting to be handled),
/// for every box stored with EF Core (<c>UseDbContext&lt;T&gt;()</c>). Sent outbox events are deleted by ABP, so
/// the outbox only ever holds waiting ones.
/// </summary>
// ponytail: EF Core boxes only; MongoDB boxes (UseMongoDbContext) are skipped until someone needs them.
[Authorize(AbpAdminPermissions.EventBoxes.Default)]
public class EventBoxAppService(IOptions<AbpDistributedEventBusOptions> options) : ApplicationService
{
    public virtual async Task<List<EventBoxDto>> GetBoxesAsync()
    {
        var result = new List<EventBoxDto>();
        foreach (var (name, kind, contextType) in Boxes())
        {
            var db = await DbContextAsync(contextType);
            var box = new EventBoxDto { Name = name, Kind = kind, DbContext = contextType.Name };
            if (kind == EventBoxKind.Outbox)
            {
                box.Waiting = await db.Set<OutgoingEventRecord>().CountAsync();
            }
            else
            {
                var counts = await db.Set<IncomingEventRecord>()
                    .GroupBy(x => new { x.Status, Retried = x.RetryCount > 0 })
                    .Select(g => new { g.Key.Status, g.Key.Retried, Count = g.Count() })
                    .ToListAsync();
                box.Waiting = counts.Where(c => c.Status == IncomingEventStatus.Pending && !c.Retried).Sum(c => c.Count);
                box.Retrying = counts.Where(c => c.Status == IncomingEventStatus.Pending && c.Retried).Sum(c => c.Count);
                box.Discarded = counts.Where(c => c.Status == IncomingEventStatus.Discarded).Sum(c => c.Count);
                box.Processed = counts.Where(c => c.Status == IncomingEventStatus.Processed).Sum(c => c.Count);
            }
            result.Add(box);
        }
        return result;
    }

    public virtual async Task<PagedResultDto<EventRecordDto>> GetListAsync(GetEventRecordListInput input)
    {
        var db = await DbContextAsync(input.Kind, input.Box);
        if (input.Kind == EventBoxKind.Outbox)
        {
            var query = db.Set<OutgoingEventRecord>().AsNoTracking()
                .WhereIf(input.Status is not (null or EventRecordStatus.Waiting), _ => false)
                .WhereIf(!input.EventName.IsNullOrWhiteSpace(), x => x.EventName.Contains(input.EventName!));
            var page = await query.OrderBy(x => x.CreationTime).Skip(input.SkipCount).Take(input.MaxResultCount).ToListAsync();
            return new PagedResultDto<EventRecordDto>(await query.CountAsync(), page.Select(x => new EventRecordDto
            {
                Id = x.Id, EventName = x.EventName, EventData = Text(x.EventData), CreationTime = x.CreationTime, Status = EventRecordStatus.Waiting,
            }).ToList());
        }
        else
        {
            var query = db.Set<IncomingEventRecord>().AsNoTracking()
                .WhereIf(input.Status == EventRecordStatus.Waiting, x => x.Status == IncomingEventStatus.Pending && x.RetryCount == 0)
                .WhereIf(input.Status == EventRecordStatus.Retrying, x => x.Status == IncomingEventStatus.Pending && x.RetryCount > 0)
                .WhereIf(input.Status == EventRecordStatus.Discarded, x => x.Status == IncomingEventStatus.Discarded)
                .WhereIf(input.Status == EventRecordStatus.Processed, x => x.Status == IncomingEventStatus.Processed)
                .WhereIf(!input.EventName.IsNullOrWhiteSpace(), x => x.EventName.Contains(input.EventName!));
            var page = await query.OrderByDescending(x => x.CreationTime).Skip(input.SkipCount).Take(input.MaxResultCount).ToListAsync();
            return new PagedResultDto<EventRecordDto>(await query.CountAsync(), page.Select(x => new EventRecordDto
            {
                Id = x.Id, EventName = x.EventName, EventData = Text(x.EventData), CreationTime = x.CreationTime,
                Status = x.Status switch
                {
                    IncomingEventStatus.Discarded => EventRecordStatus.Discarded,
                    IncomingEventStatus.Processed => EventRecordStatus.Processed,
                    _ => x.RetryCount > 0 ? EventRecordStatus.Retrying : EventRecordStatus.Waiting,
                },
                MessageId = x.MessageId, RetryCount = x.RetryCount, NextRetryTime = x.NextRetryTime, HandledTime = x.HandledTime,
            }).ToList());
        }
    }

    /// <summary>Inbox only: hands a discarded or retrying event back to the inbox processor, as if just received.</summary>
    [Authorize(AbpAdminPermissions.EventBoxes.Manage)]
    public virtual async Task RetryAsync(string box, Guid id)
    {
        var db = await DbContextAsync(EventBoxKind.Inbox, box);
        var record = await db.Set<IncomingEventRecord>().FindAsync(id) ?? throw new UserFriendlyException("That event no longer exists.");
        // Status and the retry fields have no public setters.
        var entry = db.Entry(record);
        entry.Property(x => x.Status).CurrentValue = IncomingEventStatus.Pending;
        entry.Property(x => x.RetryCount).CurrentValue = 0;
        entry.Property(x => x.NextRetryTime).CurrentValue = null;
        entry.Property(x => x.HandledTime).CurrentValue = null;
    }

    [Authorize(AbpAdminPermissions.EventBoxes.Manage)]
    public virtual async Task DeleteAsync(EventBoxKind kind, string box, Guid id)
    {
        var db = await DbContextAsync(kind, box);
        object? record = kind == EventBoxKind.Outbox
            ? await db.Set<OutgoingEventRecord>().FindAsync(id)
            : await db.Set<IncomingEventRecord>().FindAsync(id);
        if (record != null) db.Remove(record);
    }

    /// <summary>EF Core boxes: UseDbContext&lt;T&gt;() sets ImplementationType to IDbContextEventOutbox&lt;T&gt; / IDbContextEventInbox&lt;T&gt;.</summary>
    private IEnumerable<(string Name, EventBoxKind Kind, Type DbContext)> Boxes()
    {
        foreach (var (name, config) in options.Value.Outboxes)
            if (ContextOf(config.ImplementationType, typeof(IDbContextEventOutbox<>)) is { } t) yield return (name, EventBoxKind.Outbox, t);
        foreach (var (name, config) in options.Value.Inboxes)
            if (ContextOf(config.ImplementationType, typeof(IDbContextEventInbox<>)) is { } t) yield return (name, EventBoxKind.Inbox, t);
    }

    private static Type? ContextOf(Type? implementation, Type generic) =>
        implementation is { IsGenericType: true } && implementation.GetGenericTypeDefinition() == generic ? implementation.GetGenericArguments()[0] : null;

    private Task<DbContext> DbContextAsync(EventBoxKind kind, string box) =>
        Boxes().FirstOrDefault(b => b.Kind == kind && b.Name == box) is { DbContext: { } type }
            ? DbContextAsync(type)
            : throw new UserFriendlyException($"There is no EF Core {kind.ToString().ToLowerInvariant()} named '{box}'.");

    /// <summary>The unit of work's instance of the box's DbContext (IDbContextProvider&lt;T&gt;, resolved for a runtime T).</summary>
    private async Task<DbContext> DbContextAsync(Type contextType)
    {
        var providerType = typeof(IDbContextProvider<>).MakeGenericType(contextType);
        var provider = LazyServiceProvider.LazyGetRequiredService(providerType);
        var task = (Task)providerType.GetMethod("GetDbContextAsync", Type.EmptyTypes)!.Invoke(provider, null)!;
        await task;
        return (DbContext)task.GetType().GetProperty(nameof(Task<object>.Result))!.GetValue(task)!;
    }

    private static string Text(byte[] data) => Encoding.UTF8.GetString(data);
}
