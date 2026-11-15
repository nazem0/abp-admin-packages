using System.ComponentModel.DataAnnotations;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Identity;

namespace AbpAdmin.Services.Identity;

public class OrganizationUnitDto : EntityDto<Guid>
{
    public Guid? ParentId { get; set; }
    /// <summary>Hierarchical code ("00001.00002"); sorting by it gives tree order.</summary>
    public string Code { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public int MemberCount { get; set; }
    public int RoleCount { get; set; }
}

public class CreateOrganizationUnitDto
{
    public Guid? ParentId { get; set; }
    [Required, StringLength(128)] public string DisplayName { get; set; } = "";
}

public class UpdateOrganizationUnitDto
{
    [Required, StringLength(128)] public string DisplayName { get; set; } = "";
}

public class MoveOrganizationUnitDto
{
    /// <summary>New parent; null moves the unit to the root.</summary>
    public Guid? NewParentId { get; set; }
}

public class OrganizationUnitMemberDto : EntityDto<Guid>
{
    public string UserName { get; set; } = "";
    public string? Name { get; set; }
    public string? Surname { get; set; }
    public string? Email { get; set; }
}

public class OrganizationUnitRoleDto : EntityDto<Guid>
{
    public string Name { get; set; } = "";
}

public class GetOrganizationUnitMembersInput : PagedAndSortedResultRequestDto
{
    public string? Filter { get; set; }
}

public class IdListDto
{
    [Required] public List<Guid> Ids { get; set; } = new();
}

/// <summary>
/// Organization units: a tree of departments/teams. Members inherit every role assigned to their unit
/// (and its parents), so units are a way to grant permissions by structure. Domain logic is ABP's
/// OrganizationUnitManager; the free Identity module just ships no API or UI for it.
/// </summary>
[Authorize(AbpAdminPermissions.OrganizationUnits.Default)]
public class OrganizationUnitAppService(
    IOrganizationUnitRepository repository,
    OrganizationUnitManager manager,
    IdentityUserManager userManager,
    IIdentityRoleRepository roleRepository) : AbpAdminAppService
{
    /// <summary>The whole tree, flat and in tree order (sorted by Code).</summary>
    public virtual async Task<List<OrganizationUnitDto>> GetTreeAsync()
    {
        var units = await repository.GetListAsync(includeDetails: true);
        var result = new List<OrganizationUnitDto>();
        // ponytail: one count query per unit; fine for hundreds of units, batch it if trees get huge.
        foreach (var ou in units.OrderBy(x => x.Code))
        {
            result.Add(new OrganizationUnitDto
            {
                Id = ou.Id,
                ParentId = ou.ParentId,
                Code = ou.Code,
                DisplayName = ou.DisplayName,
                MemberCount = await repository.GetMembersCountAsync(ou),
                RoleCount = ou.Roles.Count,
            });
        }
        return result;
    }

    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageTree)]
    public virtual async Task<OrganizationUnitDto> CreateAsync(CreateOrganizationUnitDto input)
    {
        var ou = new OrganizationUnit(GuidGenerator.Create(), input.DisplayName.Trim(), input.ParentId, CurrentTenant.Id);
        await manager.CreateAsync(ou);
        await CurrentUnitOfWork!.SaveChangesAsync();
        return new OrganizationUnitDto { Id = ou.Id, ParentId = ou.ParentId, Code = ou.Code, DisplayName = ou.DisplayName };
    }

    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageTree)]
    public virtual async Task UpdateAsync(Guid id, UpdateOrganizationUnitDto input)
    {
        var ou = await repository.GetAsync(id);
        ou.DisplayName = input.DisplayName.Trim();
        await manager.UpdateAsync(ou);
    }

    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageTree)]
    public virtual async Task MoveAsync(Guid id, MoveOrganizationUnitDto input)
    {
        if (input.NewParentId == id) throw new UserFriendlyException("A unit can't be its own parent.");
        if (input.NewParentId.HasValue)
        {
            var ou = await repository.GetAsync(id);
            var target = await repository.GetAsync(input.NewParentId.Value);
            if (target.Code.StartsWith(ou.Code + ".", StringComparison.Ordinal))
                throw new UserFriendlyException("A unit can't be moved under one of its own children.");
        }
        await manager.MoveAsync(id, input.NewParentId);
    }

    /// <summary>Deletes the unit and all of its children.</summary>
    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageTree)]
    public virtual Task DeleteAsync(Guid id) => manager.DeleteAsync(id);

    public virtual async Task<PagedResultDto<OrganizationUnitMemberDto>> GetMembersAsync(Guid id, GetOrganizationUnitMembersInput input)
    {
        var ou = await repository.GetAsync(id, includeDetails: false);
        var users = await repository.GetMembersAsync(ou, input.Sorting ?? nameof(IdentityUser.UserName), input.MaxResultCount, input.SkipCount, input.Filter);
        var count = await repository.GetMembersCountAsync(ou, input.Filter);
        return new PagedResultDto<OrganizationUnitMemberDto>(count, users.Select(u => new OrganizationUnitMemberDto
        {
            Id = u.Id, UserName = u.UserName, Name = u.Name, Surname = u.Surname, Email = u.Email,
        }).ToList());
    }

    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageMembers)]
    public virtual async Task AddMembersAsync(Guid id, IdListDto input)
    {
        foreach (var userId in input.Ids.Distinct()) await userManager.AddToOrganizationUnitAsync(userId, id);
    }

    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageMembers)]
    public virtual Task RemoveMemberAsync(Guid id, Guid userId) => userManager.RemoveFromOrganizationUnitAsync(userId, id);

    public virtual async Task<List<OrganizationUnitRoleDto>> GetRolesAsync(Guid id)
    {
        var ou = await repository.GetAsync(id, includeDetails: true);
        var roleIds = ou.Roles.Select(r => r.RoleId).ToArray();
        var roles = await roleRepository.GetListAsync(roleIds);
        return roles.OrderBy(r => r.Name).Select(r => new OrganizationUnitRoleDto { Id = r.Id, Name = r.Name }).ToList();
    }

    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageRoles)]
    public virtual async Task AddRolesAsync(Guid id, IdListDto input)
    {
        foreach (var roleId in input.Ids.Distinct()) await manager.AddRoleToOrganizationUnitAsync(roleId, id);
    }

    [Authorize(AbpAdminPermissions.OrganizationUnits.ManageRoles)]
    public virtual Task RemoveRoleAsync(Guid id, Guid roleId) => manager.RemoveRoleFromOrganizationUnitAsync(roleId, id);
}
