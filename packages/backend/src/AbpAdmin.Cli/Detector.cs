using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace AbpAdmin.Cli;

public record DotnetProject(string Path, string Name, bool IsWeb, bool HasMvcUi, string? ModuleFile)
{
    public string Dir => System.IO.Path.GetDirectoryName(Path)!;
}

public record AngularApp(string Dir, string? AbpNgVersion, string? AngularVersion, string PackageManager);

/// <summary>What the app is built on: ABP and .NET versions, its web projects, and an Angular app if there is one.</summary>
public record Stack(string Root, Version? Abp, string? TargetFramework, List<DotnetProject> Projects, AngularApp? Angular)
{
    /// <summary>The project with an ABP MVC theme (the Razor Pages console goes here).</summary>
    public DotnetProject? MvcHost => Projects.Where(p => p.IsWeb && p.HasMvcUi && p.ModuleFile != null).OrderBy(Rank).FirstOrDefault();

    /// <summary>The project that serves the APIs: *.HttpApi.Host in a layered solution, else the web project.</summary>
    public DotnetProject? ApiHost =>
        Projects.Where(p => p.IsWeb && p.ModuleFile != null && p.Name.EndsWith(".HttpApi.Host", StringComparison.OrdinalIgnoreCase)).FirstOrDefault()
        ?? MvcHost
        ?? Projects.Where(p => p.IsWeb && p.ModuleFile != null).OrderBy(Rank).FirstOrDefault();

    private static int Rank(DotnetProject p) =>
        p.Name.EndsWith(".Web", StringComparison.OrdinalIgnoreCase) ? 0 : p.Name.Contains("AuthServer", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
}

public static class Detector
{
    private static readonly string[] SkipDirs = ["bin", "obj", "node_modules", ".git", ".vs", ".angular", "dist", "artifacts"];

    public static Stack Detect(string root)
    {
        var csprojs = Files(root, "*.csproj")
            .Where(p => !Regex.IsMatch(System.IO.Path.GetFileNameWithoutExtension(p), @"(Test|Tests|DbMigrator)$", RegexOptions.IgnoreCase))
            .ToList();
        var props = Files(root, "*.props").ToList();
        var properties = ReadProperties(props.Concat(csprojs));

        var projects = csprojs.Select(p => ReadProject(p)).ToList();
        var abp = AbpVersion(csprojs.Concat(props), properties);
        var host = new Stack(root, abp, null, projects, null).ApiHost ?? projects.FirstOrDefault(p => p.IsWeb);
        var tfm = host == null ? null : TargetFramework(host.Path, properties);
        return new Stack(root, abp, tfm, projects, FindAngular(root));
    }

    /// <summary>Highest Volo.Abp.* version referenced anywhere (PackageReference, central PackageVersion, $(Property)).</summary>
    public static Version? AbpVersion(IEnumerable<string> files, Dictionary<string, string> properties)
    {
        Version? best = null;
        foreach (var file in files)
        {
            if (Load(file) is not { } xml) continue;
            foreach (var e in xml.Descendants().Where(e => e.Name.LocalName is "PackageReference" or "PackageVersion"))
            {
                var id = (string?)e.Attribute("Include") ?? (string?)e.Attribute("Update");
                if (id == null || !id.StartsWith("Volo.Abp.", StringComparison.OrdinalIgnoreCase)) continue;
                var raw = (string?)e.Attribute("Version") ?? e.Elements().FirstOrDefault(x => x.Name.LocalName == "Version")?.Value;
                if (ParseVersion(Resolve(raw, properties)) is { } v && (best == null || v > best)) best = v;
            }
        }
        return best;
    }

    /// <summary>"11.0.0-rc.2" → 11.0.0; "[10.7.1, )" → 10.7.1; "~11.0.0" / "^11.0.0" → 11.0.0.</summary>
    public static Version? ParseVersion(string? raw)
    {
        var m = Regex.Match(raw ?? "", @"(\d+)\.(\d+)(?:\.(\d+))?");
        return m.Success ? new Version(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : 0) : null;
    }

    private static string? TargetFramework(string csproj, Dictionary<string, string> properties)
    {
        var xml = Load(csproj);
        var value = xml?.Descendants().FirstOrDefault(e => e.Name.LocalName is "TargetFramework" or "TargetFrameworks")?.Value
                    ?? properties.GetValueOrDefault("TargetFramework") ?? properties.GetValueOrDefault("TargetFrameworks");
        return Resolve(value, properties)?.Split(';', StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).LastOrDefault();
    }

    private static DotnetProject ReadProject(string csproj)
    {
        var text = File.ReadAllText(csproj);
        var isWeb = Regex.IsMatch(text, @"Sdk=""Microsoft\.NET\.Sdk\.Web""");
        var hasMvcUi = Regex.IsMatch(text, @"Volo\.Abp\.AspNetCore\.Mvc\.UI\.Theme\.", RegexOptions.IgnoreCase)
                       || Regex.IsMatch(text, @"Volo\.Abp\.Account\.Web", RegexOptions.IgnoreCase);
        return new DotnetProject(csproj, System.IO.Path.GetFileNameWithoutExtension(csproj), isWeb, hasMvcUi, FindModule(System.IO.Path.GetDirectoryName(csproj)!));
    }

    /// <summary>The project's ABP module: a class deriving from AbpModule with a [DependsOn], preferring the project folder itself.</summary>
    private static string? FindModule(string dir) =>
        Directory.EnumerateFiles(dir, "*Module.cs", SearchOption.AllDirectories)
            .Where(f => !SkipDirs.Any(s => f.Contains($"{System.IO.Path.DirectorySeparatorChar}{s}{System.IO.Path.DirectorySeparatorChar}")))
            .Where(f => { var t = File.ReadAllText(f); return t.Contains("[DependsOn(") && Regex.IsMatch(t, @":\s*AbpModule\b"); })
            .OrderBy(f => System.IO.Path.GetDirectoryName(f) == dir ? 0 : 1)
            .FirstOrDefault();

    private static AngularApp? FindAngular(string root)
    {
        foreach (var angularJson in Files(root, "angular.json"))
        {
            var dir = System.IO.Path.GetDirectoryName(angularJson)!;
            var packageJson = System.IO.Path.Combine(dir, "package.json");
            if (!File.Exists(packageJson)) continue;
            using var doc = JsonDocument.Parse(File.ReadAllText(packageJson));
            string? Dep(string name) =>
                new[] { "dependencies", "devDependencies" }.Select(s => doc.RootElement.TryGetProperty(s, out var d) && d.TryGetProperty(name, out var v) ? v.GetString() : null)
                    .FirstOrDefault(v => v != null);
            var abpNg = Dep("@abp/ng.core");
            if (abpNg == null) continue;
            var pm = File.Exists(System.IO.Path.Combine(dir, "pnpm-lock.yaml")) ? "pnpm"
                : File.Exists(System.IO.Path.Combine(dir, "yarn.lock")) ? "yarn" : "npm";
            return new AngularApp(dir, abpNg, Dep("@angular/core"), pm);
        }
        return null;
    }

    private static Dictionary<string, string> ReadProperties(IEnumerable<string> files)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in files)
            foreach (var group in Load(file)?.Descendants().Where(e => e.Name.LocalName == "PropertyGroup" && e.Attribute("Condition") == null) ?? [])
                foreach (var p in group.Elements())
                    result.TryAdd(p.Name.LocalName, p.Value.Trim());
        return result;
    }

    private static string? Resolve(string? value, Dictionary<string, string> properties)
    {
        for (var i = 0; i < 5 && value != null && value.Contains("$("); i++)
            value = Regex.Replace(value, @"\$\(([^)]+)\)", m => properties.GetValueOrDefault(m.Groups[1].Value) ?? m.Value);
        return value;
    }

    private static XDocument? Load(string file)
    {
        try { return XDocument.Load(file); } catch { return null; }
    }

    private static IEnumerable<string> Files(string root, string pattern)
    {
        var stack = new Stack<string>([root]);
        while (stack.Count > 0)
        {
            var dir = stack.Pop();
            IEnumerable<string> files = [], dirs = [];
            try { files = Directory.EnumerateFiles(dir, pattern); dirs = Directory.EnumerateDirectories(dir); } catch { }
            foreach (var f in files) yield return f;
            foreach (var d in dirs)
                if (!SkipDirs.Contains(System.IO.Path.GetFileName(d), StringComparer.OrdinalIgnoreCase)) stack.Push(d);
        }
    }
}
