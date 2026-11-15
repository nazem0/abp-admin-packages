using AbpAdmin.Localization;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Riok.Mapperly.Abstractions;
using Volo.Abp.Application.Services;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Identity;
using Volo.Abp.ObjectMapping;

namespace AbpAdmin.Services.SecurityLogs;

/// <summary>Identity security log (sign-ins, failures, lockouts, password changes), projected in SQL.</summary>
[Authorize(AbpAdminPermissions.SecurityLogs.Default)]
public class SecurityLogAppService : ReadOnlyAppService<IdentitySecurityLog, SecurityLogDto, Guid, GetSecurityLogListInput>
{
    public SecurityLogAppService(IRepository<IdentitySecurityLog, Guid> repository) : base(repository)
    {
        LocalizationResource = typeof(AbpAdminResource);
        GetPolicyName = GetListPolicyName = AbpAdminPermissions.SecurityLogs.Default;
    }

    protected override async Task<IQueryable<IdentitySecurityLog>> CreateEntityQueryOrNullAsync(Guid id) =>
        (await ReadOnlyRepository.GetQueryableAsync()).Where(x => x.Id == id);

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
[ExposeServices(typeof(IQueryProjector<IdentitySecurityLog, SecurityLogDto>))]
public partial class SecurityLogDtoProjector : IQueryProjector<IdentitySecurityLog, SecurityLogDto>, ITransientDependency
{
    public partial IQueryable<SecurityLogDto> ProjectTo(IQueryable<IdentitySecurityLog> query);
}
