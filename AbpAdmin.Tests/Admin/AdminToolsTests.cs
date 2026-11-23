using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AbpAdmin.Data;
using AbpAdmin.Services.AuditLogs;
using AbpAdmin.Services.Caching;
using AbpAdmin.Services.EventBus;
using AbpAdmin.Services.SecurityLogs;
using AbpAdmin.Services.Settings;
using Shouldly;
using Volo.Abp;
using Volo.Abp.Content;
using Volo.Abp.EntityFrameworkCore.DistributedEvents;
using Volo.Abp.EventBus.Distributed;
using Volo.Abp.SettingManagement;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class AdminToolsTests : AbpAdminTestBase
{
    private const string Length = "Abp.Identity.Password.RequiredLength";

    [Fact]
    public async Task Settings_Browser_Lists_Every_Module_And_Edits_Globally()
    {
        var browser = GetRequiredService<SettingBrowserAppService>();
        var all = await browser.GetListAsync();
        all.ShouldContain(s => s.Group == "Abp.Identity");
        all.ShouldContain(s => s.Group == "Abp.Mailing");
        var length = all.Single(s => s.Name == Length);
        length.Type.ShouldBe("number");
        length.IsEditable.ShouldBeTrue();
        length.Value.ShouldBe(length.DefaultValue);

        await browser.UpdateAsync([new UpdateSettingDto { Name = Length, Value = "9" }]);
        length = (await browser.GetListAsync()).Single(s => s.Name == Length);
        length.GlobalValue.ShouldBe("9");
        length.Value.ShouldBe("9");

        await Should.ThrowAsync<UserFriendlyException>(() => browser.UpdateAsync([new UpdateSettingDto { Name = Length, Value = "x" }]));
        await Should.ThrowAsync<UserFriendlyException>(() => browser.UpdateAsync([new UpdateSettingDto { Name = "No.Such.Setting", Value = "1" }]));

        await browser.UpdateAsync([new UpdateSettingDto { Name = Length, Value = "" }]); // back to the default
        (await browser.GetListAsync()).Single(s => s.Name == Length).GlobalValue.ShouldBeNull();

        // Encrypted values never leave the server, and the placeholder sent back changes nothing.
        const string smtp = "Abp.Mailing.Smtp.Password";
        await browser.UpdateAsync([new UpdateSettingDto { Name = smtp, Value = "s3cret" }]);
        (await browser.GetListAsync()).Single(s => s.Name == smtp).GlobalValue.ShouldBe(SettingBrowserAppService.Hidden);
        await browser.UpdateAsync([new UpdateSettingDto { Name = smtp, Value = SettingBrowserAppService.Hidden }]);
        (await GetRequiredService<ISettingManager>().GetOrNullGlobalAsync(smtp)).ShouldBe("s3cret");
    }

    [Fact]
    public async Task Cache_Clears_By_Scope()
    {
        var cache = GetRequiredService<CacheAppService>();
        var everything = await cache.ClearAllAsync();
        everything.Users.ShouldBeGreaterThan(0);
        everything.Roles.ShouldBeGreaterThan(0);
        everything.Keys.ShouldBeGreaterThan(0);

        var admin = await WithUnitOfWorkAsync(() => GetRequiredService<Volo.Abp.Identity.IIdentityUserRepository>().FindByNormalizedUserNameAsync("ADMIN"));
        var user = await cache.ClearUserAsync(admin!.Id, null);
        user.Users.ShouldBe(1);
        user.Roles.ShouldBe(1); // admin's role
        var role = await WithUnitOfWorkAsync(() => GetRequiredService<Volo.Abp.Identity.IIdentityRoleRepository>().FindByNormalizedNameAsync("ADMIN"));
        (await cache.ClearRoleAsync(role!.Id)).Roles.ShouldBe(1);

        await Should.ThrowAsync<Volo.Abp.Domain.Entities.EntityNotFoundException>(() => cache.ClearUserAsync(Guid.NewGuid(), null));
    }

    [Fact]
    public async Task Event_Boxes_List_Retry_And_Delete()
    {
        var boxes = GetRequiredService<EventBoxAppService>();
        var found = await WithUnitOfWorkAsync(boxes.GetBoxesAsync);
        found.ShouldContain(b => b.Kind == EventBoxKind.Outbox && b.DbContext == nameof(AbpAdminDbContext));
        var inbox = found.Single(b => b.Kind == EventBoxKind.Inbox);

        var outgoing = Guid.NewGuid();
        var incoming = Guid.NewGuid();
        var data = Encoding.UTF8.GetBytes("{\"name\":\"test\"}");
        await WithUnitOfWorkAsync(async () =>
        {
            await GetRequiredService<IDbContextEventOutbox<AbpAdminDbContext>>().EnqueueAsync(new OutgoingEventInfo(outgoing, "test.sent", data, DateTime.UtcNow));
            var box = GetRequiredService<IDbContextEventInbox<AbpAdminDbContext>>();
            await box.EnqueueAsync(new IncomingEventInfo(incoming, "msg-1", "test.received", data, DateTime.UtcNow));
        });
        await WithUnitOfWorkAsync(() => GetRequiredService<IDbContextEventInbox<AbpAdminDbContext>>().MarkAsDiscardAsync(incoming));

        var discarded = await WithUnitOfWorkAsync(() => boxes.GetListAsync(new GetEventRecordListInput
            { Kind = EventBoxKind.Inbox, Box = inbox.Name, Status = EventRecordStatus.Discarded }));
        var record = discarded.Items.Single(x => x.Id == incoming);
        record.EventData.ShouldContain("test");
        record.MessageId.ShouldBe("msg-1");

        await WithUnitOfWorkAsync(() => boxes.RetryAsync(inbox.Name, incoming));
        (await WithUnitOfWorkAsync(() => boxes.GetListAsync(new GetEventRecordListInput { Kind = EventBoxKind.Inbox, Box = inbox.Name, Status = EventRecordStatus.Waiting })))
            .Items.ShouldContain(x => x.Id == incoming);

        var waiting = await WithUnitOfWorkAsync(() => boxes.GetListAsync(new GetEventRecordListInput { Kind = EventBoxKind.Outbox, Box = found.First(b => b.Kind == EventBoxKind.Outbox).Name, EventName = "test.sent" }));
        waiting.Items.Single().Id.ShouldBe(outgoing);

        await WithUnitOfWorkAsync(() => boxes.DeleteAsync(EventBoxKind.Inbox, inbox.Name, incoming));
        (await WithUnitOfWorkAsync(() => boxes.GetListAsync(new GetEventRecordListInput { Kind = EventBoxKind.Inbox, Box = inbox.Name })))
            .Items.ShouldNotContain(x => x.Id == incoming);
        await Should.ThrowAsync<UserFriendlyException>(() => WithUnitOfWorkAsync(() => boxes.RetryAsync("no-such-box", incoming)));
    }

    [Fact]
    public async Task Lists_Export_As_Csv()
    {
        (await Text(GetRequiredService<AuditLogAppService>().ExportAsync(new GetAuditLogListInput())))
            .ShouldStartWith("﻿Time,UserName,Tenant,HttpMethod,Url,StatusCode");
        (await Text(GetRequiredService<AuditLogAppService>().ExportEntityChangesAsync(new GetEntityChangeListInput())))
            .ShouldStartWith("﻿Time,ChangeType,EntityType,EntityId");
        (await Text(GetRequiredService<SecurityLogAppService>().ExportAsync(new GetSecurityLogListInput())))
            .ShouldStartWith("﻿Time,Action,UserName");
    }

    private static async Task<string> Text(Task<IRemoteStreamContent> file)
    {
        using var reader = new StreamReader((await file).GetStream(), new UTF8Encoding(false), detectEncodingFromByteOrderMarks: false);
        return await reader.ReadToEndAsync();
    }
}
