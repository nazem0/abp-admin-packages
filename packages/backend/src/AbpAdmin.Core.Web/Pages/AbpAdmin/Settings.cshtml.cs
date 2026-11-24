using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;

namespace AbpAdmin.Web.Pages;

/// <summary>Settings tabs the user may see; /AbpAdmin/Settings (or a hidden tab) redirects to the first one, none → 403.</summary>
public class SettingsModel(IOptions<AbpAdminWebOptions> options, IAuthorizationService authorization, IAuthorizationPolicyProvider policies) : PageModel
{
    public List<AbpAdminWebSettingsSection> Tabs { get; } = [];
    public AbpAdminWebSettingsSection? Active { get; private set; }

    public async Task<IActionResult> OnGetAsync(string? section)
    {
        foreach (var s in options.Value.OrderedSettings())
            if (await authorization.IsGrantedAnyAsync(policies, s.Policy)) Tabs.Add(s);
        if (Tabs.Count == 0) return Forbid();
        Active = Tabs.FirstOrDefault(s => string.Equals(s.Path, section, StringComparison.OrdinalIgnoreCase));
        return Active is null ? Redirect(AbpAdminWebOptions.Url("Settings/" + Tabs[0].Path)) : Page();
    }
}
