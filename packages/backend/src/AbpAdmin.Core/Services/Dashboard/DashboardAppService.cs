using Microsoft.AspNetCore.Authorization;
using Volo.Abp.Domain.Services;

namespace AbpAdmin.Services.Dashboard;

/// <summary>Headline numbers for the overview page. A section is null when its feature isn't installed or the caller lacks its permission.</summary>
public class DashboardDto
{
    public DashboardUsersDto? Users { get; set; }
    public int? Roles { get; set; }
    public int? Applications { get; set; }
    public DashboardRequestsDto? Requests { get; set; }
    public DashboardSignInsDto? SignIns { get; set; }
    public DashboardJobsDto? Jobs { get; set; }
}

public class DashboardUsersDto { public int Total { get; set; } public int Inactive { get; set; } public int Locked { get; set; } public int NewLast7Days { get; set; } }
public class DashboardRequestsDto { public int Last24Hours { get; set; } public int Failed { get; set; } public int AverageMs { get; set; } }
public class DashboardSignInsDto { public int Succeeded { get; set; } public int Failed { get; set; } public int Lockouts { get; set; } }
public class DashboardJobsDto { public int Waiting { get; set; } public int Abandoned { get; set; } }

/// <summary>A feature package's part of the dashboard. Register with <c>context.Services.AddTransient&lt;IAbpAdminDashboardContributor, T&gt;()</c>.</summary>
public interface IAbpAdminDashboardContributor
{
    Task ContributeAsync(DashboardDto dashboard);
}

/// <summary>Base for contributors: query helpers, the clock, and permission checks for the current user.</summary>
public abstract class AbpAdminDashboardContributor : DomainService, IAbpAdminDashboardContributor
{
    protected IAuthorizationService AuthorizationService => LazyServiceProvider.LazyGetRequiredService<IAuthorizationService>();
    protected Task<bool> IsGrantedAsync(string policy) => AuthorizationService.IsGrantedAsync(policy);
    protected DateTime Since24Hours => Clock.Now.AddHours(-24);
    public abstract Task ContributeAsync(DashboardDto dashboard);
}

[Authorize]
public class DashboardAppService : AbpAdminAppService
{
    public virtual async Task<DashboardDto> GetAsync()
    {
        var dto = new DashboardDto();
        foreach (var contributor in LazyServiceProvider.LazyGetRequiredService<IEnumerable<IAbpAdminDashboardContributor>>())
            await contributor.ContributeAsync(dto);
        return dto;
    }
}
