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

namespace AbpAdmin;

/// <summary>
/// ABP resolves a signed-in user's tenant from their token and ignores <c>__tenant</c>. For a host user who may manage
/// tenants' users, the header is honoured on the user-management endpoints only, so the Users page can act in a tenant.
/// </summary>
public class HostUserInTenantResolveContributor : TenantResolveContributorBase
{
    public const string ContributorName = "HostUserInTenant";
    public override string Name => ContributorName;

    private static readonly string[] Paths = ["/api/identity/users", $"/api/{AbpAdminRemoteService.RootPath}/user-lockout"];

    public override async Task ResolveAsync(ITenantResolveContext context)
    {
        var http = context.ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext;
        var tenant = http?.Request.Headers[TenantResolverConsts.DefaultTenantKey].ToString();
        if (http == null || tenant.IsNullOrWhiteSpace()) return;

        var request = http.Request;
        var allowed = Paths.Any(p => request.Path.StartsWithSegments(p))
            || (request.Path.Equals("/api/permission-management/permissions") && request.Query["providerName"] == UserPermissionValueProvider.ProviderName);
        var user = context.ServiceProvider.GetRequiredService<ICurrentUser>();
        if (!allowed || !user.IsAuthenticated || user.TenantId != null) return;

        // Checked in the host, where the user's permissions live (the tenant isn't resolved yet).
        if (!await context.ServiceProvider.GetRequiredService<IPermissionChecker>().IsGrantedAsync(AbpAdminPermissions.Tenants.ManageUsers)) return;

        context.TenantIdOrName = tenant;
        context.Handled = true;
    }
}
