using Volo.Abp.Application.Services;
using AbpAdmin.Localization;

namespace AbpAdmin.Services;

/* Inherit your application services from this class. */
public abstract class AbpAdminAppService : ApplicationService
{
    protected AbpAdminAppService()
    {
        LocalizationResource = typeof(AbpAdminResource);
    }
}