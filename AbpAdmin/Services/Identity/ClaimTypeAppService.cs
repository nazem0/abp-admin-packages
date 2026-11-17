using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.RegularExpressions;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Identity;
using Volo.Abp.Validation;

namespace AbpAdmin.Services.Identity;

public class ClaimTypeDto : EntityDto<Guid>
{
    public string Name { get; set; } = "";
    /// <summary>Users must have a value for it (enforced when their claims are saved here).</summary>
    public bool Required { get; set; }
    /// <summary>Defined by code (e.g. "email"); can't be changed or deleted.</summary>
    public bool IsStatic { get; set; }
    public string? Regex { get; set; }
    public string? RegexDescription { get; set; }
    public string? Description { get; set; }
    public IdentityClaimValueType ValueType { get; set; }
    public DateTime CreationTime { get; set; }
}

public class CreateUpdateClaimTypeDto
{
    [Required, StringLength(256)] public string Name { get; set; } = "";
    public bool Required { get; set; }
    [StringLength(512)] public string? Regex { get; set; }
    [StringLength(128)] public string? RegexDescription { get; set; }
    [StringLength(256)] public string? Description { get; set; }
    public IdentityClaimValueType ValueType { get; set; }
}

public class GetClaimTypeListInput : PagedAndSortedResultRequestDto
{
    public string? Filter { get; set; }
}

public class ClaimDto
{
    [Required, StringLength(256)] public string Type { get; set; } = "";
    [StringLength(1024)] public string Value { get; set; } = "";
}

public class UpdateClaimsDto
{
    /// <summary>The full list: claims not in it are removed.</summary>
    public List<ClaimDto> Claims { get; set; } = [];
}

/// <summary>Claim types (free Identity module has the entity but no API), and the claims of users and roles.</summary>
[Authorize(AbpAdminPermissions.ClaimTypes.Default)]
public class ClaimTypeAppService(IIdentityClaimTypeRepository repository, IdentityClaimTypeManager manager) : AbpAdminAppService
{
    public virtual async Task<PagedResultDto<ClaimTypeDto>> GetListAsync(GetClaimTypeListInput input)
    {
        var items = await repository.GetListAsync(input.Sorting ?? nameof(IdentityClaimType.Name), input.MaxResultCount, input.SkipCount, input.Filter);
        return new PagedResultDto<ClaimTypeDto>(await repository.GetCountAsync(input.Filter), items.Select(ToDto).ToList());
    }

    [Authorize(AbpAdminPermissions.ClaimTypes.Create)]
    public virtual async Task<ClaimTypeDto> CreateAsync(CreateUpdateClaimTypeDto input)
    {
        CheckRegex(input.Regex);
        var type = new IdentityClaimType(GuidGenerator.Create(), input.Name.Trim(), input.Required, false,
            Clean(input.Regex), Clean(input.RegexDescription), Clean(input.Description), input.ValueType);
        return ToDto(await manager.CreateAsync(type)); // checks the name is unique
    }

    [Authorize(AbpAdminPermissions.ClaimTypes.Update)]
    public virtual async Task<ClaimTypeDto> UpdateAsync(Guid id, CreateUpdateClaimTypeDto input)
    {
        var type = await repository.GetAsync(id);
        if (type.IsStatic) throw new UserFriendlyException($"'{type.Name}' is defined by the application and can't be changed.");
        CheckRegex(input.Regex);
        type.SetName(input.Name.Trim());
        type.Required = input.Required;
        type.Regex = Clean(input.Regex);
        type.RegexDescription = Clean(input.RegexDescription);
        type.Description = Clean(input.Description);
        type.ValueType = input.ValueType;
        return ToDto(await manager.UpdateAsync(type));
    }

    [Authorize(AbpAdminPermissions.ClaimTypes.Delete)]
    public virtual async Task DeleteAsync(Guid id)
    {
        var type = await repository.GetAsync(id);
        if (type.IsStatic) throw new UserFriendlyException($"'{type.Name}' is defined by the application and can't be deleted.");
        await manager.DeleteAsync(id); // also removes the claim from users and roles
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void CheckRegex(string? regex)
    {
        if (regex.IsNullOrWhiteSpace()) return;
        try { _ = new Regex(regex); }
        catch (ArgumentException e) { throw new AbpValidationException("Invalid regular expression.", [new ValidationResult(e.Message, [nameof(CreateUpdateClaimTypeDto.Regex)])]); }
    }

    private static ClaimTypeDto ToDto(IdentityClaimType t) => new()
    {
        Id = t.Id, Name = t.Name, Required = t.Required, IsStatic = t.IsStatic, Regex = t.Regex,
        RegexDescription = t.RegexDescription, Description = t.Description, ValueType = t.ValueType, CreationTime = t.CreationTime,
    };
}

/// <summary>Claims of a user or role: read, and replace the whole list (checked against the claim types).</summary>
public class IdentityClaimsAppService(
    IdentityUserManager users,
    IIdentityUserRepository userRepository,
    IIdentityRoleRepository roleRepository,
    IIdentityClaimTypeRepository claimTypes) : AbpAdminAppService
{
    /// <summary>The claim types to pick from, for anyone who manages users or roles (tenant admins included).</summary>
    [Authorize]
    public virtual async Task<List<ClaimTypeDto>> GetTypesAsync()
    {
        if (!await AuthorizationService.IsGrantedAsync(IdentityPermissions.Users.Default) && !await AuthorizationService.IsGrantedAsync(IdentityPermissions.Roles.Default))
        {
            throw new Volo.Abp.Authorization.AbpAuthorizationException();
        }
        return (await claimTypes.GetListAsync()).OrderBy(t => t.Name).Select(t => new ClaimTypeDto
        {
            Id = t.Id, Name = t.Name, Required = t.Required, IsStatic = t.IsStatic, Regex = t.Regex,
            RegexDescription = t.RegexDescription, Description = t.Description, ValueType = t.ValueType, CreationTime = t.CreationTime,
        }).ToList();
    }

    [Authorize(IdentityPermissions.Users.Default)]
    public virtual async Task<List<ClaimDto>> GetUserClaimsAsync(Guid id) =>
        (await userRepository.GetAsync(id)).Claims.Select(c => new ClaimDto { Type = c.ClaimType, Value = c.ClaimValue ?? "" }).ToList();

    [Authorize(IdentityPermissions.Users.Update)]
    public virtual async Task<List<ClaimDto>> UpdateUserClaimsAsync(Guid id, UpdateClaimsDto input)
    {
        var wanted = await CheckAsync(input.Claims, forUser: true);
        var user = await users.GetByIdAsync(id);
        var current = user.Claims.Select(c => new Claim(c.ClaimType, c.ClaimValue ?? "")).ToList();
        var remove = current.Where(c => !wanted.Any(w => Same(w, c))).ToList();
        var add = wanted.Where(w => !current.Any(c => Same(w, c))).ToList();
        if (remove.Count > 0) (await users.RemoveClaimsAsync(user, remove)).CheckErrors();
        if (add.Count > 0) (await users.AddClaimsAsync(user, add)).CheckErrors();
        return wanted.Select(c => new ClaimDto { Type = c.Type, Value = c.Value }).ToList();
    }

    [Authorize(IdentityPermissions.Roles.Default)]
    public virtual async Task<List<ClaimDto>> GetRoleClaimsAsync(Guid id) =>
        (await roleRepository.GetAsync(id)).Claims.Select(c => new ClaimDto { Type = c.ClaimType, Value = c.ClaimValue ?? "" }).ToList();

    [Authorize(IdentityPermissions.Roles.Update)]
    public virtual async Task<List<ClaimDto>> UpdateRoleClaimsAsync(Guid id, UpdateClaimsDto input)
    {
        var wanted = await CheckAsync(input.Claims, forUser: false);
        var role = await roleRepository.GetAsync(id);
        foreach (var c in role.Claims.Select(c => new Claim(c.ClaimType, c.ClaimValue ?? "")).Where(c => !wanted.Any(w => Same(w, c))).ToList())
        {
            role.RemoveClaim(c);
        }
        foreach (var w in wanted.Where(w => role.FindClaim(w) == null))
        {
            role.AddClaim(GuidGenerator, w);
        }
        await roleRepository.UpdateAsync(role);
        return wanted.Select(c => new ClaimDto { Type = c.Type, Value = c.Value }).ToList();
    }

    private static bool Same(Claim a, Claim b) => a.Type == b.Type && a.Value == b.Value;

    /// <summary>Known claim types only; values match the type's regex and value type; required types present (users only).</summary>
    private async Task<List<Claim>> CheckAsync(List<ClaimDto> claims, bool forUser)
    {
        var types = (await claimTypes.GetListAsync()).ToDictionary(t => t.Name, StringComparer.Ordinal);
        var errors = new List<ValidationResult>();
        foreach (var c in claims)
        {
            if (!types.TryGetValue(c.Type, out var type)) { errors.Add(new ValidationResult($"Unknown claim type '{c.Type}'. Define it on the Claim types page first.", [c.Type])); continue; }
            var value = c.Value ?? "";
            var valid = type.ValueType switch
            {
                IdentityClaimValueType.Int => int.TryParse(value, out _),
                IdentityClaimValueType.Boolean => bool.TryParse(value, out _),
                IdentityClaimValueType.DateTime => DateTime.TryParse(value, out _),
                _ => true,
            };
            if (!valid) errors.Add(new ValidationResult($"{c.Type}: '{value}' is not a valid {type.ValueType}.", [c.Type]));
            else if (!type.Regex.IsNullOrWhiteSpace() && !Regex.IsMatch(value, type.Regex))
                errors.Add(new ValidationResult($"{c.Type}: {type.RegexDescription ?? $"must match {type.Regex}"}.", [c.Type]));
        }
        if (forUser)
        {
            foreach (var required in types.Values.Where(t => t.Required && !claims.Any(c => c.Type == t.Name)))
                errors.Add(new ValidationResult($"{required.Name} is required.", [required.Name]));
        }
        if (errors.Count > 0) throw new AbpValidationException("The claims are not valid.", errors);
        return claims.Select(c => new Claim(c.Type, c.Value ?? "")).DistinctBy(c => (c.Type, c.Value)).ToList();
    }
}
