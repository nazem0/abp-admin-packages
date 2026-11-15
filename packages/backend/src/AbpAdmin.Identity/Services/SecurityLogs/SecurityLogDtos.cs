using Volo.Abp.Application.Dtos;

namespace AbpAdmin.Services.SecurityLogs;

public class SecurityLogDto : EntityDto<Guid>
{
    public string? ApplicationName { get; set; }
    /// <summary>Which sign-in surface produced the event, e.g. "Identity" or "IdentityExternal".</summary>
    public string? Identity { get; set; }
    /// <summary>LoginSucceeded, LoginFailed, LoginLockedout, Logout, ChangePassword, …</summary>
    public string? Action { get; set; }
    public Guid? UserId { get; set; }
    public string? UserName { get; set; }
    public string? ClientId { get; set; }
    public string? CorrelationId { get; set; }
    public string? ClientIpAddress { get; set; }
    public string? BrowserInfo { get; set; }
    public DateTime CreationTime { get; set; }
}

public class GetSecurityLogListInput : PagedAndSortedResultRequestDto
{
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    /// <summary>Exact action, e.g. LoginSucceeded. (Not named "Action": MVC would bind its {action} route value into it.)</summary>
    public string? ActionName { get; set; }
    public string? UserName { get; set; }
    public Guid? UserId { get; set; }
    public string? ClientId { get; set; }
    public string? ClientIpAddress { get; set; }
    public string? CorrelationId { get; set; }
    /// <summary>Only failed sign-in attempts (any Login* action other than LoginSucceeded).</summary>
    public bool? FailedOnly { get; set; }
}

public class SecurityLogActionCountDto
{
    public string Action { get; set; } = "";
    public int Count { get; set; }
}
