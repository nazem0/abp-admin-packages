using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Volo.Abp.Auditing;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.EventBus.Distributed;
using Volo.Abp.SimpleStateChecking;

namespace AbpAdmin.Permissions;

/// <summary>
/// Turns an ABP Admin area off when the host isn't set up for it, so nothing needs configuring: a disabled
/// permission is never granted, and the UI already hides pages, nav items and commands by permission.
/// </summary>
public class HostSupportStateChecker(Func<IServiceProvider, bool> isSupported) : ISimpleStateChecker<PermissionDefinition>
{
    public Task<bool> IsEnabledAsync(SimpleStateCheckerContext<PermissionDefinition> context) =>
        Task.FromResult(isSupported(context.ServiceProvider));

    /// <summary>The host registered <typeparamref name="T"/>: e.g. a repository comes from the module's EF Core / MongoDB integration.</summary>
    public static HostSupportStateChecker Has<T>() =>
        new(sp => sp.GetRequiredService<IServiceProviderIsService>().IsService(typeof(T)));

    /// <summary>Auditing is on (AbpAuditingOptions.IsEnabled) and audit logs are stored.</summary>
    public static HostSupportStateChecker Auditing<TRepository>() =>
        new(sp => sp.GetRequiredService<IOptions<AbpAuditingOptions>>().Value.IsEnabled
                  && sp.GetRequiredService<IServiceProviderIsService>().IsService(typeof(TRepository)));

    /// <summary>The host handles <typeparamref name="TEvent"/> (ABP's pattern for setting up tenant databases).</summary>
    public static HostSupportStateChecker Handles<TEvent>() =>
        new(sp => sp.GetRequiredService<IOptions<AbpDistributedEventBusOptions>>().Value.Handlers
            .Any(typeof(IDistributedEventHandler<TEvent>).IsAssignableFrom));
}

public static class PermissionDefinitionHostSupportExtensions
{
    /// <summary>Adds the checker to the permission and all its children.</summary>
    public static PermissionDefinition RequireHost(this PermissionDefinition permission, HostSupportStateChecker checker)
    {
        permission.StateCheckers.Add(checker);
        foreach (var child in permission.Children) child.RequireHost(checker);
        return permission;
    }
}
