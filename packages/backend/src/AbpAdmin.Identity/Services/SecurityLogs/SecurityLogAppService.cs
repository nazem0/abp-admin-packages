using AbpAdmin.Localization;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Riok.Mapperly.Abstractions;
using Volo.Abp.Application.Services;
using Volo.Abp.Content;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Identity;

namespace AbpAdmin.Services.SecurityLogs;

/// <summary>Identity security log (sign-ins, failures, lockouts, password changes), projected in SQL.</summary>
[Authorize(AbpAdminPermissions.SecurityLogs.Default)]
public class SecurityLogAppService : ProjectedReadOnlyAppService<IdentitySecurityLog, SecurityLogDto, Guid, GetSecurityLogListInput>
{
    public SecurityLogAppService(IRepository<IdentitySecurityLog, Guid> repository) : base(repository)
    {
        LocalizationResource = typeof(AbpAdminResource);
        GetPolicyName = GetListPolicyName = AbpAdminPermissions.SecurityLogs.Default;
    }

    protected override IQueryable<SecurityLogDto> ProjectTo(IQueryable<IdentitySecurityLog> query) => SecurityLogDtoProjector.ProjectTo(query);

    protected override async Task<IQueryable<IdentitySecurityLog>> CreateFilteredQueryAsync(GetSecurityLogListInput input) =>
        Filter(await ReadOnlyRepository.GetQueryableAsync(), input.StartTime, input.EndTime)
            .WhereIf(!input.ActionName.IsNullOrWhiteSpace(), x => x.Action == input.ActionName)
            .WhereIf(!input.UserName.IsNullOrWhiteSpace(), x => x.UserName != null && x.UserName.Contains(input.UserName!))
            .WhereIf(input.UserId.HasValue, x => x.UserId == input.UserId)
            .WhereIf(!input.ClientId.IsNullOrWhiteSpace(), x => x.ClientId == input.ClientId)
            .WhereIf(!input.ClientIpAddress.IsNullOrWhiteSpace(), x => x.ClientIpAddress == input.ClientIpAddress)
            .WhereIf(!input.CorrelationId.IsNullOrWhiteSpace(), x => x.CorrelationId == input.CorrelationId)
            .WhereIf(input.FailedOnly == true, x => x.Action != null && x.Action.StartsWith("Login")
                && x.Action != IdentitySecurityLogActionConsts.LoginSucceeded);

    protected override IQueryable<IdentitySecurityLog> ApplyDefaultSorting(IQueryable<IdentitySecurityLog> query) =>
        query.OrderByDescending(x => x.CreationTime);

    /// <summary>The filtered list (ignoring paging) as CSV, newest first, up to <see cref="Csv.MaxExportRows"/> rows.</summary>
    [Microsoft.AspNetCore.Mvc.HttpGet]
    public virtual async Task<IRemoteStreamContent> ExportAsync(GetSecurityLogListInput input)
    {
        await CheckGetListPolicyAsync();
        var rows = await AsyncExecuter.ToListAsync(ApplyDefaultSorting(await CreateFilteredQueryAsync(input)).Take(Csv.MaxExportRows));
        return Csv.File("security-logs.csv",
            ["Time", "Action", "UserName", "Tenant", "Identity", "ClientId", "ClientIp", "Browser", "CorrelationId", "Application"],
            rows.Select(x => new[]
            {
                Csv.Time(Clock, x.CreationTime), x.Action, x.UserName, x.TenantName, x.Identity, x.ClientId, x.ClientIpAddress,
                x.BrowserInfo, x.CorrelationId, x.ApplicationName,
            }));
    }

    /// <summary>Event counts per action in the window; drives the summary tiles and the action filter.</summary>
    public virtual async Task<List<SecurityLogActionCountDto>> GetActionCountsAsync(DateTime? startTime, DateTime? endTime)
    {
        await CheckGetListPolicyAsync();
        var query = Filter(await ReadOnlyRepository.GetQueryableAsync(), startTime, endTime)
            .GroupBy(x => x.Action)
            .Select(g => new SecurityLogActionCountDto { Action = g.Key ?? "", Count = g.Count() })
            .OrderByDescending(x => x.Count);
        return await AsyncExecuter.ToListAsync(query);
    }

    private static IQueryable<IdentitySecurityLog> Filter(IQueryable<IdentitySecurityLog> query, DateTime? start, DateTime? end) =>
        query.WhereIf(start.HasValue, x => x.CreationTime >= start).WhereIf(end.HasValue, x => x.CreationTime <= end);
}

[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public static partial class SecurityLogDtoProjector
{
    public static partial IQueryable<SecurityLogDto> ProjectTo(IQueryable<IdentitySecurityLog> query);
}
