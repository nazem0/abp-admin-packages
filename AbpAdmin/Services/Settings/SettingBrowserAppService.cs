using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Settings;
using Volo.Abp.SettingManagement;

namespace AbpAdmin.Services.Settings;

public class SettingValueDto
{
    public string Name { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Description { get; set; }
    /// <summary>Module prefix of the name: "Abp.Identity", "Abp.Mailing", "AbpAdmin", …</summary>
    public string Group { get; set; } = "";
    /// <summary>"bool", "number" or "text" (inferred from the default value).</summary>
    public string Type { get; set; } = "text";
    public bool IsEncrypted { get; set; }
    /// <summary>Whether this level (host = global, tenant = tenant) may store a value.</summary>
    public bool IsEditable { get; set; }
    public string? DefaultValue { get; set; }
    /// <summary>From appsettings.json (Settings:Name); overrides the default.</summary>
    public string? ConfigurationValue { get; set; }
    /// <summary>Stored for the host; overrides configuration.</summary>
    public string? GlobalValue { get; set; }
    /// <summary>Stored for the current tenant (null for the host); overrides the global value.</summary>
    public string? TenantValue { get; set; }
    /// <summary>The value that applies here, before any per-user value.</summary>
    public string? Value { get; set; }
}

/// <summary>
/// Every setting defined by every module and the app, with its value at each level, editable at the caller's level:
/// globally for the host, per tenant for a tenant. Encrypted values are never sent back, only whether one is set.
/// </summary>
[Authorize(AbpAdminPermissions.Settings.Default)]
public class SettingBrowserAppService(ISettingManager settingManager, ISettingDefinitionManager definitions) : ApplicationService
{
    /// <summary>Stands in for an encrypted value that is set.</summary>
    public const string Hidden = "••••••";

    public virtual async Task<List<SettingValueDto>> GetListAsync()
    {
        var tenantId = CurrentTenant.Id;
        var configuration = await ValuesAsync(ConfigurationSettingValueProvider.ProviderName, null);
        var global = await ValuesAsync(GlobalSettingValueProvider.ProviderName, null);
        var tenant = tenantId.HasValue ? await ValuesAsync(TenantSettingValueProvider.ProviderName, tenantId.ToString()) : [];

        return (await definitions.GetAllAsync())
            // A tenant sees only what it may override (as on the identity settings page).
            .Where(d => !tenantId.HasValue || Allows(d, TenantSettingValueProvider.ProviderName))
            .OrderBy(d => d.Name)
            .Select(d =>
            {
                string? Show(string? v) => d.IsEncrypted && v != null ? Hidden : v;
                var dto = new SettingValueDto
                {
                    Name = d.Name,
                    DisplayName = d.DisplayName.Localize(StringLocalizerFactory),
                    Description = d.Description?.Localize(StringLocalizerFactory),
                    Group = GroupOf(d.Name),
                    Type = SettingValues.TypeOf(d),
                    IsEncrypted = d.IsEncrypted,
                    IsEditable = Allows(d, tenantId.HasValue ? TenantSettingValueProvider.ProviderName : GlobalSettingValueProvider.ProviderName),
                    DefaultValue = d.DefaultValue,
                    ConfigurationValue = Show(configuration.GetValueOrDefault(d.Name)),
                    GlobalValue = Show(global.GetValueOrDefault(d.Name)),
                    TenantValue = Show(tenant.GetValueOrDefault(d.Name)),
                };
                dto.Value = dto.TenantValue ?? dto.GlobalValue ?? dto.ConfigurationValue ?? dto.DefaultValue;
                return dto;
            })
            .ToList();
    }

    /// <summary>Stores values at the caller's level; a null or empty value removes it, so the level below applies.</summary>
    [Authorize(AbpAdminPermissions.Settings.Update)]
    public virtual async Task UpdateAsync(List<UpdateSettingDto> input)
    {
        foreach (var s in input)
        {
            var def = await definitions.GetOrNullAsync(s.Name) ?? throw new UserFriendlyException($"There is no setting named '{s.Name}'.");
            var level = CurrentTenant.IsAvailable ? TenantSettingValueProvider.ProviderName : GlobalSettingValueProvider.ProviderName;
            if (!Allows(def, level)) throw new UserFriendlyException($"Setting '{s.Name}' can't be stored at this level.");
            if (def.IsEncrypted && s.Value == Hidden) continue; // the placeholder sent back unchanged
            var value = s.Value.IsNullOrEmpty() ? null : s.Value;
            if (value != null) SettingValues.Validate(def, value);
            if (CurrentTenant.IsAvailable) await settingManager.SetForCurrentTenantAsync(s.Name, value);
            else await settingManager.SetGlobalAsync(s.Name, value);
        }
    }

    private async Task<Dictionary<string, string?>> ValuesAsync(string provider, string? key) =>
        (await settingManager.GetAllAsync(provider, key, fallback: false)).ToDictionary(v => v.Name, v => v.Value);

    /// <summary>No providers listed = any provider may hold a value.</summary>
    private static bool Allows(SettingDefinition def, string provider) => def.Providers.Count == 0 || def.Providers.Contains(provider);

    /// <summary>"Abp.Identity.Password.RequiredLength" → "Abp.Identity"; "AbpAdmin.X" → "AbpAdmin".</summary>
    private static string GroupOf(string name)
    {
        var parts = name.Split('.');
        return parts.Length > 2 ? parts[0] + "." + parts[1] : parts[0];
    }
}

/// <summary>Setting values are strings; the type is inferred from the definition's default value.</summary>
public static class SettingValues
{
    public static string TypeOf(SettingDefinition def) =>
        bool.TryParse(def.DefaultValue, out _) ? "bool" : int.TryParse(def.DefaultValue, out _) ? "number" : "text";

    public static void Validate(SettingDefinition def, string? value)
    {
        switch (TypeOf(def))
        {
            case "bool" when !bool.TryParse(value, out _):
                throw new UserFriendlyException($"{def.Name} must be true or false.");
            case "number" when !int.TryParse(value, out var n) || n < 0:
                throw new UserFriendlyException($"{def.Name} must be a whole number of 0 or more.");
        }
    }
}
