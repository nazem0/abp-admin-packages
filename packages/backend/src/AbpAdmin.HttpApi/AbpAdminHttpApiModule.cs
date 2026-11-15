using Volo.Abp.Modularity;

namespace AbpAdmin;

/// <summary>
/// Every ABP Admin feature with its HTTP APIs (<c>/api/abp-admin/{service}/...</c>, remote service <see cref="RemoteServiceName"/>).
/// Each feature module publishes its own controllers, so this module only gathers them.
/// </summary>
[DependsOn(typeof(AbpAdminApplicationModule))]
public class AbpAdminHttpApiModule : AbpModule
{
    public const string RemoteServiceName = AbpAdminRemoteService.Name;
    public const string RootPath = AbpAdminRemoteService.RootPath;
}
