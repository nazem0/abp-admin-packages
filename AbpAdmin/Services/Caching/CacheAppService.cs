using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Caching;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.FeatureManagement;
using Volo.Abp.Features;
using Volo.Abp.Identity;
using Volo.Abp.PermissionManagement;
using Volo.Abp.SettingManagement;
using Volo.Abp.Settings;
using Volo.Abp.TenantManagement;

namespace AbpAdmin.Services.Caching;

public enum CacheScope
{
    /// <summary>Every user and role, plus global, tenant and feature values (a host also clears every tenant).</summary>
    Everything,
    /// <summary>One user: their permission grants and settings, and the grants of their roles.</summary>
    User,
    /// <summary>One role's permission grants.</summary>
    Role,
}

public class ClearCacheInput
{
    public CacheScope Scope { get; set; }
    /// <summary>User name (Scope = User) or role name (Scope = Role), in the current tenant.</summary>
    public string? Name { get; set; }
}

public class ClearCacheResultDto
{
    public int Tenants { get; set; }
    public int Users { get; set; }
    public int Roles { get; set; }
    /// <summary>Cache keys removed (whether or not they were cached).</summary>
    public int Keys { get; set; }
}

/// <summary>
/// Clears ABP's permission grant, setting and feature value caches, for when a change made outside ABP's managers
/// (SQL, another app, a cache that outlived a restore) doesn't apply. ABP's cache has no "clear all", and its keys are
/// name + provider + key per tenant, so the keys are computed from the definitions and removed one by one.
/// </summary>
// ponytail: Everything removes (permissions + settings) × users keys; batch per page of users if that ever hits 100k+ users.
[Authorize(AbpAdminPermissions.Cache.Default)]
public class CacheAppService(
    IDistributedCache<PermissionGrantCacheItem> permissionCache,
    IDistributedCache<SettingCacheItem> settingCache,
    IDistributedCache<FeatureValueCacheItem> featureCache,
    IPermissionDefinitionManager permissionDefinitions,
    ISettingDefinitionManager settingDefinitions,
    IFeatureDefinitionManager featureDefinitions,
    IRepository<IdentityUser, Guid> users,
    IRepository<IdentityRole, Guid> roles,
    IIdentityUserRepository userRepository,
    ITenantRepository tenants) : ApplicationService
{
    public virtual async Task<ClearCacheResultDto> ClearAsync(ClearCacheInput input)
    {
        var permissions = (await permissionDefinitions.GetPermissionsAsync()).Select(p => p.Name).ToList();
        var settings = (await settingDefinitions.GetAllAsync()).Select(s => s.Name).ToList();
        var result = new ClearCacheResultDto();

        switch (input.Scope)
        {
            case CacheScope.User:
            {
                // The caller's own tenant first; a host (who may see every tenant's users) then finds a tenant's user.
                var name = Normalize(input.Name);
                var user = await users.FirstOrDefaultAsync(u => u.NormalizedUserName == name && u.TenantId == CurrentTenant.Id)
                    ?? (CurrentTenant.IsAvailable ? null : await users.FirstOrDefaultAsync(u => u.NormalizedUserName == name))
                    ?? throw new UserFriendlyException($"There is no user named '{input.Name}'.");
                // Cache keys carry the tenant, so clear in the user's tenant.
                using (CurrentTenant.Change(user.TenantId))
                {
                    var roleNames = await userRepository.GetRoleNamesAsync(user.Id);
                    await ClearUsersAsync(permissions, settings, [user.Id], result);
                    await ClearRolesAsync(permissions, roleNames, result);
                }
                break;
            }

            case CacheScope.Role:
            {
                var name = Normalize(input.Name);
                var role = await roles.FirstOrDefaultAsync(r => r.NormalizedName == name && r.TenantId == CurrentTenant.Id)
                    ?? throw new UserFriendlyException($"There is no role named '{input.Name}'.");
                await ClearRolesAsync(permissions, [role.Name], result);
                break;
            }

            default:
                var features = (await featureDefinitions.GetAllAsync()).Select(f => f.Name).ToList();
                List<Guid?> tenantIds = [CurrentTenant.Id];
                if (!CurrentTenant.IsAvailable) tenantIds.AddRange((await tenants.GetListAsync()).Select(t => (Guid?)t.Id));
                foreach (var tenantId in tenantIds)
                {
                    using (CurrentTenant.Change(tenantId))
                    {
                        result.Tenants += tenantId.HasValue ? 1 : 0;
                        // Global values are cached per tenant too: every tenant reads them through its own keys.
                        await RemoveAsync(settingCache, settings.Select(s => SettingCacheItem.CalculateCacheKey(s, GlobalSettingValueProvider.ProviderName, null)), result);
                        if (tenantId.HasValue)
                            await RemoveAsync(settingCache, settings.Select(s => SettingCacheItem.CalculateCacheKey(s, TenantSettingValueProvider.ProviderName, tenantId.ToString())), result);
                        // A tenant's features are set by the host and read by the tenant, so clear every tenant's keys in every context.
                        await RemoveAsync(featureCache, tenantIds.SelectMany(t => features.Select(f =>
                            FeatureValueCacheItem.CalculateCacheKey(f, TenantFeatureValueProvider.ProviderName, t?.ToString()))), result);
                        await ClearUsersAsync(permissions, settings, await AsyncExecuter.ToListAsync((await users.GetQueryableAsync()).Select(u => u.Id)), result);
                        await ClearRolesAsync(permissions, await AsyncExecuter.ToListAsync((await roles.GetQueryableAsync()).Select(r => r.Name)), result);
                    }
                }
                break;
        }
        return result;
    }

    private async Task ClearUsersAsync(List<string> permissions, List<string> settings, List<Guid> userIds, ClearCacheResultDto result)
    {
        foreach (var id in userIds)
        {
            await RemoveAsync(permissionCache, permissions.Select(p => PermissionGrantCacheItem.CalculateCacheKey(p, UserPermissionValueProvider.ProviderName, id.ToString())), result);
            await RemoveAsync(settingCache, settings.Select(s => SettingCacheItem.CalculateCacheKey(s, UserSettingValueProvider.ProviderName, id.ToString())), result);
        }
        result.Users += userIds.Count;
    }

    private async Task ClearRolesAsync(List<string> permissions, IEnumerable<string> roleNames, ClearCacheResultDto result)
    {
        foreach (var name in roleNames)
        {
            await RemoveAsync(permissionCache, permissions.Select(p => PermissionGrantCacheItem.CalculateCacheKey(p, RolePermissionValueProvider.ProviderName, name)), result);
            result.Roles++;
        }
    }

    private static async Task RemoveAsync<T>(IDistributedCache<T> cache, IEnumerable<string> keys, ClearCacheResultDto result) where T : class
    {
        var list = keys.ToList();
        await cache.RemoveManyAsync(list);
        result.Keys += list.Count;
    }

    private string Normalize(string? name) =>
        name.IsNullOrWhiteSpace() ? throw new UserFriendlyException("Enter a name.") : LookupNormalizer.NormalizeName(name.Trim());

    private Microsoft.AspNetCore.Identity.ILookupNormalizer LookupNormalizer =>
        LazyServiceProvider.LazyGetRequiredService<Microsoft.AspNetCore.Identity.ILookupNormalizer>();
}
