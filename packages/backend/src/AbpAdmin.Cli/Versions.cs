using System.Text.Json;
using System.Xml.Linq;

namespace AbpAdmin.Cli;

/// <summary>Finds the newest ABP Admin release that fits the app, from nuget.org and npmjs.com.</summary>
public class Versions(HttpClient http)
{
    private const string NuGet = "https://api.nuget.org/v3-flatcontainer/";
    private const string Npm = "https://registry.npmjs.org/";

    /// <summary>
    /// Newest stable version of <paramref name="id"/> with a build for <paramref name="tfm"/> whose ABP dependency fits the
    /// app: the same major, and a minimum no higher than the app's ABP (so restoring never asks the app to upgrade ABP).
    /// </summary>
    public async Task<string?> NuGetAsync(string id, string tfm, Version abp)
    {
        foreach (var version in await StableNuGetVersionsAsync(id))
        {
            var nuspec = await http.GetStringAsync($"{NuGet}{id.ToLowerInvariant()}/{version}/{id.ToLowerInvariant()}.nuspec");
            if (Fits(nuspec, tfm, abp)) return version;
        }
        return null;
    }

    public async Task<bool> NuGetHasAsync(string id, string version) => (await StableNuGetVersionsAsync(id)).Contains(version);

    private async Task<List<string>> StableNuGetVersionsAsync(string id)
    {
        try
        {
            using var doc = JsonDocument.Parse(await http.GetStringAsync($"{NuGet}{id.ToLowerInvariant()}/index.json"));
            return doc.RootElement.GetProperty("versions").EnumerateArray().Select(v => v.GetString()!)
                .Where(v => !v.Contains('-')).OrderByDescending(v => Detector.ParseVersion(v)).ToList();
        }
        catch (HttpRequestException) { return []; } // not on nuget.org
    }

    /// <summary>Whether a nuspec has a dependency group for the target framework whose ABP minimum fits the app's ABP version.</summary>
    public static bool Fits(string nuspec, string tfm, Version abp)
    {
        var groups = XDocument.Parse(nuspec).Descendants().Where(e => e.Name.LocalName == "group").ToList();
        var group = groups.FirstOrDefault(g => string.Equals((string?)g.Attribute("targetFramework"), tfm, StringComparison.OrdinalIgnoreCase));
        if (group == null) return false;
        var minimum = group.Elements().Where(d => ((string?)d.Attribute("id"))?.StartsWith("Volo.Abp.", StringComparison.OrdinalIgnoreCase) == true)
            .Select(d => Detector.ParseVersion((string?)d.Attribute("version"))).FirstOrDefault(v => v != null);
        // Packages that only depend on other AbpAdmin.* packages follow those.
        return minimum == null || (minimum.Major == abp.Major && minimum <= abp);
    }

    /// <summary>
    /// Newest stable version of an npm package whose peer @abp/ng.core and @angular/core majors match the app's,
    /// and (when given) whose @nazem0/abp-admin-ng-core peer is <paramref name="core"/>.
    /// </summary>
    public async Task<string?> NpmAsync(string name, int abpNgMajor, int? angularMajor, string? core = null)
    {
        JsonDocument doc;
        try { doc = JsonDocument.Parse(await http.GetStringAsync(Npm + name.Replace("/", "%2f"))); }
        catch (HttpRequestException) { return null; }
        using (doc)
        {
            var candidates = doc.RootElement.GetProperty("versions").EnumerateObject()
                .Where(v => !v.Name.Contains('-'))
                .OrderByDescending(v => Detector.ParseVersion(v.Name));
            foreach (var v in candidates)
            {
                var peers = v.Value.TryGetProperty("peerDependencies", out var p) ? p : default;
                string? Peer(string n) => peers.ValueKind == JsonValueKind.Object && peers.TryGetProperty(n, out var x) ? x.GetString() : null;
                if (Detector.ParseVersion(Peer("@abp/ng.core"))?.Major is { } m && m != abpNgMajor) continue;
                if (angularMajor != null && Detector.ParseVersion(Peer("@angular/core"))?.Major is { } a && a != angularMajor) continue;
                if (core != null && Peer(Catalog.CoreNpm) is { } c && c != core) continue;
                return v.Name;
            }
            return null;
        }
    }
}
