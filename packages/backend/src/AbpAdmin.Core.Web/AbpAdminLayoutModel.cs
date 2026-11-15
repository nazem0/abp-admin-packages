using System.Text.Json;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Volo.Abp.AspNetCore.Mvc.ApplicationConfigurations;
using Volo.Abp.DependencyInjection;

namespace AbpAdmin.Web;

public record AbpAdminNavGroup(string Name, List<AbpAdminNavLink> Items);
public record AbpAdminNavLink(AbpAdminWebNavItem Item, string Url, bool Active, List<AbpAdminNavLink> Children);

/// <summary>Everything the console layout renders: the permission-filtered sidebar, Ctrl+K entries and the page's browser config.</summary>
public class AbpAdminLayoutModel
{
    public List<AbpAdminNavGroup> Groups { get; init; } = [];
    public List<AbpAdminWebSettingsSection> Settings { get; init; } = [];
    public required ApplicationConfigurationDto Configuration { get; init; }
    /// <summary>window.abpAdminConfig: ABP's application configuration plus <c>abpAdmin.pages</c> and <c>abpAdmin.commands</c>.</summary>
    public required string ConfigJson { get; init; }
    public required string AntiforgeryToken { get; init; }
}

public class AbpAdminLayoutBuilder(
    IOptions<AbpAdminWebOptions> options,
    IAuthorizationService authorization,
    IAbpApplicationConfigurationAppService appConfiguration,
    IAntiforgery antiforgery,
    IHttpContextAccessor http) : ITransientDependency
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web); // default encoder escapes <, >, &: safe inside <script>

    public async Task<AbpAdminLayoutModel> BuildAsync()
    {
        var o = options.Value;
        var path = http.HttpContext?.Request.Path.Value ?? "";
        bool IsActive(string url) => path.Equals(url, StringComparison.OrdinalIgnoreCase) || path.StartsWith(url + "/", StringComparison.OrdinalIgnoreCase);

        var settings = new List<AbpAdminWebSettingsSection>();
        foreach (var s in o.OrderedSettings())
            if (await authorization.IsGrantedAnyAsync(s.Policy)) settings.Add(s);

        var groups = new List<AbpAdminNavGroup>();
        var pages = new List<string>();
        var commands = new List<object>();
        foreach (var n in o.OrderedNav())
        {
            var isSettings = n.Path == "Settings";
            if (isSettings ? settings.Count == 0 : !await authorization.IsGrantedAnyAsync(n.Policy)) continue;
            var url = AbpAdminWebOptions.Url(n.Path);
            var children = isSettings
                ? settings.Select(s => new AbpAdminNavLink(new AbpAdminWebNavItem($"Settings/{s.Path}", s.LabelKey, "Settings", s.Policy, s.Icon, s.Keywords), $"{url}/{s.Path}", IsActive($"{url}/{s.Path}"), [])).ToList()
                : [];
            if (groups.LastOrDefault()?.Name != n.Section) groups.Add(new AbpAdminNavGroup(n.Section, []));
            groups[^1].Items.Add(new AbpAdminNavLink(n, url, IsActive(url), children));
            pages.Add(n.Path);
            commands.Add(Command(n.Path, n.LabelKey, n.Section, n.Icon, n.Keywords, url));
            foreach (var c in children) commands.Add(Command(c.Item.Path, c.Item.LabelKey, "Settings", c.Item.Icon, c.Item.Keywords, c.Url));
        }
        foreach (var a in o.Actions)
            if (await authorization.IsGrantedAnyAsync(a.Policy))
                commands.Add(new { id = a.Id, labelKey = a.LabelKey, hintKey = a.HintKey, icon = a.Icon ?? "M12 5v14M5 12h14", keywords = a.Keywords, url = AbpAdminWebOptions.Url(a.Url) });

        var configuration = await appConfiguration.GetAsync(new ApplicationConfigurationRequestOptions { IncludeLocalizationResources = true });
        var config = JsonSerializer.SerializeToNode(configuration, Json)!.AsObject();
        config["abpAdmin"] = JsonSerializer.SerializeToNode(new { pages, commands }, Json);

        return new AbpAdminLayoutModel
        {
            Groups = groups,
            Settings = settings,
            Configuration = configuration,
            ConfigJson = config.ToJsonString(Json),
            AntiforgeryToken = antiforgery.GetAndStoreTokens(http.HttpContext!).RequestToken ?? "",
        };
    }

    private static object Command(string path, string labelKey, string section, string icon, string keywords, string url) => new
    {
        id = path,
        labelKey,
        hintKey = section == "" ? "AbpAdmin::Palette:Page" : $"AbpAdmin::Nav:Section:{section}",
        icon,
        // English label stays searchable next to the translated one.
        keywords = $"{labelKey.Split(':').Last()} {keywords}",
        url,
    };
}
