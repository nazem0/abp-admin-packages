using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp.Application.Services;
using Volo.Abp.AuditLogging;
using Volo.Abp.BackgroundJobs;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Identity;
using Volo.Abp.OpenIddict.Applications;

namespace AbpAdmin.Services.Dashboard;

/// <summary>Headline numbers for the overview page. Each section is null when the caller lacks its permission.</summary>
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

[Authorize]
public class DashboardAppService(
    IRepository<IdentityUser, Guid> users,
    IRepository<IdentityRole, Guid> roles,
    IRepository<OpenIddictApplication, Guid> applications,
    IRepository<AuditLog, Guid> auditLogs,
    IRepository<IdentitySecurityLog, Guid> securityLogs,
    IRepository<BackgroundJobRecord, Guid> jobs) : AbpAdminAppService
{
    public virtual async Task<DashboardDto> GetAsync()
    {
        var now = Clock.Now;
        var since = now.AddHours(-24);
        var dto = new DashboardDto();

        if (await AuthorizationService.IsGrantedAsync(IdentityPermissions.Users.Default))
        {
            var q = await users.GetQueryableAsync();
            var weekAgo = now.AddDays(-7);
            var utcNow = DateTimeOffset.UtcNow;
            dto.Users = new DashboardUsersDto
            {
                Total = await AsyncExecuter.CountAsync(q),
                Inactive = await AsyncExecuter.CountAsync(q.Where(u => !u.IsActive)),
                // DateTimeOffset comparison isn't translatable on every provider (SQLite); only users with a lockout date are read.
                Locked = (await AsyncExecuter.ToListAsync(q.Where(u => u.LockoutEnd != null).Select(u => u.LockoutEnd))).Count(e => e > utcNow),
                NewLast7Days = await AsyncExecuter.CountAsync(q.Where(u => u.CreationTime >= weekAgo)),
            };
        }
        if (await AuthorizationService.IsGrantedAsync(IdentityPermissions.Roles.Default))
            dto.Roles = (int)await roles.GetCountAsync();
        if (await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.Applications.Default))
            dto.Applications = (int)await applications.GetCountAsync();
        if (await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.AuditLogs.Default))
        {
            var q = (await auditLogs.GetQueryableAsync()).Where(a => a.ExecutionTime >= since);
            var count = await AsyncExecuter.CountAsync(q);
            dto.Requests = new DashboardRequestsDto
            {
                Last24Hours = count,
                Failed = await AsyncExecuter.CountAsync(q.Where(a => a.HttpStatusCode >= 400 || (a.Exceptions != null && a.Exceptions != ""))),
                AverageMs = count == 0 ? 0 : (int)await AsyncExecuter.AverageAsync(q.Select(a => (double)a.ExecutionDuration)),
            };
        }
        if (await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.SecurityLogs.Default))
        {
            var q = (await securityLogs.GetQueryableAsync()).Where(s => s.CreationTime >= since);
            dto.SignIns = new DashboardSignInsDto
            {
                Succeeded = await AsyncExecuter.CountAsync(q.Where(s => s.Action == IdentitySecurityLogActionConsts.LoginSucceeded)),
                Failed = await AsyncExecuter.CountAsync(q.Where(s => s.Action != null && s.Action.StartsWith("Login")
                    && s.Action != IdentitySecurityLogActionConsts.LoginSucceeded)),
                Lockouts = await AsyncExecuter.CountAsync(q.Where(s => s.Action == IdentitySecurityLogActionConsts.LoginLockedout)),
            };
        }
        if (await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.BackgroundJobs.Default))
        {
            var q = await jobs.GetQueryableAsync();
            dto.Jobs = new DashboardJobsDto
            {
                Waiting = await AsyncExecuter.CountAsync(q.Where(j => !j.IsAbandoned)),
                Abandoned = await AsyncExecuter.CountAsync(q.Where(j => j.IsAbandoned)),
            };
        }
        return dto;
    }
}
