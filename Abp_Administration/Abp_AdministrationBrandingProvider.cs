using Microsoft.Extensions.Localization;
using Abp_Administration.Localization;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Ui.Branding;

namespace Abp_Administration;

[Dependency(ReplaceServices = true)]
public class Abp_AdministrationBrandingProvider : DefaultBrandingProvider
{
    private IStringLocalizer<Abp_AdministrationResource> _localizer;

    public Abp_AdministrationBrandingProvider(IStringLocalizer<Abp_AdministrationResource> localizer)
    {
        _localizer = localizer;
    }

    public override string AppName => _localizer["AppName"];
}