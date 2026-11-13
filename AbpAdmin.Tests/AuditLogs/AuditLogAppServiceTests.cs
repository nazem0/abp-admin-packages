using AbpAdmin.Services.AuditLogs;
using Shouldly;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp.Auditing;
using Volo.Abp.AuditLogging;
using Volo.Abp.Domain.Repositories;
using Xunit;

namespace AbpAdmin.AuditLogs;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class AuditLogAppServiceTests : AbpAdminTestBase
{
    private readonly AuditLogAppService _service;
    private readonly IRepository<AuditLog, Guid> _repository;
    private readonly IAuditLogInfoToAuditLogConverter _converter;

    public AuditLogAppServiceTests()
    {
        _service = GetRequiredService<AuditLogAppService>();
        _repository = GetRequiredService<IRepository<AuditLog, Guid>>();
        _converter = GetRequiredService<IAuditLogInfoToAuditLogConverter>();
    }

    [Fact]
    public async Task Statistics_Aggregate_Failures_And_Normalize_Endpoint_Ids()
    {
        var day = new DateTime(2030, 1, 15, 10, 0, 0);
        await WithUnitOfWorkAsync(async () =>
        {
            await Insert(day, "PUT", $"/api/identity/users/{Guid.NewGuid()}", 200, 40);
            await Insert(day, "PUT", $"/api/identity/users/{Guid.NewGuid()}?x=1", 404, 20, "not found");
            await Insert(day.AddDays(1), "GET", "/api/orders/42", 500, 300, "boom");
        });

        var stats = await WithUnitOfWorkAsync(() => _service.GetStatisticsAsync(new GetAuditLogStatisticsInput
        {
            StartTime = day.Date,
            EndTime = day.Date.AddDays(2).AddTicks(-1)
        }));

        stats.TotalRequests.ShouldBe(3);
        stats.FailedRequests.ShouldBe(2);
        stats.MaxDuration.ShouldBe(300);
        stats.Days.Count.ShouldBe(2);
        stats.Days[0].Requests.ShouldBe(2);
        stats.Days[1].Failed.ShouldBe(1);

        var users = stats.TopEndpoints.Single(e => e.Url == "/api/identity/users/{id}");
        users.Count.ShouldBe(2);
        users.Failed.ShouldBe(1);
        stats.TopEndpoints.ShouldContain(e => e.Url == "/api/orders/{id}");
    }

    [Fact]
    public async Task List_And_Get_Are_Projected_With_Nested_Details()
    {
        GetRequiredService<Volo.Abp.ObjectMapping.IQueryProjector<AuditLog, AuditLogDto>>().ShouldBeOfType<AuditLogDtoProjector>();

        var time = new DateTime(2031, 3, 1, 9, 0, 0);
        await WithUnitOfWorkAsync(async () =>
        {
            await Insert(time, "POST", "/api/orders", 201, 80, withDetails: true);
            await Insert(time.AddMinutes(1), "GET", "/api/orders/7", 500, 10, "boom");
        });

        var list = await WithUnitOfWorkAsync(() => _service.GetListAsync(new GetAuditLogListInput
        {
            StartTime = time.AddHours(-1), EndTime = time.AddHours(1), HasException = false
        }));
        list.TotalCount.ShouldBe(1);
        var log = list.Items.Single();
        log.Url.ShouldBe("/api/orders");
        log.Actions.Single().MethodName.ShouldBe("CreateAsync");
        log.EntityChanges.Single().PropertyChanges.Single().NewValue.ShouldBe("\"x\"");

        var single = await WithUnitOfWorkAsync(() => _service.GetAsync(log.Id));
        single.Actions.Count.ShouldBe(1);
        single.EntityChanges.Count.ShouldBe(1);

        var newestFirst = await WithUnitOfWorkAsync(() => _service.GetListAsync(new GetAuditLogListInput
        {
            StartTime = time.AddHours(-1), EndTime = time.AddHours(1)
        }));
        newestFirst.Items.Select(x => x.HttpStatusCode).ShouldBe(new int?[] { 500, 201 });
    }

    [Fact]
    public async Task Statistics_Cut_Days_In_The_Users_Time_Zone()
    {
        // 20:00 UTC on Jan 15 is already Jan 16 in Tokyo (UTC+9).
        var utc = new DateTime(2032, 1, 15, 20, 0, 0, DateTimeKind.Utc);
        await WithUnitOfWorkAsync(() => Insert(utc, "POST", "/api/x", 200, 5));

        var timezone = GetRequiredService<Volo.Abp.Timing.ICurrentTimezoneProvider>();
        var input = new GetAuditLogStatisticsInput { StartTime = utc.AddHours(-2), EndTime = utc.AddHours(2) };

        timezone.TimeZone = "Asia/Tokyo";
        try
        {
            var stats = await WithUnitOfWorkAsync(() => _service.GetStatisticsAsync(input));
            stats.Days.Single(d => d.Requests == 1).Date.ShouldBe("2032-01-16");
        }
        finally
        {
            timezone.TimeZone = null;
        }

        var utcStats = await WithUnitOfWorkAsync(() => _service.GetStatisticsAsync(input));
        utcStats.Days.Single(d => d.Requests == 1).Date.ShouldBe("2032-01-15");
    }

    [Fact]
    public async Task Entity_Changes_Feed_History_And_Types()
    {
        var time = new DateTime(2033, 5, 1, 8, 0, 0, DateTimeKind.Utc);
        await WithUnitOfWorkAsync(async () =>
        {
            await Insert(time, "POST", "/api/orders", 201, 30, withDetails: true);
            await Insert(time.AddMinutes(5), "PUT", "/api/orders/1", 200, 30, withDetails: true, changeType: EntityChangeType.Updated);
        });

        var feed = await WithUnitOfWorkAsync(() => _service.GetEntityChangesAsync(new GetEntityChangeListInput
        {
            EntityTypeFullNames = ["Shop.Order"], StartTime = time.AddHours(-1), EndTime = time.AddHours(1), MaxResultCount = 10
        }));
        feed.TotalCount.ShouldBe(2);
        feed.Items[0].ChangeType.ShouldBe(EntityChangeType.Updated); // newest first
        feed.Items[0].Url.ShouldBe("/api/orders/1");
        feed.Items[0].UserName.ShouldBe("tester");
        feed.Items[0].PropertyChanges.Single().PropertyName.ShouldBe("Name");

        var updates = await WithUnitOfWorkAsync(() => _service.GetEntityChangesAsync(new GetEntityChangeListInput
        {
            EntityTypeFullNames = ["Shop.Order"], ChangeType = EntityChangeType.Updated, StartTime = time.AddHours(-1), EndTime = time.AddHours(1)
        }));
        updates.TotalCount.ShouldBe(1);

        var history = await WithUnitOfWorkAsync(() => _service.GetEntityHistoryAsync("1", "Shop.Order"));
        history.Select(x => x.ChangeType).ShouldBe(new[] { EntityChangeType.Created, EntityChangeType.Updated }); // oldest first
        history.ShouldAllBe(x => x.HttpMethod != null);

        var window = new GetEntityTypeCountsInput { StartTime = time.AddHours(-1), EndTime = time.AddHours(1) };
        var counts = await WithUnitOfWorkAsync(() => _service.GetEntityTypeCountsAsync(window));
        counts.Single(c => c.EntityTypeFullName == "Shop.Order").Count.ShouldBe(2);
        (await WithUnitOfWorkAsync(() => _service.GetEntityTypeCountsAsync(new GetEntityTypeCountsInput
        { StartTime = window.StartTime, EndTime = window.EndTime, ChangeType = EntityChangeType.Updated })))
            .Single(c => c.EntityTypeFullName == "Shop.Order").Count.ShouldBe(1);

        // Excluding the type empties the feed; including an unknown one too.
        (await WithUnitOfWorkAsync(() => _service.GetEntityChangesAsync(new GetEntityChangeListInput
        { StartTime = window.StartTime, EndTime = window.EndTime, ExcludedEntityTypeFullNames = ["Shop.Order"] }))).TotalCount.ShouldBe(0);
        (await WithUnitOfWorkAsync(() => _service.GetEntityChangesAsync(new GetEntityChangeListInput
        { StartTime = window.StartTime, EndTime = window.EndTime, EntityTypeFullNames = ["Shop.Order", "Shop.Missing"] }))).TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task Statistics_Reject_Oversized_Ranges()
    {
        await Should.ThrowAsync<Volo.Abp.UserFriendlyException>(() => _service.GetStatisticsAsync(new GetAuditLogStatisticsInput
        {
            StartTime = new DateTime(2030, 1, 1),
            EndTime = new DateTime(2030, 12, 31)
        }));
    }

    private async Task Insert(DateTime time, string method, string url, int status, int duration, string? exception = null, bool withDetails = false, EntityChangeType changeType = EntityChangeType.Created)
    {
        var info = new AuditLogInfo
        {
            ApplicationName = "test", UserName = "tester", ExecutionTime = time, ExecutionDuration = duration,
            HttpMethod = method, Url = url, HttpStatusCode = status, CorrelationId = Guid.NewGuid().ToString()
        };
        if (exception != null) info.Exceptions.Add(new Exception(exception));
        if (withDetails)
        {
            info.Actions.Add(new AuditLogActionInfo
            {
                ServiceName = "OrderAppService", MethodName = "CreateAsync", Parameters = "{}", ExecutionTime = time, ExecutionDuration = 50
            });
            info.EntityChanges.Add(new EntityChangeInfo
            {
                ChangeTime = time, ChangeType = changeType, EntityId = "1", EntityTypeFullName = "Shop.Order",
                PropertyChanges = new List<EntityPropertyChangeInfo> { new EntityPropertyChangeInfo { PropertyName = "Name", PropertyTypeFullName = "System.String", NewValue = "\"x\"" } }
            });
        }
        await _repository.InsertAsync(await _converter.ConvertAsync(info));
    }
}
