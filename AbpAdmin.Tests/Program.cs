using Microsoft.AspNetCore.Builder;
using AbpAdmin;
using Volo.Abp.AspNetCore.TestBase;

var builder = WebApplication.CreateBuilder();
builder.Environment.ContentRootPath = GetWebProjectContentRootPathHelper.Get("AbpAdmin.csproj");
await builder.RunAbpModuleAsync<AbpAdminTestModule>(applicationName: "AbpAdmin");
namespace AbpAdmin
{
    public partial class Program
    {
    }
}
