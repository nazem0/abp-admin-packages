using System;
using Abp_Administration.Entities.Books;

namespace Abp_Administration.Services.Dtos.Books;

public class BookExcelDto
{
    public string Name { get; set; }

    public string AuthorName { get; set; }

    public BookType Type { get; set; }

    public DateTime PublishDate { get; set; }

    public float Price { get; set; }
}
