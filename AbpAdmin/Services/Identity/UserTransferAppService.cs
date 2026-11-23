using System.Text;
using Microsoft.AspNetCore.Authorization;
using Volo.Abp;
using Volo.Abp.Content;
using Volo.Abp.Identity;
using Volo.Abp.Uow;

namespace AbpAdmin.Services.Identity;

public class UserImportResultDto
{
    public int Created { get; set; }
    /// <summary>User names that already existed (left unchanged).</summary>
    public List<string> Skipped { get; set; } = [];
    public List<UserImportErrorDto> Errors { get; set; } = [];
}

public class UserImportErrorDto
{
    /// <summary>1-based line in the file (the header is line 1).</summary>
    public int Line { get; set; }
    public string Message { get; set; } = "";
}

/// <summary>
/// Users as CSV (UserName, Email, Name, Surname, PhoneNumber, IsActive, Roles; roles separated by ';').
/// Import adds the users that don't exist yet and needs a Password column; existing users are skipped, never changed.
/// </summary>
[Authorize(IdentityPermissions.Users.Default)]
public class UserTransferAppService(IdentityUserManager users, IIdentityUserRepository userRepository, IIdentityRoleRepository roleRepository) : AbpAdminAppService
{
    public static readonly string[] Columns = ["UserName", "Email", "Name", "Surname", "PhoneNumber", "IsActive", "Roles"];
    private const int MaxImportRows = 5000;

    [Microsoft.AspNetCore.Mvc.HttpGet]
    public virtual async Task<IRemoteStreamContent> ExportAsync()
    {
        var roleNames = (await roleRepository.GetListAsync()).ToDictionary(r => r.Id, r => r.Name);
        var list = await userRepository.GetListAsync(nameof(IdentityUser.UserName), int.MaxValue, 0, includeDetails: true);
        return Csv.File("users.csv", Columns, list.Select(u => new[]
        {
            u.UserName, u.Email, u.Name, u.Surname, u.PhoneNumber, u.IsActive ? "true" : "false",
            string.Join(";", u.Roles.Select(r => roleNames.GetValueOrDefault(r.RoleId)).Where(n => n != null)),
        }));
    }

    [Authorize(IdentityPermissions.Users.Create)]
    public virtual async Task<UserImportResultDto> ImportAsync(IRemoteStreamContent file)
    {
        using var reader = new StreamReader(file.GetStream(), Encoding.UTF8);
        var rows = Csv.Parse(await reader.ReadToEndAsync());
        var result = new UserImportResultDto();
        if (rows.Count == 0) return result;

        var header = rows[0].Select(h => h.Trim()).ToList();
        int Col(string name) => header.FindIndex(h => string.Equals(h, name, StringComparison.OrdinalIgnoreCase));
        int userName = Col("UserName"), email = Col("Email"), password = Col("Password");
        if (userName < 0 || email < 0 || password < 0)
        {
            result.Errors.Add(new UserImportErrorDto { Line = 1, Message = "The header needs at least UserName, Email and Password columns." });
            return result;
        }
        if (rows.Count - 1 > MaxImportRows)
        {
            result.Errors.Add(new UserImportErrorDto { Line = 1, Message = $"At most {MaxImportRows} users per file." });
            return result;
        }

        string Get(string[] row, int col) => col >= 0 && col < row.Length ? Csv.Unescape(row[col].Trim()) : "";
        string? Optional(string[] row, int col) => Get(row, col) is { Length: > 0 } v ? v : null;
        for (var i = 1; i < rows.Count; i++)
        {
            var row = rows[i];
            if (row.All(string.IsNullOrWhiteSpace)) continue;
            var name = Get(row, userName);
            try
            {
                // Each user in its own unit of work: one bad row doesn't undo or poison the others.
                using var uow = UnitOfWorkManager.Begin(requiresNew: true, isTransactional: false);
                if (await users.FindByNameAsync(name) != null)
                {
                    result.Skipped.Add(name);
                    continue;
                }

                var user = new IdentityUser(GuidGenerator.Create(), name, Get(row, email), CurrentTenant.Id)
                {
                    Name = Optional(row, Col("Name")),
                    Surname = Optional(row, Col("Surname")),
                };
                if (Optional(row, Col("PhoneNumber")) is { } phone) user.SetPhoneNumber(phone, false);
                user.SetIsActive(!bool.TryParse(Get(row, Col("IsActive")), out var active) || active);

                var errors = (await users.CreateAsync(user, Get(row, password))).Errors.ToList();
                var roles = Get(row, Col("Roles")).Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (errors.Count == 0 && roles.Length > 0) errors = (await users.SetRolesAsync(user, roles)).Errors.ToList();
                if (errors.Count > 0)
                {
                    result.Errors.Add(new UserImportErrorDto { Line = i + 1, Message = $"{name}: {string.Join(" ", errors.Select(e => e.Description))}" });
                    continue; // not completed: rolled back
                }
                await uow.CompleteAsync();
                result.Created++;
            }
            catch (Exception e) when (e is BusinessException or UserFriendlyException or ArgumentException)
            {
                result.Errors.Add(new UserImportErrorDto { Line = i + 1, Message = $"{name}: {e.Message}" });
            }
        }
        return result;
    }
}

/// <summary>Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF.</summary>
public static class Csv
{
    public static string Line(IEnumerable<string?> fields) => string.Join(",", fields.Select(Escape));

    /// <summary>The most rows one export returns; narrow the filters for more.</summary>
    public const int MaxExportRows = 50_000;

    /// <summary>A downloadable UTF-8 CSV file with a BOM, so Excel reads it as UTF-8.</summary>
    public static IRemoteStreamContent File(string fileName, IEnumerable<string> header, IEnumerable<IEnumerable<string?>> rows)
    {
        var csv = new StringBuilder().AppendLine(Line(header));
        foreach (var row in rows) csv.AppendLine(Line(row));
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
        return new RemoteStreamContent(new MemoryStream(bytes), fileName, "text/csv");
    }

    /// <summary>A time as shown on screen: in the configured time zone.</summary>
    public static string Time(Volo.Abp.Timing.IClock clock, DateTime? time) =>
        time.HasValue ? clock.ConvertToUserTime(time.Value).ToString("yyyy-MM-dd HH:mm:ss") : "";

    public static string Escape(string? field)
    {
        field ??= "";
        // A leading = + - @ would run as a formula in Excel (CSV injection): prefix it with '.
        if (field.Length > 0 && "=+-@".Contains(field[0])) field = "'" + field;
        return field.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? "\"" + field.Replace("\"", "\"\"") + "\"" : field;
    }

    /// <summary>Undoes the formula guard of <see cref="Escape"/>, so an exported "+962…" phone imports back unchanged.</summary>
    public static string Unescape(string field) => field.Length > 1 && field[0] == '\'' && "=+-@".Contains(field[1]) ? field[1..] : field;

    public static List<string[]> Parse(string text)
    {
        var rows = new List<string[]>();
        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else field.Append(c);
            }
            else if (c == '"') quoted = true;
            else if (c == ',') { row.Add(field.ToString()); field.Clear(); }
            else if (c is '\n' or '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                row.Add(field.ToString());
                field.Clear();
                rows.Add([.. row]);
                row.Clear();
            }
            else if (c != '﻿') field.Append(c); // skip a BOM
        }
        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add([.. row]);
        }
        return rows;
    }
}
