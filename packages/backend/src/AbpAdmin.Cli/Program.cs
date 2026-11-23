using AbpAdmin.Cli;

// abp-admin [--path <dir>] [--features all|identity,audit-logging,...] [--ui razor,angular,api] [--yes] [--dry-run]
var opts = Options.Parse(args);
if (opts.Help) { Console.WriteLine(Options.Usage); return 0; }

var root = Path.GetFullPath(opts.Path ?? Directory.GetCurrentDirectory());
Console.WriteLine($"ABP Admin installer\nScanning {root} ...");
var stack = Detector.Detect(root);

// ---------- what the app is built on ----------
if (stack.Abp == null || stack.TargetFramework == null || stack.ApiHost == null)
{
    Console.WriteLine("✗ No ABP application found here (looked for a web project referencing Volo.Abp.* packages). Run it from your solution folder, or pass --path.");
    return 1;
}
var abpMajor = stack.Abp.Major;
Console.WriteLine($"\n  ABP      {stack.Abp} (.NET target {stack.TargetFramework})");
Console.WriteLine($"  API host {stack.ApiHost.Name}");
Console.WriteLine($"  MVC UI   {stack.MvcHost?.Name ?? "none"}");
Console.WriteLine($"  Angular  {(stack.Angular is { } a ? $"{Path.GetRelativePath(root, a.Dir)} (@abp/ng.core {a.AbpNgVersion}, {a.PackageManager})" : "none")}");
if (abpMajor < 10)
{
    Console.WriteLine($"\n✗ ABP Admin supports ABP 10 and 11; this app is on ABP {stack.Abp}. Upgrade ABP first.");
    return 1;
}

// ---------- choices ----------
var selected = opts.Features ?? (opts.Yes ? Catalog.Features.ToHashSet() : null);
var uis = opts.Uis ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
if (opts.Uis == null)
{
    // Angular apps keep an MVC theme for the sign-in pages only, so an Angular app means the Angular UI.
    uis.Add(stack.Angular != null ? "angular" : stack.MvcHost != null ? "razor" : "api");
}
if (selected == null) (selected, uis) = Menu.Choose(stack, uis);
if (uis.Contains("razor") && stack.MvcHost == null) { Console.WriteLine("✗ Razor Pages needs an ABP MVC project (one with an MVC theme); none was found."); return 1; }
if (uis.Contains("angular") && stack.Angular == null) { Console.WriteLine("✗ No Angular app with @abp/ng.core was found."); return 1; }

// ---------- versions ----------
Console.WriteLine("\nLooking up the newest packages for this stack ...");
using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
http.DefaultRequestHeaders.UserAgent.ParseAdd("AbpAdmin.Cli");
var versions = new Versions(http);
var all = selected.Count == Catalog.Features.Length;
var features = Catalog.Features.Where(selected.Contains).ToList();

var nugetVersion = await versions.NuGetAsync(Catalog.CorePackage, stack.TargetFramework, stack.Abp);
if (nugetVersion == null)
{
    Console.WriteLine($"✗ No ABP Admin release on nuget.org fits {stack.TargetFramework} with ABP {stack.Abp} (each release needs a minimum ABP version).");
    Console.WriteLine("  Upgrade ABP to its latest minor, or use a newer ABP Admin when it's out.");
    return 1;
}

var targets = new List<DotnetTarget>();
if (uis.Contains("razor"))
    targets.Add(all
        ? new DotnetTarget(stack.MvcHost!, [Catalog.AllWebPackage], [Catalog.AllWebModule])
        : new DotnetTarget(stack.MvcHost!, [Catalog.CoreWebPackage, .. features.Select(f => f.WebPackage)], [Catalog.CoreWebModule, .. features.Select(f => f.WebModule)]));
// The APIs for Angular (or API only) go to the API host, unless the Razor packages (which include them) already went there.
if ((uis.Contains("angular") || uis.Contains("api")) && !(uis.Contains("razor") && stack.ApiHost.Path == stack.MvcHost!.Path))
    targets.Add(all
        ? new DotnetTarget(stack.ApiHost, [Catalog.AllPackage], [Catalog.AllModule])
        : new DotnetTarget(stack.ApiHost, features.Count > 0 ? features.Select(f => f.Package).ToList() : [Catalog.CorePackage],
            features.Count > 0 ? features.Select(f => f.Module).ToList() : ["AbpAdmin.AbpAdminCoreModule"]));
foreach (var package in targets.SelectMany(t => t.Packages).Distinct())
    if (!await versions.NuGetHasAsync(package, nugetVersion))
    {
        Console.WriteLine($"✗ {package} has no {nugetVersion} release (it may be newer than the version that fits your stack). Leave that feature out.");
        return 1;
    }

var npm = new List<(string, string)>();
if (uis.Contains("angular"))
{
    var ng = stack.Angular!;
    var abpNg = Detector.ParseVersion(ng.AbpNgVersion)!.Major;
    var angularMajor = Detector.ParseVersion(ng.AngularVersion)?.Major;
    var core = await versions.NpmAsync(Catalog.CoreNpm, abpNg, angularMajor);
    if (core == null)
    {
        Console.WriteLine($"✗ No ABP Admin Angular release supports @abp/ng.core {abpNg}.x (Angular {angularMajor}); the Angular packages need ABP 11.");
        Console.WriteLine("  Run again with --ui api (backend only) or --ui razor (the Razor Pages console in an MVC project).");
        return 1;
    }
    foreach (var name in all ? [Catalog.AllNpm] : features.Select(f => f.Npm).Prepend(Catalog.CoreNpm))
    {
        var version = name == Catalog.CoreNpm ? core : await versions.NpmAsync(name, abpNg, angularMajor, core);
        if (version == null) { Console.WriteLine($"✗ {name} has no release that fits @abp/ng.core {abpNg}.x and {Catalog.CoreNpm} {core}."); return 1; }
        npm.Add((name, version));
    }
}
var plan = new Plan(nugetVersion, targets, uis.Contains("angular") ? stack.Angular : null, npm, all, features);

// ---------- plan, confirm, apply ----------
Console.WriteLine("\nPlan");
foreach (var t in plan.Dotnet)
{
    Console.WriteLine($"  {t.Project.Name}");
    foreach (var p in t.Packages) Console.WriteLine($"    + {p} {plan.NuGetVersion}");
    Console.WriteLine($"    [DependsOn] in {Path.GetFileName(t.Project.ModuleFile)}: {string.Join(", ", t.Modules.Select(m => m[(m.LastIndexOf('.') + 1)..]))}");
}
if (plan.Angular != null)
{
    Console.WriteLine($"  {Path.GetRelativePath(root, plan.Angular.Dir)} ({plan.Angular.PackageManager})");
    foreach (var (n, v) in plan.Npm) Console.WriteLine($"    + {n}@{v}");
}
if (opts.DryRun) { Console.WriteLine("\n(dry run: nothing changed)"); return 0; }
if (!opts.Yes && !Menu.Confirm("\nApply? [Y/n] ")) { Console.WriteLine("Nothing changed."); return 0; }

if (!await Installer.ApplyAsync(plan, Console.Out)) { Console.WriteLine("\n✗ Stopped. Fix the error above and run the installer again; finished steps are skipped."); return 1; }

// ---------- what's left for the developer ----------
Console.WriteLine("\n✓ Installed. Next steps:");
var step = 1;
Console.WriteLine($"  {step++}. Run your DbMigrator (or --migrate-database) once: it grants the new AbpAdmin.* permissions to admin.");
if (plan.Angular is { } app)
{
    var route = all
        ? "{ path: 'admin', loadChildren: () => import('@nazem0/abp-admin-ng').then(m => m.ABP_ADMIN_ROUTES) },"
        : "{ path: 'admin', loadChildren: async () => (await import('@nazem0/abp-admin-ng-core')).abpAdminRoutes(\n" +
          string.Join(",\n", plan.Features.Select(f => $"      (await import('{f.Npm}')).{f.NgFeature}")) + ") },";
    Console.WriteLine($"  {step++}. Add the route to your Angular routes (e.g. app.routes.ts):\n\n    {route}\n");
    var config = Directory.EnumerateFiles(app.Dir, "app.config.ts", SearchOption.AllDirectories).FirstOrDefault(f => !f.Contains("node_modules"));
    if (config == null || !File.ReadAllText(config).Contains("withComponentInputBinding"))
        Console.WriteLine($"  {step++}. Enable component input binding: provideRouter(routes, withComponentInputBinding()) in app.config.ts.");
}
if (uis.Contains("razor")) Console.WriteLine($"  {step++}. Open /AbpAdmin in your MVC app.");
if (plan.Features.Any(f => f.Key == "event-bus") || all)
    Console.WriteLine($"  {step++}. Events lists EF Core outboxes/inboxes: configure AbpDistributedEventBusOptions with UseDbContext<YourDbContext>() (see the README).");
Console.WriteLine($"  {step}. Recommended: entity history for all entities, a UTC clock and app.UseAbpTimeZone() (README → Add it to an ABP application).");
return 0;

/// <summary>Command-line options; anything not given is detected or asked for.</summary>
record Options(string? Path, HashSet<Feature>? Features, HashSet<string>? Uis, bool Yes, bool DryRun, bool Help)
{
    public const string Usage = """
        Adds ABP Admin to the ABP application in the current folder.

          abp-admin [options]

          --path <dir>          solution folder (default: current folder)
          --features <list>     all, or a comma list: audit-logging, identity, openiddict, background-jobs, event-bus,
                                tenant-management, entity-explorer (default: ask)
          --ui <list>           razor, angular, api (default: what the app has)
          --yes                 no questions: everything, or the given --features/--ui
          --dry-run             show the plan, change nothing
        """;

    public static Options Parse(string[] args)
    {
        string? Value(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
        HashSet<Feature>? features = null;
        if (Value("--features") is { } f)
        {
            var keys = f.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            features = keys.Contains("all", StringComparer.OrdinalIgnoreCase)
                ? Catalog.Features.ToHashSet()
                : keys.Select(k => Catalog.Features.FirstOrDefault(x => x.Key == k) ?? throw new ArgumentException($"Unknown feature '{k}'.")).ToHashSet();
        }
        var uis = Value("--ui")?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return new Options(Value("--path"), features, uis, args.Contains("--yes"), args.Contains("--dry-run"), args.Contains("--help") || args.Contains("-h"));
    }
}

/// <summary>The interactive menu: toggle features and UIs by number/letter, Enter to continue.</summary>
static class Menu
{
    public static (HashSet<Feature>, HashSet<string>) Choose(Stack stack, HashSet<string> uis)
    {
        var picked = Catalog.Features.ToHashSet();
        var options = new List<(string Key, string Label, bool Available)>
        {
            ("r", $"Razor Pages console{(stack.MvcHost is { } m ? $" (in {m.Name})" : " (no MVC project found)")}", stack.MvcHost != null),
            ("n", $"Angular UI{(stack.Angular is { } a ? $" ({Path.GetRelativePath(stack.Root, a.Dir)})" : " (no Angular app found)")}", stack.Angular != null),
            ("p", "APIs only (no UI from ABP Admin)", true),
        };
        string Ui(string key) => key switch { "r" => "razor", "n" => "angular", _ => "api" };
        while (true)
        {
            Console.WriteLine("\nFeatures (the overview, settings and permission pages are always included):");
            for (var i = 0; i < Catalog.Features.Length; i++)
            {
                var f = Catalog.Features[i];
                Console.WriteLine($"  [{(picked.Contains(f) ? "x" : " ")}] {i + 1}  {f.Title,-22} {f.Description}");
            }
            Console.WriteLine("\nUI:");
            foreach (var (key, label, available) in options)
                Console.WriteLine($"  [{(uis.Contains(Ui(key)) ? "x" : " ")}] {key}  {label}");
            Console.Write("\nToggle with numbers/letters (e.g. 3 5 n), a = all features, x = none, Enter = continue: ");
            var input = Console.ReadLine()?.Trim() ?? "";
            if (input == "")
            {
                if (uis.Count == 0) { Console.WriteLine("Pick at least one UI (or p for APIs only)."); continue; }
                return (picked, uis);
            }
            foreach (var token in input.Split([' ', ','], StringSplitOptions.RemoveEmptyEntries))
            {
                if (token == "a") picked = Catalog.Features.ToHashSet();
                else if (token == "x") picked.Clear();
                else if (int.TryParse(token, out var n) && n >= 1 && n <= Catalog.Features.Length)
                {
                    var f = Catalog.Features[n - 1];
                    if (!picked.Remove(f)) picked.Add(f);
                }
                else if (options.FirstOrDefault(o => o.Key == token) is { Key: not null } o)
                {
                    if (!o.Available) { Console.WriteLine($"  {o.Label}"); continue; }
                    if (!uis.Remove(Ui(o.Key))) uis.Add(Ui(o.Key));
                }
                else Console.WriteLine($"  Unknown choice '{token}'.");
            }
        }
    }

    public static bool Confirm(string question)
    {
        Console.Write(question);
        var answer = Console.ReadLine()?.Trim().ToLowerInvariant();
        return answer is "" or "y" or "yes";
    }
}
