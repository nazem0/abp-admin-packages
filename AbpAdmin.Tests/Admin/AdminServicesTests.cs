using AbpAdmin.Services.BackgroundJobs;
using AbpAdmin.Services.Dashboard;
using AbpAdmin.Services.Identity;
using AbpAdmin.Services.OpenIddict;
using AbpAdmin.Services.SecurityLogs;
using AbpAdmin.Services.Settings;
using Shouldly;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Volo.Abp;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Guids;
using Volo.Abp.Identity;
using Volo.Abp.SecurityLog;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class AdminServicesTests : AbpAdminTestBase
{
    [Fact]
    public async Task Security_Logs_Filter_Project_And_Count_By_Action()
    {
        var at = new DateTime(2031, 3, 1, 9, 0, 0);
        await WithUnitOfWorkAsync(async () =>
        {
            var repo = GetRequiredService<IRepository<IdentitySecurityLog, Guid>>();
            var guid = GetRequiredService<IGuidGenerator>();
            foreach (var (action, user, minutes) in new[] { ("LoginSucceeded", "ali", 0), ("LoginInvalidUserNameOrPassword", "ali", 1), ("LoginInvalidUserNameOrPassword", "mona", 2) })
            {
                await repo.InsertAsync(new IdentitySecurityLog(guid, new SecurityLogInfo
                {
                    Action = action, UserName = user, Identity = "Identity", ClientIpAddress = "10.0.0.1",
                    ClientId = "AbpAdmin_App", CreationTime = at.AddMinutes(minutes),
                }));
            }
        });
        var service = GetRequiredService<SecurityLogAppService>();

        var failed = await service.GetListAsync(new GetSecurityLogListInput
        { StartTime = at, EndTime = at.AddHours(1), ActionName = "LoginInvalidUserNameOrPassword" });
        failed.TotalCount.ShouldBe(2);
        failed.Items[0].UserName.ShouldBe("mona"); // newest first
        failed.Items[0].ClientIpAddress.ShouldBe("10.0.0.1");

        (await service.GetListAsync(new GetSecurityLogListInput { StartTime = at, EndTime = at.AddHours(1), UserName = "al" })).TotalCount.ShouldBe(2);

        (await service.GetListAsync(new GetSecurityLogListInput { StartTime = at, EndTime = at.AddHours(1), FailedOnly = true })).TotalCount.ShouldBe(2);

        var counts = await service.GetActionCountsAsync(at, at.AddHours(1));
        counts.First().ShouldBeEquivalentTo(new SecurityLogActionCountDto { Action = "LoginInvalidUserNameOrPassword", Count = 2 });
        counts.Sum(c => c.Count).ShouldBe(3);
    }

    [Fact]
    public async Task Users_Can_Be_Locked_And_Unlocked()
    {
        var id = Guid.NewGuid();
        await WithUnitOfWorkAsync(async () =>
            (await GetRequiredService<IdentityUserManager>().CreateAsync(new IdentityUser(id, "locky", "locky@example.com"))).Succeeded.ShouldBeTrue());
        var service = GetRequiredService<UserLockoutAppService>();
        var users = GetRequiredService<IIdentityUserRepository>();

        await WithUnitOfWorkAsync(() => service.LockAsync(id, new LockUserInput { Until = DateTime.UtcNow.AddHours(1) }));
        (await WithUnitOfWorkAsync(() => users.GetAsync(id))).LockoutEnd.ShouldNotBeNull();

        await WithUnitOfWorkAsync(() => service.UnlockAsync(id));
        var user = await WithUnitOfWorkAsync(() => users.GetAsync(id));
        user.LockoutEnd.ShouldBeNull();
        user.AccessFailedCount.ShouldBe(0);
    }

    [Fact]
    public async Task Identity_Settings_Read_Write_And_Reject_Unknown_Or_Invalid()
    {
        var service = GetRequiredService<IdentitySettingsAppService>();
        var groups = await service.GetAsync();
        groups.Select(g => g.Name).ShouldContain("Password");
        var length = groups.SelectMany(g => g.Settings).Single(s => s.Name == "Abp.Identity.Password.RequiredLength");
        length.Type.ShouldBe("number");
        length.DisplayName.ShouldNotBeNullOrWhiteSpace();

        await service.UpdateAsync([new UpdateSettingDto { Name = "Abp.Identity.Password.RequiredLength", Value = "9" }]);
        (await service.GetAsync()).SelectMany(g => g.Settings).Single(s => s.Name == length.Name).Value.ShouldBe("9");

        await Should.ThrowAsync<UserFriendlyException>(() =>
            service.UpdateAsync([new UpdateSettingDto { Name = "Abp.Mailing.Smtp.Password", Value = "x" }]));
        await Should.ThrowAsync<UserFriendlyException>(() =>
            service.UpdateAsync([new UpdateSettingDto { Name = "Abp.Identity.Password.RequireDigit", Value = "maybe" }]));
    }

    [Fact]
    public async Task Applications_Create_Update_Rotate_Secret_And_Delete()
    {
        var service = GetRequiredService<ApplicationAppService>();
        var created = await WithUnitOfWorkAsync(() => service.CreateAsync(new CreateUpdateApplicationDto
        {
            ClientId = "test_backend", DisplayName = "Test backend", ClientType = "confidential", ClientSecret = "s3cret-1",
            GrantTypes = ["client_credentials"], Scopes = ["AbpAdmin"],
        }));
        created.GrantTypes.ShouldBe(["client_credentials"]);
        created.Scopes.ShouldBe(["AbpAdmin"]);

        // Confidential without a secret is rejected.
        await Should.ThrowAsync<UserFriendlyException>(() => service.CreateAsync(new CreateUpdateApplicationDto
        { ClientId = "no_secret", ClientType = "confidential", GrantTypes = ["client_credentials"] }));

        var updated = await WithUnitOfWorkAsync(() => service.UpdateAsync(created.Id, new CreateUpdateApplicationDto
        {
            ClientId = "test_backend", DisplayName = "Renamed", ClientType = "confidential", ClientSecret = "s3cret-2",
            GrantTypes = ["authorization_code", "refresh_token"], Scopes = ["email", "AbpAdmin"], RequirePkce = true,
            RedirectUris = ["https://app.example.com/callback"],
        }));
        updated.DisplayName.ShouldBe("Renamed");
        updated.GrantTypes.ShouldBe(["authorization_code", "refresh_token"], ignoreOrder: true);
        updated.RedirectUris.ShouldBe(["https://app.example.com/callback"]);
        updated.RequirePkce.ShouldBeTrue();

        // The rotated secret is the one that validates.
        await WithUnitOfWorkAsync(async () =>
        {
            var manager = GetRequiredService<OpenIddict.Abstractions.IOpenIddictApplicationManager>();
            var app = await manager.FindByClientIdAsync("test_backend");
            (await manager.ValidateClientSecretAsync(app!, "s3cret-2")).ShouldBeTrue();
            (await manager.ValidateClientSecretAsync(app!, "s3cret-1")).ShouldBeFalse();
        });

        (await service.GetListAsync(new GetOpenIddictListInput { Filter = "test_back" })).TotalCount.ShouldBe(1);
        await WithUnitOfWorkAsync(() => service.DeleteAsync(created.Id));
        (await service.GetListAsync(new GetOpenIddictListInput { Filter = "test_back" })).TotalCount.ShouldBe(0);
    }

    [Fact]
    public async Task Scopes_Crud()
    {
        var service = GetRequiredService<ScopeAppService>();
        var scope = await WithUnitOfWorkAsync(() => service.CreateAsync(new CreateUpdateScopeDto
        { Name = "Orders", DisplayName = "Orders API", Resources = ["Orders", " Orders "] }));
        scope.Resources.ShouldBe(["Orders"]);

        var updated = await WithUnitOfWorkAsync(() => service.UpdateAsync(scope.Id, new CreateUpdateScopeDto
        { Name = "Orders", Description = "Read and write orders", Resources = ["Orders", "Billing"] }));
        updated.Resources.ShouldBe(["Orders", "Billing"], ignoreOrder: true);
        updated.Description.ShouldBe("Read and write orders");

        await WithUnitOfWorkAsync(() => service.DeleteAsync(scope.Id));
        (await service.GetListAsync(new GetOpenIddictListInput { Filter = "Orders" })).TotalCount.ShouldBe(0);
    }

    [Fact]
    public async Task Background_Jobs_List_By_State_Retry_And_Delete()
    {
        var abandoned = Guid.NewGuid();
        await WithUnitOfWorkAsync(async () =>
        {
            var repo = GetRequiredService<IRepository<BackgroundJobRecord, Guid>>();
            await repo.InsertAsync(new BackgroundJobRecord(Guid.NewGuid()) { JobName = "Email", JobArgs = "{}", NextTryTime = DateTime.UtcNow.AddHours(1), CreationTime = DateTime.UtcNow });
            await repo.InsertAsync(new BackgroundJobRecord(abandoned) { JobName = "Report", JobArgs = "{}", TryCount = 5, IsAbandoned = true, NextTryTime = DateTime.UtcNow, CreationTime = DateTime.UtcNow });
        });
        var service = GetRequiredService<BackgroundJobAppService>();

        var counts = await service.GetCountsAsync();
        counts.Waiting.ShouldBeGreaterThanOrEqualTo(1);
        counts.Abandoned.ShouldBeGreaterThanOrEqualTo(1);
        (await service.GetListAsync(new GetBackgroundJobListInput { State = BackgroundJobState.Abandoned })).Items.ShouldContain(j => j.Id == abandoned);

        await WithUnitOfWorkAsync(() => service.RetryAsync(abandoned));
        (await service.GetAsync(abandoned)).IsAbandoned.ShouldBeFalse();
        (await service.GetListAsync(new GetBackgroundJobListInput { State = BackgroundJobState.Retrying })).Items.ShouldContain(j => j.Id == abandoned);

        await WithUnitOfWorkAsync(() => service.DeleteAsync(abandoned));
        (await service.GetListAsync(new GetBackgroundJobListInput { JobName = "Report" })).Items.ShouldNotContain(j => j.Id == abandoned);
    }

    [Fact]
    public async Task Client_Permissions_Use_Our_Policy_Instead_Of_The_Pro_One()
    {
        var service = GetRequiredService<Volo.Abp.PermissionManagement.IPermissionAppService>();
        await WithUnitOfWorkAsync(() => service.UpdateAsync("C", "test_backend", new Volo.Abp.PermissionManagement.UpdatePermissionsDto
        { Permissions = [new() { Name = "AbpAdmin.AuditLogs", IsGranted = true }] }));
        var result = await service.GetAsync("C", "test_backend");
        result.Groups.SelectMany(g => g.Permissions).Single(p => p.Name == "AbpAdmin.AuditLogs").IsGranted.ShouldBeTrue();
    }

    [Fact]
    public async Task Organization_Units_Tree_Members_Roles_Move_And_Delete()
    {
        var service = GetRequiredService<OrganizationUnitAppService>();
        var hq = await WithUnitOfWorkAsync(() => service.CreateAsync(new CreateOrganizationUnitDto { DisplayName = "HQ" }));
        var it = await WithUnitOfWorkAsync(() => service.CreateAsync(new CreateOrganizationUnitDto { DisplayName = "IT", ParentId = hq.Id }));
        var ops = await WithUnitOfWorkAsync(() => service.CreateAsync(new CreateOrganizationUnitDto { DisplayName = "Ops" }));
        it.Code.ShouldStartWith(hq.Code + ".");

        var userId = Guid.NewGuid();
        await WithUnitOfWorkAsync(async () =>
            (await GetRequiredService<IdentityUserManager>().CreateAsync(new IdentityUser(userId, "ou_member", "ou_member@example.com"))).Succeeded.ShouldBeTrue());
        var role = await WithUnitOfWorkAsync(() => GetRequiredService<IIdentityRoleRepository>().InsertAsync(new IdentityRole(Guid.NewGuid(), "ou_role")));

        await WithUnitOfWorkAsync(() => service.AddMembersAsync(it.Id, new IdListDto { Ids = [userId] }));
        await WithUnitOfWorkAsync(() => service.AddRolesAsync(it.Id, new IdListDto { Ids = [role.Id] }));
        (await service.GetMembersAsync(it.Id, new GetOrganizationUnitMembersInput())).Items.Single().UserName.ShouldBe("ou_member");
        (await service.GetRolesAsync(it.Id)).Single().Name.ShouldBe("ou_role");
        var tree = await service.GetTreeAsync();
        var itNode = tree.Single(x => x.Id == it.Id);
        (itNode.MemberCount, itNode.RoleCount).ShouldBe((1, 1));

        // Can't move a unit under its own child.
        await Should.ThrowAsync<UserFriendlyException>(() => service.MoveAsync(hq.Id, new MoveOrganizationUnitDto { NewParentId = it.Id }));
        await WithUnitOfWorkAsync(() => service.MoveAsync(it.Id, new MoveOrganizationUnitDto { NewParentId = ops.Id }));
        (await service.GetTreeAsync()).Single(x => x.Id == it.Id).ParentId.ShouldBe(ops.Id);

        await WithUnitOfWorkAsync(() => service.RemoveMemberAsync(it.Id, userId));
        (await service.GetMembersAsync(it.Id, new GetOrganizationUnitMembersInput())).TotalCount.ShouldBe(0);

        await WithUnitOfWorkAsync(() => service.DeleteAsync(ops.Id)); // takes IT with it
        (await service.GetTreeAsync()).Select(x => x.Id).ShouldNotContain(it.Id);
    }

    [Fact]
    public async Task Dashboard_Returns_Sections()
    {
        var dto = await GetRequiredService<DashboardAppService>().GetAsync();
        dto.Users.ShouldNotBeNull();
        dto.Users!.Total.ShouldBeGreaterThan(0);
        dto.Roles.ShouldNotBeNull();
        dto.Requests.ShouldNotBeNull();
        dto.SignIns.ShouldNotBeNull();
        dto.Jobs.ShouldNotBeNull();
    }
}
