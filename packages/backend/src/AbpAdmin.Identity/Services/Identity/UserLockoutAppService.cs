using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Identity;

namespace AbpAdmin.Services.Identity;

public class LockUserInput
{
    /// <summary>Lock until this time (UTC); null locks indefinitely.</summary>
    public DateTime? Until { get; set; }
}

/// <summary>Lock and unlock accounts; the free Identity module has no endpoint for it.</summary>
[Authorize(IdentityPermissions.Users.Update)]
public class UserLockoutAppService(IdentityUserManager userManager) : AbpAdminAppService
{
    public virtual async Task LockAsync(Guid id, LockUserInput input)
    {
        var user = await userManager.GetByIdAsync(id);
        if (user.Id == CurrentUser.Id) throw new UserFriendlyException("You can't lock your own account.");
        (await userManager.SetLockoutEnabledAsync(user, true)).CheckErrors();
        var until = input.Until.HasValue ? new DateTimeOffset(DateTime.SpecifyKind(input.Until.Value, DateTimeKind.Utc)) : DateTimeOffset.MaxValue;
        (await userManager.SetLockoutEndDateAsync(user, until)).CheckErrors();
    }

    public virtual async Task UnlockAsync(Guid id)
    {
        var user = await userManager.GetByIdAsync(id);
        (await userManager.SetLockoutEndDateAsync(user, null)).CheckErrors();
        (await userManager.ResetAccessFailedCountAsync(user)).CheckErrors();
    }
}
