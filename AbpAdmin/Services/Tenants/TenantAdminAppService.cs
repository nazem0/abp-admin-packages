using System.ComponentModel.DataAnnotations;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Volo.Abp;
using Volo.Abp.Emailing;
using Volo.Abp.Identity;
using Volo.Abp.TenantManagement;
using IdentityUser = Volo.Abp.Identity.IdentityUser;

namespace AbpAdmin.Services.Tenants;

public class SetTenantUserPasswordDto
{
    /// <summary>The tenant's user; ABP's seeded tenant administrator is "admin".</summary>
    [Required, StringLength(256)] public string UserName { get; set; } = "admin";
    [Required, StringLength(128)] public string Password { get; set; } = "";
}

public class InviteTenantAdminDto
{
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = "";
}

public class TenantInvitationDto
{
    public string UserName { get; set; } = "";
    /// <summary>Opens ABP's "reset password" page in the tenant; share it yourself when email isn't set up.</summary>
    public string Link { get; set; } = "";
    public bool EmailSent { get; set; }
    /// <summary>Why the email wasn't sent (e.g. SMTP isn't configured).</summary>
    public string? EmailError { get; set; }
    public DateTime ExpiresAt { get; set; }
}

/// <summary>
/// The host managing a tenant's administrators: set a user's password, or invite someone as administrator by email.
/// An invitation creates the user (no password) in the tenant's "admin" role and sends a link to ABP's free
/// reset-password page, where they choose a password. Inviting an existing user just sends a new link.
/// </summary>
[Authorize(AbpAdminPermissions.Tenants.ManageUsers)]
public class TenantAdminAppService(
    ITenantRepository tenants,
    IdentityUserManager users,
    IIdentityRoleRepository roles,
    IEmailSender emailSender,
    IConfiguration configuration,
    IOptions<DataProtectionTokenProviderOptions> tokenOptions) : AbpAdminAppService
{
    /// <summary>The role ABP's data seeder gives the tenant administrator.</summary>
    public const string AdminRoleName = "admin";

    public virtual async Task SetPasswordAsync(Guid id, SetTenantUserPasswordDto input)
    {
        await tenants.GetAsync(id);
        using (CurrentTenant.Change(id))
        {
            var user = await users.FindByNameAsync(input.UserName.Trim())
                ?? throw new UserFriendlyException($"The tenant has no user named '{input.UserName}'.");
            // Checked against the password policy (Settings → Identity).
            var token = await users.GeneratePasswordResetTokenAsync(user);
            (await users.ResetPasswordAsync(user, token, input.Password)).CheckErrors();
        }
    }

    public virtual async Task<TenantInvitationDto> InviteAdminAsync(Guid id, InviteTenantAdminDto input)
    {
        var tenant = await tenants.GetAsync(id);
        var email = input.Email.Trim();
        using (CurrentTenant.Change(id))
        {
            var user = await users.FindByEmailAsync(email);
            if (user == null)
            {
                user = new IdentityUser(GuidGenerator.Create(), email, email, id);
                (await users.CreateAsync(user)).CheckErrors();
            }
            if (await roles.FindByNormalizedNameAsync(AdminRoleName.ToUpperInvariant()) != null && !await users.IsInRoleAsync(user, AdminRoleName))
            {
                (await users.AddToRoleAsync(user, AdminRoleName)).CheckErrors();
            }

            var token = await users.GeneratePasswordResetTokenAsync(user);
            var selfUrl = (configuration["App:SelfUrl"] ?? "").TrimEnd('/');
            var link = $"{selfUrl}/Account/ResetPassword?userId={user.Id}&resetToken={Uri.EscapeDataString(token)}&__tenant={id}";
            var result = new TenantInvitationDto { UserName = user.UserName, Link = link, ExpiresAt = Clock.Now.Add(tokenOptions.Value.TokenLifespan) };

            try
            {
                var body = L["Tenants:Invite:EmailBody", System.Net.WebUtility.HtmlEncode(tenant.Name), link, (int)tokenOptions.Value.TokenLifespan.TotalHours];
                await emailSender.SendAsync(email, L["Tenants:Invite:EmailSubject", tenant.Name], body);
                result.EmailSent = true;
            }
            catch (Exception e)
            {
                Logger.LogWarning(e, "Sending the administrator invitation of tenant {Tenant} failed.", tenant.Name);
                result.EmailError = e.Message;
            }
            return result;
        }
    }
}
