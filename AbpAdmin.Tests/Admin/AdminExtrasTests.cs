using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using AbpAdmin.Services.AuditLogs;
using AbpAdmin.Services.Identity;
using AbpAdmin.Services.Tenants;
using Shouldly;
using Volo.Abp;
using Volo.Abp.Auditing;
using Volo.Abp.Content;
using Volo.Abp.Identity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.Validation;
using Xunit;

namespace AbpAdmin.Admin;

[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class AdminExtrasTests : AbpAdminTestBase
{
    [Fact]
    public void Csv_Round_Trips()
    {
        var line = Csv.Line(["plain", "a,b", "say \"hi\"", "two\nlines", "+962 7", "=SUM(A1)", null]);
        var parsed = Csv.Parse("﻿h1,h2\r\n" + line + "\n").ToList();
        parsed.Count.ShouldBe(2);
        parsed[0].ShouldBe(["h1", "h2"]);
        parsed[1].Select(Csv.Unescape).ShouldBe(["plain", "a,b", "say \"hi\"", "two\nlines", "+962 7", "=SUM(A1)", ""]);
        line.ShouldContain("'=SUM(A1)"); // formula guard in the file
    }

    [Fact]
    public async Task Claim_Types_And_Claims()
    {
        var types = GetRequiredService<ClaimTypeAppService>();
        var claims = GetRequiredService<IdentityClaimsAppService>();
        var employee = await types.CreateAsync(new CreateUpdateClaimTypeDto { Name = "employee_no", Regex = "^E\\d+$", RegexDescription = "E followed by digits" });
        await Should.ThrowAsync<BusinessException>(() => types.CreateAsync(new CreateUpdateClaimTypeDto { Name = "employee_no" }));
        await Should.ThrowAsync<AbpValidationException>(() => types.CreateAsync(new CreateUpdateClaimTypeDto { Name = "bad", Regex = "(" }));

        var admin = await WithUnitOfWorkAsync(() => GetRequiredService<IIdentityUserRepository>().FindByNormalizedUserNameAsync("ADMIN"));
        await Should.ThrowAsync<AbpValidationException>(() =>
            claims.UpdateUserClaimsAsync(admin!.Id, new UpdateClaimsDto { Claims = [new ClaimDto { Type = "employee_no", Value = "nope" }] }));
        await Should.ThrowAsync<AbpValidationException>(() =>
            claims.UpdateUserClaimsAsync(admin!.Id, new UpdateClaimsDto { Claims = [new ClaimDto { Type = "undefined_type", Value = "x" }] }));

        await claims.UpdateUserClaimsAsync(admin!.Id, new UpdateClaimsDto { Claims = [new ClaimDto { Type = "employee_no", Value = "E42" }] });
        (await claims.GetUserClaimsAsync(admin.Id)).Single(c => c.Type == "employee_no").Value.ShouldBe("E42");
        await claims.UpdateUserClaimsAsync(admin.Id, new UpdateClaimsDto());
        (await claims.GetUserClaimsAsync(admin.Id)).ShouldNotContain(c => c.Type == "employee_no");

        var role = await WithUnitOfWorkAsync(() => GetRequiredService<IIdentityRoleRepository>().FindByNormalizedNameAsync("ADMIN"));
        await claims.UpdateRoleClaimsAsync(role!.Id, new UpdateClaimsDto { Claims = [new ClaimDto { Type = "employee_no", Value = "E1" }] });
        (await claims.GetRoleClaimsAsync(role.Id)).Single().Value.ShouldBe("E1");

        await types.DeleteAsync(employee.Id); // removes it from users and roles too
        (await claims.GetRoleClaimsAsync(role.Id)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Move_All_Users_And_Import_Export()
    {
        var transfer = GetRequiredService<UserTransferAppService>();
        var csv = "UserName,Email,Name,Password,Roles,PhoneNumber\n"
            + "importer1,importer1@test.io,Imp,1q2w3E*,admin,+96270000\n"
            + "importer2,importer2@test.io,,1q2w3E*,,\n"
            + "admin,admin@abp.io,,1q2w3E*,,\n"   // exists → skipped
            + "badpass,badpass@test.io,,x,,\n";   // password policy → error, line 5
        var result = await transfer.ImportAsync(new RemoteStreamContent(new MemoryStream(Encoding.UTF8.GetBytes(csv)), "u.csv", "text/csv"));
        result.Created.ShouldBe(2);
        result.Skipped.ShouldBe(["admin"]);
        result.Errors.Single().Line.ShouldBe(5);

        using (var reader = new StreamReader((await transfer.ExportAsync()).GetStream()))
        {
            var text = await reader.ReadToEndAsync();
            text.ShouldContain("importer1,importer1@test.io,Imp,,'+96270000,true,admin");
            text.ShouldNotContain("badpass");
        }

        // Everyone in "admin" (admin + importer1) moves to a new role.
        var roles = GetRequiredService<IIdentityRoleAppService>();
        var target = await roles.CreateAsync(new IdentityRoleCreateDto { Name = "moved_here" });
        var adminRole = await WithUnitOfWorkAsync(() => GetRequiredService<IIdentityRoleRepository>().FindByNormalizedNameAsync("ADMIN"));
        var source = await roles.CreateAsync(new IdentityRoleCreateDto { Name = "move_from" });
        var users = GetRequiredService<IIdentityUserAppService>();
        var importer2 = await users.FindByUsernameAsync("importer2");
        await WithUnitOfWorkAsync(async () =>
        {
            var manager = GetRequiredService<IdentityUserManager>();
            await manager.SetRolesAsync(await manager.GetByIdAsync(importer2!.Id), ["move_from"]);
        });

        (await GetRequiredService<RoleUsersAppService>().MoveAllUsersAsync(source.Id, new MoveAllUsersDto { TargetRoleId = target.Id })).Moved.ShouldBe(1);
        (await users.GetRolesAsync(importer2!.Id)).Items.Select(r => r.Name).ShouldBe(["moved_here"]);
        await Should.ThrowAsync<UserFriendlyException>(() => GetRequiredService<RoleUsersAppService>().MoveAllUsersAsync(target.Id, new MoveAllUsersDto { TargetRoleId = target.Id }));
        adminRole.ShouldNotBeNull();
    }

    [Fact]
    public async Task Tenant_Admin_Password_And_Invite()
    {
        var tenant = await GetRequiredService<TenantAppService>().CreateAsync(new CreateTenantDto { Name = "invitee", AdminEmailAddress = "admin@invitee.test", AdminPassword = "1q2w3E*" });
        var admins = GetRequiredService<TenantAdminAppService>();

        await admins.SetPasswordAsync(tenant.Id, new SetTenantUserPasswordDto { UserName = "admin", Password = "N3w-passw0rd" });
        await Should.ThrowAsync<UserFriendlyException>(() => admins.SetPasswordAsync(tenant.Id, new SetTenantUserPasswordDto { UserName = "ghost", Password = "N3w-passw0rd" }));
        await Should.ThrowAsync<BusinessException>(() => admins.SetPasswordAsync(tenant.Id, new SetTenantUserPasswordDto { UserName = "admin", Password = "x" }));

        var invitation = await admins.InviteAdminAsync(tenant.Id, new InviteTenantAdminDto { Email = "boss@invitee.test" });
        invitation.UserName.ShouldBe("boss@invitee.test");
        invitation.Link.ShouldContain("/Account/ResetPassword?userId=");
        invitation.Link.ShouldContain("__tenant=" + tenant.Id);

        using (GetRequiredService<ICurrentTenant>().Change(tenant.Id))
        {
            var manager = GetRequiredService<IdentityUserManager>();
            await WithUnitOfWorkAsync(async () =>
            {
                var boss = await manager.FindByEmailAsync("boss@invitee.test");
                boss.ShouldNotBeNull();
                (await manager.IsInRoleAsync(boss, "admin")).ShouldBeTrue();
                (await manager.CheckPasswordAsync((await manager.FindByNameAsync("admin"))!, "N3w-passw0rd")).ShouldBeTrue();
            });
        }

        // Inviting again re-sends to the same user.
        (await admins.InviteAdminAsync(tenant.Id, new InviteTenantAdminDto { Email = "boss@invitee.test" })).UserName.ShouldBe("boss@invitee.test");
    }

    [Fact]
    public async Task Audit_Log_Retention_Deletes_Old_Logs()
    {
        var retention = GetRequiredService<AuditLogRetentionAppService>();
        (await retention.CleanupAsync()).Deleted.ShouldBe(0); // 0 days = keep forever

        await WithUnitOfWorkAsync(() => GetRequiredService<IAuditingStore>().SaveAsync(new AuditLogInfo
        {
            ApplicationName = "test", ExecutionTime = DateTime.UtcNow.AddDays(-40), Url = "/old", HttpMethod = "GET",
        }));
        await retention.UpdateAsync(new AuditLogRetentionDto { Days = 30 });
        (await retention.GetAsync()).Days.ShouldBe(30);

        (await retention.CleanupAsync()).Deleted.ShouldBeGreaterThanOrEqualTo(1);
        (await retention.CleanupAsync()).Deleted.ShouldBe(0);
        await retention.UpdateAsync(new AuditLogRetentionDto { Days = 0 });
    }
}
