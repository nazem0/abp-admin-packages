using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using OpenIddict.Abstractions;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.OpenIddict.Applications;
using Oidc = OpenIddict.Abstractions.OpenIddictConstants;

namespace AbpAdmin.Services.OpenIddict;

public class ApplicationDto : EntityDto<Guid>
{
    public string ClientId { get; set; } = "";
    public string? DisplayName { get; set; }
    /// <summary>"public" or "confidential".</summary>
    public string? ClientType { get; set; }
    /// <summary>"implicit", "explicit", "external" or "systematic".</summary>
    public string? ConsentType { get; set; }
    /// <summary>"web" or "native".</summary>
    public string? ApplicationType { get; set; }
    public List<string> GrantTypes { get; set; } = new();
    public List<string> Scopes { get; set; } = new();
    public List<string> RedirectUris { get; set; } = new();
    public List<string> PostLogoutRedirectUris { get; set; } = new();
    public bool RequirePkce { get; set; }
    public string? ClientUri { get; set; }
    public string? LogoUri { get; set; }
    public DateTime CreationTime { get; set; }
}

public class CreateUpdateApplicationDto
{
    [Required, StringLength(100)] public string ClientId { get; set; } = "";
    [StringLength(200)] public string? DisplayName { get; set; }
    [Required] public string ClientType { get; set; } = Oidc.ClientTypes.Public;
    [Required] public string ConsentType { get; set; } = Oidc.ConsentTypes.Implicit;
    [Required] public string ApplicationType { get; set; } = Oidc.ApplicationTypes.Web;
    /// <summary>Required for new confidential clients; on update, set only to rotate the secret.</summary>
    public string? ClientSecret { get; set; }
    public List<string> GrantTypes { get; set; } = new();
    public List<string> Scopes { get; set; } = new();
    public List<string> RedirectUris { get; set; } = new();
    public List<string> PostLogoutRedirectUris { get; set; } = new();
    public bool RequirePkce { get; set; }
    public string? ClientUri { get; set; }
    public string? LogoUri { get; set; }
}

/// <summary>
/// OpenIddict client applications. Writes go through OpenIddict's manager, so secrets are hashed and
/// descriptors validated exactly like ABP's data seeder; endpoint and response-type permissions are
/// derived from the chosen grant types.
/// </summary>
[Authorize(AbpAdminPermissions.Applications.Default)]
public class ApplicationAppService(IOpenIddictApplicationRepository repository, IOpenIddictApplicationManager manager) : AbpAdminAppService
{
    private static readonly string[] Interactive = [Oidc.GrantTypes.AuthorizationCode, Oidc.GrantTypes.Implicit];
    private static readonly string[] TokenBased =
        [Oidc.GrantTypes.AuthorizationCode, Oidc.GrantTypes.ClientCredentials, Oidc.GrantTypes.Password, Oidc.GrantTypes.RefreshToken, Oidc.GrantTypes.DeviceCode];

    public virtual async Task<PagedResultDto<ApplicationDto>> GetListAsync(GetOpenIddictListInput input)
    {
        var items = await repository.GetListAsync(input.Sorting ?? nameof(OpenIddictApplication.ClientId), input.SkipCount, input.MaxResultCount, input.Filter);
        return new PagedResultDto<ApplicationDto>(await repository.GetCountAsync(input.Filter), items.Select(ToDto).ToList());
    }

    public virtual async Task<ApplicationDto> GetAsync(Guid id) => ToDto(await repository.GetAsync(id));

    [Authorize(AbpAdminPermissions.Applications.Create)]
    public virtual async Task<ApplicationDto> CreateAsync(CreateUpdateApplicationDto input)
    {
        if (input.ClientType == Oidc.ClientTypes.Confidential && input.ClientSecret.IsNullOrWhiteSpace())
            throw new UserFriendlyException("A confidential client needs a client secret.");
        var descriptor = new AbpApplicationDescriptor();
        Apply(descriptor, input);
        descriptor.ClientSecret = input.ClientType == Oidc.ClientTypes.Confidential ? input.ClientSecret : null;
        await Validated(async () => await manager.CreateAsync(descriptor));
        return ToDto(await repository.FindByClientIdAsync(input.ClientId) ?? throw new EntityNotFoundException(typeof(OpenIddictApplication), input.ClientId));
    }

    [Authorize(AbpAdminPermissions.Applications.Update)]
    public virtual async Task<ApplicationDto> UpdateAsync(Guid id, CreateUpdateApplicationDto input)
    {
        var app = await manager.FindByIdAsync(id.ToString()) ?? throw new EntityNotFoundException(typeof(OpenIddictApplication), id);
        var descriptor = new AbpApplicationDescriptor();
        await manager.PopulateAsync(descriptor, app);
        var hadSecret = !descriptor.ClientSecret.IsNullOrEmpty();
        Apply(descriptor, input);
        if (input.ClientType == Oidc.ClientTypes.Public) descriptor.ClientSecret = null;
        else if (!input.ClientSecret.IsNullOrWhiteSpace()) descriptor.ClientSecret = input.ClientSecret; // rotated; the manager hashes it
        else if (!hadSecret) throw new UserFriendlyException("A confidential client needs a client secret.");
        await Validated(async () => await manager.UpdateAsync(app, descriptor));
        return await GetAsync(id);
    }

    [Authorize(AbpAdminPermissions.Applications.Delete)]
    public virtual async Task DeleteAsync(Guid id)
    {
        var app = await manager.FindByIdAsync(id.ToString()) ?? throw new EntityNotFoundException(typeof(OpenIddictApplication), id);
        await manager.DeleteAsync(app);
    }

    private static void Apply(AbpApplicationDescriptor d, CreateUpdateApplicationDto input)
    {
        d.ClientId = input.ClientId.Trim();
        d.DisplayName = input.DisplayName;
        d.ClientType = input.ClientType;
        d.ConsentType = input.ConsentType;
        d.ApplicationType = input.ApplicationType;
        d.ClientUri = input.ClientUri.IsNullOrWhiteSpace() ? null : input.ClientUri;
        d.LogoUri = input.LogoUri.IsNullOrWhiteSpace() ? null : input.LogoUri;

        d.RedirectUris.Clear();
        foreach (var uri in input.RedirectUris.Where(x => !x.IsNullOrWhiteSpace())) d.RedirectUris.Add(ToUri(uri));
        d.PostLogoutRedirectUris.Clear();
        foreach (var uri in input.PostLogoutRedirectUris.Where(x => !x.IsNullOrWhiteSpace())) d.PostLogoutRedirectUris.Add(ToUri(uri));

        d.Requirements.Clear();
        if (input.RequirePkce) d.Requirements.Add(Oidc.Requirements.Features.ProofKeyForCodeExchange);

        d.Permissions.Clear();
        var grants = input.GrantTypes.Distinct().ToList();
        foreach (var grant in grants) d.Permissions.Add(Oidc.Permissions.Prefixes.GrantType + grant);
        if (grants.Intersect(Interactive).Any())
        {
            d.Permissions.Add(Oidc.Permissions.Endpoints.Authorization);
            d.Permissions.Add(Oidc.Permissions.Endpoints.EndSession);
        }
        if (grants.Intersect(TokenBased).Any())
        {
            d.Permissions.Add(Oidc.Permissions.Endpoints.Token);
            d.Permissions.Add(Oidc.Permissions.Endpoints.Revocation);
            d.Permissions.Add(Oidc.Permissions.Endpoints.Introspection);
        }
        if (grants.Contains(Oidc.GrantTypes.DeviceCode)) d.Permissions.Add(Oidc.Permissions.Endpoints.DeviceAuthorization);
        if (grants.Contains(Oidc.GrantTypes.AuthorizationCode)) d.Permissions.Add(Oidc.Permissions.ResponseTypes.Code);
        if (grants.Contains(Oidc.GrantTypes.Implicit))
        {
            d.Permissions.Add(Oidc.Permissions.ResponseTypes.IdToken);
            d.Permissions.Add(Oidc.Permissions.ResponseTypes.IdTokenToken);
            d.Permissions.Add(Oidc.Permissions.ResponseTypes.Token);
        }
        foreach (var scope in input.Scopes.Distinct()) d.Permissions.Add(Oidc.Permissions.Prefixes.Scope + scope);
    }

    private static Uri ToUri(string value) =>
        Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ? uri : throw new UserFriendlyException($"'{value}' is not an absolute URL.");

    private static async Task Validated(Func<Task> action)
    {
        try { await action(); }
        catch (OpenIddictExceptions.ValidationException e)
        {
            throw new UserFriendlyException(string.Join(" ", e.Results.Select(r => r.ErrorMessage)));
        }
    }

    private static ApplicationDto ToDto(OpenIddictApplication a)
    {
        var permissions = Json(a.Permissions);
        return new ApplicationDto
        {
            Id = a.Id,
            ClientId = a.ClientId ?? "",
            DisplayName = a.DisplayName,
            ClientType = a.ClientType,
            ConsentType = a.ConsentType,
            ApplicationType = a.ApplicationType,
            GrantTypes = Strip(permissions, Oidc.Permissions.Prefixes.GrantType),
            Scopes = Strip(permissions, Oidc.Permissions.Prefixes.Scope),
            RedirectUris = Json(a.RedirectUris),
            PostLogoutRedirectUris = Json(a.PostLogoutRedirectUris),
            RequirePkce = Json(a.Requirements).Contains(Oidc.Requirements.Features.ProofKeyForCodeExchange),
            ClientUri = a.ClientUri,
            LogoUri = a.LogoUri,
            CreationTime = a.CreationTime,
        };
    }

    private static List<string> Strip(List<string> permissions, string prefix) =>
        permissions.Where(p => p.StartsWith(prefix, StringComparison.Ordinal)).Select(p => p[prefix.Length..]).ToList();

    internal static List<string> Json(string? json) =>
        json.IsNullOrWhiteSpace() ? new() : JsonSerializer.Deserialize<List<string>>(json!) ?? new();
}
