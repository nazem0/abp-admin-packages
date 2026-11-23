using System;
using System.Collections.Generic;
using System.IO;
using AbpAdmin.Cli;
using Shouldly;
using Xunit;

namespace AbpAdmin.Cli.Tests;

/// <summary>The installer's offline logic: module wiring, stack detection and which package versions fit an app.</summary>
public class InstallerCliTests
{
    [Fact]
    public void Adds_Missing_Modules_To_DependsOn_Once()
    {
        const string multiLine = "[DependsOn(\n    typeof(AbpAutofacModule),\n    typeof(AbpAdmin.AbpAdminIdentityModule)\n)]\npublic class AcmeModule : AbpModule { }";
        var code = Installer.AddDependsOn(multiLine, ["AbpAdmin.AbpAdminIdentityModule", "AbpAdmin.AbpAdminAuditLoggingModule"], out var added);
        added.ShouldBe(["AbpAdmin.AbpAdminAuditLoggingModule"]); // identity was already there
        code.ShouldContain("[DependsOn(\n    typeof(AbpAdmin.AbpAdminAuditLoggingModule),\n    typeof(AbpAutofacModule),");

        Installer.AddDependsOn(code, ["AbpAdmin.AbpAdminAuditLoggingModule"], out added).ShouldBe(code); // idempotent
        added.ShouldBeEmpty();

        Installer.AddDependsOn("[DependsOn(typeof(AbpAutofacModule))]", ["AbpAdmin.Web.AbpAdminWebModule"], out _)
            .ShouldBe("[DependsOn(typeof(AbpAdmin.Web.AbpAdminWebModule), typeof(AbpAutofacModule))]");
        Should.Throw<InvalidOperationException>(() => Installer.AddDependsOn("public class X : AbpModule { }", ["A.B"], out _));
    }

    [Theory]
    [InlineData("10.0.0", "10.6.0", true)]   // a release built on ABP 10.0 fits any 10.x app
    [InlineData("10.7.1", "10.6.0", false)]  // one that needs 10.7.1 doesn't fit 10.6 (NU1605 downgrade)
    [InlineData("10.0.0", "11.0.0", false)]  // other major
    [InlineData("11.0.0", "11.0.0", true)]
    public void Picks_Only_Releases_Whose_Abp_Minimum_Fits(string minimum, string app, bool fits)
    {
        var nuspec = $"""
            <package><metadata><dependencies>
              <group targetFramework="net10.0"><dependency id="Volo.Abp.AspNetCore.Mvc" version="{minimum}" /></group>
              <group targetFramework="net11.0"><dependency id="Volo.Abp.AspNetCore.Mvc" version="{minimum}" /></group>
            </dependencies></metadata></package>
            """;
        Versions.Fits(nuspec, app.StartsWith("11") ? "net11.0" : "net10.0", new Version(app)).ShouldBe(fits);
        Versions.Fits(nuspec, "net9.0", new Version(app)).ShouldBeFalse(); // no build for that framework
    }

    [Fact]
    public void Detects_Abp_Version_Framework_Hosts_And_Module()
    {
        var root = Directory.CreateTempSubdirectory("abp-admin-cli-").FullName;
        try
        {
            // A layered solution: central package versions through a property, an MVC Web project and an API host.
            File.WriteAllText(Path.Combine(root, "common.props"),
                "<Project><PropertyGroup><AbpVersion>10.6.0</AbpVersion><TargetFramework>net10.0</TargetFramework></PropertyGroup></Project>");
            Project(root, "Acme.HttpApi.Host", web: true, refs: "<PackageReference Include=\"Volo.Abp.Autofac\" Version=\"$(AbpVersion)\" />");
            Project(root, "Acme.Web", web: true, refs: "<PackageReference Include=\"Volo.Abp.AspNetCore.Mvc.UI.Theme.LeptonXLite\" Version=\"5.6.0\" />");
            Project(root, "Acme.Domain", web: false, refs: "<PackageReference Include=\"Volo.Abp.Ddd.Domain\" Version=\"10.6.0-rc.1\" />");

            var stack = Detector.Detect(root);
            stack.Abp.ShouldBe(new Version(10, 6, 0));
            stack.TargetFramework.ShouldBe("net10.0");
            stack.ApiHost!.Name.ShouldBe("Acme.HttpApi.Host");
            stack.MvcHost!.Name.ShouldBe("Acme.Web");
            Path.GetFileName(stack.ApiHost.ModuleFile).ShouldBe("Acme.HttpApi.HostModule.cs");
            stack.Angular.ShouldBeNull();
        }
        finally { Directory.Delete(root, true); }
    }

    private static void Project(string root, string name, bool web, string refs)
    {
        var dir = Directory.CreateDirectory(Path.Combine(root, "src", name)).FullName;
        File.WriteAllText(Path.Combine(dir, name + ".csproj"),
            $"<Project Sdk=\"Microsoft.NET.Sdk{(web ? ".Web" : "")}\"><ItemGroup>{refs}</ItemGroup></Project>");
        File.WriteAllText(Path.Combine(dir, name + "Module.cs"), "[DependsOn(typeof(AbpAutofacModule))]\npublic class M : AbpModule { }");
    }
}
