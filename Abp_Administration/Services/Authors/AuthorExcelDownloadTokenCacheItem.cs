using System;

namespace Abp_Administration.Services.Authors;

[Serializable]
public class AuthorExcelDownloadTokenCacheItem
{
    public string Token { get; set; } = string.Empty;
}
