using System.ComponentModel.DataAnnotations;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using OpenIddict.Abstractions;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.OpenIddict.Scopes;

namespace AbpAdmin.Services.OpenIddict;

public class GetOpenIddictListInput : PagedAndSortedResultRequestDto
{
    public string? Filter { get; set; }
}

public class ScopeDto : EntityDto<Guid>
{
    public string Name { get; set; } = "";
    public string? DisplayName { get; set; }
    public string? Description { get; set; }
    /// <summary>Audiences (API resources) that tokens with this scope are issued for.</summary>
    public List<string> Resources { get; set; } = new();
    public DateTime CreationTime { get; set; }
}

public class CreateUpdateScopeDto
{
    [Required, StringLength(200), RegularExpression(@"^[^\s]+$", ErrorMessage = "A scope name can't contain spaces.")]
    public string Name { get; set; } = "";
    [StringLength(200)] public string? DisplayName { get; set; }
    public string? Description { get; set; }
    public List<string> Resources { get; set; } = new();
}

/// <summary>OpenIddict scopes (API permissions clients can request), managed through OpenIddict's scope manager.</summary>
[Authorize(AbpAdminPermissions.Scopes.Default)]
public class ScopeAppService(IOpenIddictScopeRepository repository, IOpenIddictScopeManager manager) : AbpAdminAppService
{
    public virtual async Task<PagedResultDto<ScopeDto>> GetListAsync(GetOpenIddictListInput input)
    {
        var items = await repository.GetListAsync(input.Sorting ?? nameof(OpenIddictScope.Name), input.SkipCount, input.MaxResultCount, input.Filter);
        return new PagedResultDto<ScopeDto>(await repository.GetCountAsync(input.Filter), items.Select(ToDto).ToList());
    }

    public virtual async Task<ScopeDto> GetAsync(Guid id) => ToDto(await repository.GetAsync(id));

    [Authorize(AbpAdminPermissions.Scopes.Create)]
    public virtual async Task<ScopeDto> CreateAsync(CreateUpdateScopeDto input)
    {
        var descriptor = new OpenIddictScopeDescriptor();
        Apply(descriptor, input);
        await Validated(async () => await manager.CreateAsync(descriptor));
        return ToDto(await repository.FindByNameAsync(descriptor.Name!) ?? throw new EntityNotFoundException(typeof(OpenIddictScope), input.Name));
    }

    [Authorize(AbpAdminPermissions.Scopes.Update)]
    public virtual async Task<ScopeDto> UpdateAsync(Guid id, CreateUpdateScopeDto input)
    {
        var scope = await manager.FindByIdAsync(id.ToString()) ?? throw new EntityNotFoundException(typeof(OpenIddictScope), id);
        var descriptor = new OpenIddictScopeDescriptor();
        await manager.PopulateAsync(descriptor, scope);
        Apply(descriptor, input);
        await Validated(async () => await manager.UpdateAsync(scope, descriptor));
        return await GetAsync(id);
    }

    [Authorize(AbpAdminPermissions.Scopes.Delete)]
    public virtual async Task DeleteAsync(Guid id)
    {
        var scope = await manager.FindByIdAsync(id.ToString()) ?? throw new EntityNotFoundException(typeof(OpenIddictScope), id);
        await manager.DeleteAsync(scope);
    }

    private static void Apply(OpenIddictScopeDescriptor d, CreateUpdateScopeDto input)
    {
        d.Name = input.Name.Trim();
        d.DisplayName = input.DisplayName;
        d.Description = input.Description;
        d.Resources.Clear();
        foreach (var r in input.Resources.Where(x => !x.IsNullOrWhiteSpace()).Select(x => x.Trim()).Distinct()) d.Resources.Add(r);
    }

    private static async Task Validated(Func<Task> action)
    {
        try { await action(); }
        catch (OpenIddictExceptions.ValidationException e)
        {
            throw new UserFriendlyException(string.Join(" ", e.Results.Select(r => r.ErrorMessage)));
        }
    }

    private static ScopeDto ToDto(OpenIddictScope s) => new()
    {
        Id = s.Id,
        Name = s.Name ?? "",
        DisplayName = s.DisplayName,
        Description = s.Description,
        Resources = ApplicationAppService.Json(s.Resources),
        CreationTime = s.CreationTime,
    };
}
