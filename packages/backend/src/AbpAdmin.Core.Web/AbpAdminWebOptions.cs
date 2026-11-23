using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;

namespace AbpAdmin.Web;

/// <summary>A sidebar entry. <see cref="Path"/> is the page under /AbpAdmin ("Users" → /AbpAdmin/Users).</summary>
public class AbpAdminWebNavItem(string path, string labelKey, string section, string policy, string icon, string keywords = "")
{
    public string Path { get; } = path;
    /// <summary>"AbpAdmin::Nav:Users"; also the English search text's source.</summary>
    public string LabelKey { get; } = labelKey;
    /// <summary>Sidebar group: "", "Monitoring", "Identity", "OpenIddict", "System" (or any other, listed last).</summary>
    public string Section { get; } = section;
    /// <summary>ABP policy, "a || b" for any of several; empty for always visible.</summary>
    public string Policy { get; set; } = policy;
    /// <summary>SVG path data of a 24×24 stroke icon.</summary>
    public string Icon { get; } = icon;
    public string Keywords { get; } = keywords;
    /// <summary>Order within its section.</summary>
    public int Order { get; set; }
}

/// <summary>
/// A Settings tab (/AbpAdmin/Settings/{Path}). Feature packages render theirs from <see cref="Partial"/> (a Razor partial in
/// their assembly); core's own tabs leave it empty.
/// </summary>
public class AbpAdminWebSettingsSection(string path, string labelKey, string policy, string icon, string keywords = "")
{
    public string Path { get; } = path;
    public string LabelKey { get; } = labelKey;
    public string Policy { get; } = policy;
    public string Icon { get; } = icon;
    public string Keywords { get; } = keywords;
    public string? Partial { get; set; }
    public int Order { get; set; }
}

/// <summary>A Ctrl+K quick action that opens a page, e.g. Users?new=1.</summary>
public class AbpAdminWebQuickAction(string id, string labelKey, string hintKey, string policy, string url, string keywords = "", string? icon = null)
{
    public string Id { get; } = id;
    public string LabelKey { get; } = labelKey;
    public string HintKey { get; } = hintKey;
    public string Policy { get; } = policy;
    /// <summary>Relative to /AbpAdmin/, e.g. "Users?new=1".</summary>
    public string Url { get; } = url;
    public string Keywords { get; } = keywords;
    public string? Icon { get; } = icon;
}

/// <summary>What the installed ABP Admin Web packages contribute. Each feature module adds its pages in ConfigureServices.</summary>
public class AbpAdminWebOptions
{
    public const string RootPath = "/AbpAdmin";
    public const string SettingsIcon = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z";
    public static readonly string[] SectionOrder = ["", "Monitoring", "Identity", "OpenIddict", "System"];

    public List<AbpAdminWebNavItem> Nav { get; } = [];
    public List<AbpAdminWebSettingsSection> Settings { get; } = [];
    public List<AbpAdminWebQuickAction> Actions { get; } = [];

    /// <summary>Whether a page is installed (e.g. before linking to it from another feature's page).</summary>
    public bool Has(string path) => Nav.Any(n => string.Equals(n.Path, path, StringComparison.OrdinalIgnoreCase));

    /// <summary>ABP Admin's own pages in the Angular sidebar's order; ties within a section follow it, whatever order modules load in.</summary>
    private static readonly string[] KnownPages = ["Overview", "AuditLogs", "EntityChanges", "SecurityLogs", "BackgroundJobs", "Events",
        "Users", "Roles", "OrganizationUnits", "Applications", "Scopes", "Tenants", "Features", "Settings"];

    /// <summary>Sidebar order: by section, then <see cref="AbpAdminWebNavItem.Order"/>, then ABP Admin's page order, then registration order.</summary>
    public IEnumerable<AbpAdminWebNavItem> OrderedNav()
    {
        static int Rank(string[] list, string s) { var i = Array.IndexOf(list, s); return i < 0 ? list.Length : i; }
        return Nav.Select((n, i) => (n, i))
            .OrderBy(x => Rank(SectionOrder, x.n.Section)).ThenBy(x => x.n.Order).ThenBy(x => Rank(KnownPages, x.n.Path)).ThenBy(x => x.i)
            .Select(x => x.n);
    }

    public IEnumerable<AbpAdminWebSettingsSection> OrderedSettings() => Settings.OrderBy(s => s.Order);

    public static string Url(string path) => $"{RootPath}/{path}";
}

public static class AbpAdminPolicyExtensions
{
    /// <summary>Empty = granted; "a || b" = any of them.</summary>
    public static async Task<bool> IsGrantedAnyAsync(this IAuthorizationService authorization, string? policy)
    {
        if (string.IsNullOrWhiteSpace(policy)) return true;
        foreach (var p in policy.Split("||", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            if (await authorization.IsGrantedAsync(p)) return true; // ABP: checks the current user
        return false;
    }
}
