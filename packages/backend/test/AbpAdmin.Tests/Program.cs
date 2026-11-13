using Microsoft.AspNetCore.Builder;
using AbpAdmin;
using Volo.Abp.AspNetCore.TestBase;

var builder = WebApplication.CreateBuilder();
builder.Environment.ContentRootPath = GetWebProjectContentRootPathHelper.Get("AbpAdmin.Host.csproj");
await builder.RunAbpModuleAsync<AbpAdminTestModule>(applicationName: "AbpAdmin.Host");
namespace AbpAdmin
{
    public partial class Program
    {
    }
}
