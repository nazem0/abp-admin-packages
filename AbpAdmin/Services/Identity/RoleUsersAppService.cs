using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Volo.Abp;
using Volo.Abp.Identity;

namespace AbpAdmin.Services.Identity;

public class MoveAllUsersDto
{
    /// <summary>Role to put the users in; null just takes them out of the role.</summary>
    public Guid? TargetRoleId { get; set; }
}

public class MoveAllUsersResultDto
{
    public int Moved { get; set; }
}

/// <summary>Bulk role membership: move every user of a role to another one (or out of it), e.g. before deleting it.</summary>
[Authorize(IdentityPermissions.Roles.Update)]
[Authorize(IdentityPermissions.Users.Update)]
public class RoleUsersAppService(IdentityUserManager users, IIdentityRoleRepository roles, IIdentityUserRepository userRepository) : AbpAdminAppService
{
    public virtual async Task<MoveAllUsersResultDto> MoveAllUsersAsync(Guid id, MoveAllUsersDto input)
    {
        var role = await roles.GetAsync(id);
        var target = input.TargetRoleId is { } targetId ? await roles.GetAsync(targetId) : null;
        if (target?.Id == role.Id) throw new UserFriendlyException("Pick a different role to move the users to.");

        var members = await userRepository.GetListByNormalizedRoleNameAsync(role.NormalizedName, includeDetails: true);
        foreach (var user in members)
        {
            (await users.RemoveFromRoleAsync(user, role.Name)).CheckErrors();
            if (target != null && !user.IsInRole(target.Id)) (await users.AddToRoleAsync(user, target.Name)).CheckErrors();
        }
        return new MoveAllUsersResultDto { Moved = members.Count };
    }
}
