using System;
using System.Threading.Tasks;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Abp_Administration.Services.Dtos.Books;
using Abp_Administration.Shared;
using Abp_Administration.Entities.Books;
using Volo.Abp.Content;

namespace Abp_Administration.Services.Books;

public interface IBookAppService :
    ICrudAppService< //Defines CRUD methods
        BookDto, //Used to show books
        Guid, //Primary key of the book entity
        PagedAndSortedResultRequestDto, //Used for paging/sorting
        CreateUpdateBookDto> //Used to create/update a book
{
    Task<IRemoteStreamContent> GetListAsExcelFileAsync(BookExcelDownloadDto input);

    Task<DownloadTokenResultDto> GetDownloadTokenAsync();
}