using Microsoft.AspNetCore.Builder;
using Abp_Administration;
using Volo.Abp.AspNetCore.TestBase;

var builder = WebApplication.CreateBuilder();
builder.Environment.ContentRootPath = GetWebProjectContentRootPathHelper.Get("Abp_Administration.csproj");
await builder.RunAbpModuleAsync<Abp_AdministrationTestModule>(applicationName: "Abp_Administration");
namespace Abp_Administration
{
    public partial class Program
    {
    }
}
