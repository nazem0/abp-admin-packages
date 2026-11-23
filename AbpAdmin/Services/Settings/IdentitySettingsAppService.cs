using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Settings;
using Volo.Abp.SettingManagement;

namespace AbpAdmin.Services.Settings;

public class SettingGroupDto
{
    public string Name { get; set; } = "";
    public List<SettingItemDto> Settings { get; set; } = new();
}

public class SettingItemDto
{
    public string Name { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Description { get; set; }
    /// <summary>"bool", "number" or "text" (inferred from the default value).</summary>
    public string Type { get; set; } = "text";
    public string? Value { get; set; }
    public string? DefaultValue { get; set; }
}

public class UpdateSettingDto
{
    public string Name { get; set; } = "";
    public string? Value { get; set; }
}

/// <summary>
/// Identity and account settings (password policy, lockout, sign-in, self-registration) stored by ABP Setting
/// Management: globally for the host, per tenant for a tenant (its values override the host's, and only settings
/// a tenant may override are shown). Only names listed in <see cref="Groups"/> can be read or written.
/// </summary>
[Authorize(AbpAdminPermissions.IdentitySettings.Default)]
public class IdentitySettingsAppService(ISettingManager settingManager, ISettingDefinitionManager definitions) : ApplicationService
{
    private static readonly (string Group, string[] Names)[] Groups =
    [
        ("Password", [
            "Abp.Identity.Password.RequiredLength", "Abp.Identity.Password.RequiredUniqueChars",
            "Abp.Identity.Password.RequireNonAlphanumeric", "Abp.Identity.Password.RequireLowercase",
            "Abp.Identity.Password.RequireUppercase", "Abp.Identity.Password.RequireDigit",
            "Abp.Identity.Password.ForceUsersToPeriodicallyChangePassword", "Abp.Identity.Password.PasswordChangePeriodDays",
        ]),
        ("Lockout", [
            "Abp.Identity.Lockout.AllowedForNewUsers", "Abp.Identity.Lockout.LockoutDuration",
            "Abp.Identity.Lockout.MaxFailedAccessAttempts",
        ]),
        ("Sign-in", [
            "Abp.Identity.SignIn.RequireConfirmedEmail", "Abp.Identity.SignIn.RequireEmailVerificationToRegister",
            "Abp.Identity.SignIn.EnablePhoneNumberConfirmation", "Abp.Identity.SignIn.RequireConfirmedPhoneNumber",
            "Abp.Account.IsSelfRegistrationEnabled", "Abp.Account.EnableLocalLogin",
        ]),
        ("User", ["Abp.Identity.User.IsUserNameUpdateEnabled", "Abp.Identity.User.IsEmailUpdateEnabled"]),
    ];

    private static readonly HashSet<string> Allowed = Groups.SelectMany(g => g.Names).ToHashSet();

    public virtual async Task<List<SettingGroupDto>> GetAsync()
    {
        var result = new List<SettingGroupDto>();
        foreach (var (group, names) in Groups)
        {
            var dto = new SettingGroupDto { Name = group };
            foreach (var name in names)
            {
                // Settings of modules that aren't installed simply don't show up.
                if (await definitions.GetOrNullAsync(name) is not { } def || !Editable(def)) continue;
                dto.Settings.Add(new SettingItemDto
                {
                    Name = name,
                    DisplayName = def.DisplayName.Localize(StringLocalizerFactory),
                    Description = def.Description?.Localize(StringLocalizerFactory),
                    Type = SettingValues.TypeOf(def),
                    // What applies when this level sets nothing: for a tenant, the host's value.
                    DefaultValue = CurrentTenant.IsAvailable ? await settingManager.GetOrNullGlobalAsync(name) ?? def.DefaultValue : def.DefaultValue,
                    Value = CurrentTenant.IsAvailable
                        ? await settingManager.GetOrNullForCurrentTenantAsync(name, fallback: false)
                        : await settingManager.GetOrNullGlobalAsync(name),
                });
            }
            if (dto.Settings.Count > 0) result.Add(dto);
        }
        return result;
    }

    public virtual async Task UpdateAsync(List<UpdateSettingDto> input)
    {
        foreach (var s in input)
        {
            if (!Allowed.Contains(s.Name)) throw new UserFriendlyException($"Setting '{s.Name}' can't be changed here.");
            var def = await definitions.GetAsync(s.Name);
            if (!Editable(def)) throw new UserFriendlyException($"Setting '{s.Name}' can't be changed here.");
            SettingValues.Validate(def, s.Value);
            if (CurrentTenant.IsAvailable) await settingManager.SetForCurrentTenantAsync(s.Name, s.Value);
            else await settingManager.SetGlobalAsync(s.Name, s.Value);
        }
    }

    /// <summary>A tenant sees only settings whose definition allows a tenant value (no providers listed = any).</summary>
    private bool Editable(SettingDefinition def) =>
        !CurrentTenant.IsAvailable || def.Providers.Count == 0 || def.Providers.Contains(TenantSettingValueProvider.ProviderName);
}
