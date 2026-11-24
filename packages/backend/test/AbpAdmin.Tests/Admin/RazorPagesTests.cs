using System.Threading.Tasks;
using Shouldly;
using Xunit;

namespace AbpAdmin.Admin;

/// <summary>Every Razor Pages console page compiles, finds the layout and renders its page root (the test host allows all permissions).</summary>
[Collection(AbpAdminTestConsts.CollectionDefinitionName)]
public class RazorPagesTests : AbpAdminTestBase
{
    [Theory]
    [InlineData("Overview", "abp-overview")]
    [InlineData("AuditLogs", "abp-audit-logs")]
    [InlineData("EntityChanges", "abp-entity-changes")]
    [InlineData("SecurityLogs", "abp-security-logs")]
    [InlineData("BackgroundJobs", "abp-background-jobs")]
    [InlineData("Events", "abp-events")]
    [InlineData("Users", "abp-users")]
    [InlineData("Roles", "abp-roles")]
    [InlineData("OrganizationUnits", "abp-ous")]
    [InlineData("Applications", "abp-applications")]
    [InlineData("Scopes", "abp-scopes")]
    [InlineData("Tenants", "abp-tenants")]
    [InlineData("Entities", "abp-entities")]
    [InlineData("Features", "abp-features")]
    [InlineData("Settings/time-zone", "abp-settings")]
    [InlineData("Settings/identity", "abp-identity-settings")]
    [InlineData("Settings/all", "abp-settings")]
    public async Task Page_Renders_In_The_Console_Layout(string page, string rootId)
    {
        var body = await GetResponseAsStringAsync($"/AbpAdmin/{page}");
        body.ShouldContain("id=\"abp-admin-palette\"");      // the layout
        body.ShouldContain("window.abpAdminConfig");          // browser config
        body.ShouldContain($"id=\"{rootId}\"");               // the page itself
    }

    [Fact]
    public async Task Nav_Entry_With_An_Undefined_Permission_Is_Hidden()
    {
        var body = await GetResponseAsStringAsync("/AbpAdmin/Overview");
        body.ShouldNotContain("/AbpAdmin/NotInstalled");
    }
}
