using AbpAdmin.Localization;
using Volo.Abp.Application.Services;

namespace AbpAdmin.Services;

/// <summary>Base class for ABP Admin application services: localizes with <see cref="AbpAdminResource"/>.</summary>
public abstract class AbpAdminAppService : ApplicationService
{
    protected AbpAdminAppService()
    {
        LocalizationResource = typeof(AbpAdminResource);
    }
}
