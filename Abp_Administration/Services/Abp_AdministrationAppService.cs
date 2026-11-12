using Volo.Abp.Application.Services;
using Abp_Administration.Localization;

namespace Abp_Administration.Services;

/* Inherit your application services from this class. */
public abstract class Abp_AdministrationAppService : ApplicationService
{
    protected Abp_AdministrationAppService()
    {
        LocalizationResource = typeof(Abp_AdministrationResource);
    }
}