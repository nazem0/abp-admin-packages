using System;

namespace Abp_Administration.Services.Books;

[Serializable]
public class BookExcelDownloadTokenCacheItem
{
    public string Token { get; set; } = string.Empty;
}
