using System.Text;
using Volo.Abp.Content;
using Volo.Abp.Timing;

namespace AbpAdmin.Services;

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
    public static string Time(IClock clock, DateTime? time) =>
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
