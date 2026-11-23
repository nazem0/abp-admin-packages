using System.Diagnostics;
using System.Text.RegularExpressions;

namespace AbpAdmin.Cli;

/// <summary>A .NET project to change: packages to reference and modules to add to its module's [DependsOn].</summary>
public record DotnetTarget(DotnetProject Project, List<string> Packages, List<string> Modules);

/// <summary>What will be installed, with resolved versions.</summary>
public record Plan(string NuGetVersion, List<DotnetTarget> Dotnet, AngularApp? Angular, List<(string Name, string Version)> Npm, bool AllFeatures, List<Feature> Features);

public static class Installer
{
    /// <summary>Adds typeof(Module) entries to the first [DependsOn(...)] that doesn't have them yet; returns the new source.</summary>
    public static string AddDependsOn(string code, IEnumerable<string> modules, out List<string> added)
    {
        added = [];
        var start = code.IndexOf("[DependsOn(", StringComparison.Ordinal);
        if (start < 0) throw new InvalidOperationException("No [DependsOn(...)] attribute found in the module class.");
        var open = start + "[DependsOn(".Length;
        var missing = modules.Where(m =>
        {
            var shortName = m[(m.LastIndexOf('.') + 1)..];
            return !Regex.IsMatch(code, $@"typeof\(\s*([\w.]+\.)?{Regex.Escape(shortName)}\s*\)");
        }).ToList();
        if (missing.Count == 0) return code;
        added = missing;

        // Multi-line attribute: one entry per line with the existing indentation; single-line: inline.
        var rest = code[open..];
        var lineBreak = rest.StartsWith("\r\n") ? "\r\n" : rest.StartsWith('\n') ? "\n" : null;
        string insert;
        if (lineBreak != null)
        {
            var indent = Regex.Match(rest[lineBreak.Length..], @"^[ \t]*").Value;
            insert = string.Concat(missing.Select(m => $"{lineBreak}{indent}typeof({m}),"));
        }
        else
        {
            insert = string.Concat(missing.Select(m => $"typeof({m}), "));
        }
        return code.Insert(open, insert);
    }

    public static async Task<bool> ApplyAsync(Plan plan, TextWriter log)
    {
        foreach (var target in plan.Dotnet)
        {
            log.WriteLine($"\n▸ {target.Project.Name}");
            foreach (var package in target.Packages)
                if (!await RunAsync("dotnet", ["add", target.Project.Path, "package", package, "--version", plan.NuGetVersion], target.Project.Dir, log))
                    return false;
            // dotnet add can leave a reference that doesn't restore (e.g. a package downgrade): check before going on.
            if (!await RunAsync("dotnet", ["restore", target.Project.Path], target.Project.Dir, log)) return false;
            var file = target.Project.ModuleFile!;
            var code = await File.ReadAllTextAsync(file);
            var updated = AddDependsOn(code, target.Modules, out var added);
            if (added.Count > 0)
            {
                await File.WriteAllTextAsync(file, updated);
                log.WriteLine($"  {Path.GetFileName(file)}: [DependsOn] + {string.Join(", ", added.Select(m => m[(m.LastIndexOf('.') + 1)..]))}");
            }
            else log.WriteLine($"  {Path.GetFileName(file)}: modules already listed");
        }

        if (plan.Angular is { } ng && plan.Npm.Count > 0)
        {
            log.WriteLine($"\n▸ Angular ({Path.GetRelativePath(Directory.GetCurrentDirectory(), ng.Dir)})");
            var verb = ng.PackageManager == "npm" ? "install" : "add";
            if (!await RunAsync(ng.PackageManager, [verb, .. plan.Npm.Select(p => $"{p.Name}@{p.Version}")], ng.Dir, log)) return false;
        }
        return true;
    }

    private static async Task<bool> RunAsync(string tool, string[] args, string dir, TextWriter log)
    {
        log.WriteLine($"  $ {tool} {string.Join(' ', args.Select(a => a.Contains(' ') ? $"\"{a}\"" : a))}");
        // npm/pnpm/yarn are .cmd shims on Windows.
        var windowsShim = OperatingSystem.IsWindows() && tool != "dotnet";
        var info = new ProcessStartInfo(windowsShim ? "cmd.exe" : tool)
        {
            WorkingDirectory = dir, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false,
        };
        if (windowsShim) { info.ArgumentList.Add("/c"); info.ArgumentList.Add(tool); }
        foreach (var a in args) info.ArgumentList.Add(a);
        using var process = Process.Start(info)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode == 0) return true;
        log.WriteLine((await stdout).Trim());
        log.WriteLine((await stderr).Trim());
        log.WriteLine($"  ✗ {tool} exited with {process.ExitCode}");
        return false;
    }
}
