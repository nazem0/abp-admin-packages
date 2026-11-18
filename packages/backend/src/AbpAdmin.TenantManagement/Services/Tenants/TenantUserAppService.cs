using System.Security.Claims;
using System.Security.Principal;
using AbpAdmin.Permissions;
using Volo.Abp;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Identity;
using Volo.Abp.MultiTenancy;
using Volo.Abp.Security.Claims;
using Volo.Abp.TenantManagement;
using Volo.Abp.Users;
using Volo.Abp.PermissionManagement;

namespace AbpAdmin.Services.Tenants;

public class GetTenantUserListInput : PagedAndSortedResultRequestDto
{
    public string? Filter { get; set; }
    /// <summary>Only this tenant's users. With <see cref="HostOnly"/> unset and no id: users of the host and every tenant.</summary>
    public Guid? TenantId { get; set; }
    public bool HostOnly { get; set; }
}

public class TenantUserListResultDto : PagedResultDto<IdentityUserDto>
{
    /// <summary>Tenant id → name for the tenants on this page.</summary>
    public Dictionary<Guid, string> TenantNames { get; set; } = new();
}

/// <summary>
/// The host's view of users across tenants. Editing a tenant's user goes through ABP's own Identity endpoints with
/// the <c>__tenant</c> header; <see cref="HostUserInTenantPermissionValueProvider"/> lets the host user act there.
/// </summary>
[Authorize(AbpAdminPermissions.Tenants.ManageUsers)]
public class TenantUserAppService(IRepository<IdentityUser, Guid> users, IRepository<Tenant, Guid> tenants) : AbpAdminAppService
{
    public virtual async Task<TenantUserListResultDto> GetListAsync(GetTenantUserListInput input)
    {
        using (CurrentTenant.Change(null))
        using (DataFilter.Disable<IMultiTenant>())
        {
            // A deleted tenant (soft delete) keeps its user rows; hide them. Users and tenants belong to different modules,
            // so they may sit in different DbContexts (even databases) that can't join in one query: fetch the ids of the
            // deleted tenants first (usually none), then filter users by them.
            List<Guid> deletedTenants;
            using (DataFilter.Disable<ISoftDelete>())
                deletedTenants = await AsyncExecuter.ToListAsync((await tenants.GetQueryableAsync()).Where(t => t.IsDeleted).Select(t => t.Id));
            var q = await users.GetQueryableAsync();
            if (deletedTenants.Count > 0) q = q.Where(u => u.TenantId == null || !deletedTenants.Contains(u.TenantId.Value));
            if (input.HostOnly) q = q.Where(u => u.TenantId == null);
            else if (input.TenantId != null) q = q.Where(u => u.TenantId == input.TenantId);
            if (!input.Filter.IsNullOrWhiteSpace())
            {
                var f = input.Filter!.Trim();
                q = q.Where(u => u.UserName.Contains(f) || u.Email.Contains(f) || (u.Name != null && u.Name.Contains(f)) || (u.Surname != null && u.Surname.Contains(f)));
            }

            var total = await AsyncExecuter.CountAsync(q);
            var page = await AsyncExecuter.ToListAsync(q.OrderBy(u => u.TenantId).ThenBy(u => u.UserName)
                .Skip(input.SkipCount).Take(input.MaxResultCount));

            var ids = page.Where(u => u.TenantId != null).Select(u => u.TenantId!.Value).Distinct().ToList();
            var names = ids.Count == 0 ? new Dictionary<Guid, string>()
                : (await AsyncExecuter.ToListAsync((await tenants.GetQueryableAsync()).Where(t => ids.Contains(t.Id)))).ToDictionary(t => t.Id, t => t.Name);

            return new TenantUserListResultDto
            {
                TotalCount = total,
                Items = ObjectMapper.Map<List<IdentityUser>, List<IdentityUserDto>>(page),
                TenantNames = names,
            };
        }
    }
}

/// <summary>
/// A host user who may manage tenants' users (<see cref="AbpAdminPermissions.Tenants.ManageUsers"/>) keeps their own
/// user-management permissions (AbpIdentity.Users*) when a request runs inside a tenant (the <c>__tenant</c> header).
/// Nothing else carries over, and tenant users are unaffected.
/// </summary>
public class HostUserInTenantPermissionValueProvider(IPermissionStore store, ICurrentTenant currentTenant, IServiceProvider services)
    : PermissionValueProvider(store), ITransientDependency
{
    public const string ProviderName = "HostInTenant";
    public override string Name => ProviderName;

    public override async Task<PermissionGrantResult> CheckAsync(PermissionValueCheckContext context) =>
        await IsGrantedAsHostAsync(context.Principal, context.Permission.Name) ? PermissionGrantResult.Granted : PermissionGrantResult.Undefined;

    public override async Task<MultiplePermissionGrantResult> CheckAsync(PermissionValuesCheckContext context)
    {
        var result = new MultiplePermissionGrantResult();
        foreach (var p in context.Permissions)
            result.Result[p.Name] = await IsGrantedAsHostAsync(context.Principal, p.Name) ? PermissionGrantResult.Granted : PermissionGrantResult.Undefined;
        return result;
    }

    private async Task<bool> IsGrantedAsHostAsync(ClaimsPrincipal? principal, string permission)
    {
        if (currentTenant.Id == null || principal?.FindUserId() == null || principal.FindTenantId() != null
            || !permission.StartsWith(IdentityPermissions.Users.Default)) return false;

        using (currentTenant.Change(null)) // checked as the host user they are
        {
            var checker = services.GetRequiredService<IPermissionChecker>();
            return await checker.IsGrantedAsync(principal, AbpAdminPermissions.Tenants.ManageUsers)
                && await checker.IsGrantedAsync(principal, permission);
        }
    }
}
