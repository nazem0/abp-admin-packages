using Riok.Mapperly.Abstractions;
using Volo.Abp.Mapperly;
using Abp_Administration.Entities.Authors;
using Abp_Administration.Entities.Books;
using Abp_Administration.Services.Dtos.Authors;
using Abp_Administration.Services.Dtos.Books;
namespace Abp_Administration.ObjectMapping;
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public partial class Abp_AdministrationBookToBookDtoMapper : MapperBase<Book, BookDto>
{
    [MapperIgnoreTarget(nameof(BookDto.AuthorName))]
    public override partial BookDto Map(Book source);

    [MapperIgnoreTarget(nameof(BookDto.AuthorName))]
    public override partial void Map(Book source, BookDto destination);
}
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public partial class Abp_AdministrationCreateUpdateBookDtoToBookMapper : MapperBase<CreateUpdateBookDto, Book>
{
    public override partial Book Map(CreateUpdateBookDto source);
    public override partial void Map(CreateUpdateBookDto source, Book destination);
}
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public partial class Abp_AdministrationBookDtoToCreateUpdateBookDtoMapper : MapperBase<BookDto, CreateUpdateBookDto>
{
    public override partial CreateUpdateBookDto Map(BookDto source);
    public override partial void Map(BookDto source, CreateUpdateBookDto destination);
}
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public partial class Abp_AdministrationAuthorToAuthorDtoMapper : MapperBase<Author, AuthorDto>
{
    public override partial AuthorDto Map(Author source);
    public override partial void Map(Author source, AuthorDto destination);
}
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public partial class Abp_AdministrationCreateUpdateAuthorDtoToAuthorMapper : MapperBase<CreateUpdateAuthorDto, Author>
{
    public override partial Author Map(CreateUpdateAuthorDto source);
    public override partial void Map(CreateUpdateAuthorDto source, Author destination);
}
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public partial class Abp_AdministrationAuthorToAuthorExcelDtoMapper : MapperBase<Author, AuthorExcelDto>
{
    public override partial AuthorExcelDto Map(Author source);
    public override partial void Map(Author source, AuthorExcelDto destination);
}
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public partial class Abp_AdministrationAuthorDtoToCreateUpdateAuthorDtoMapper : MapperBase<AuthorDto, CreateUpdateAuthorDto>
{
    public override partial CreateUpdateAuthorDto Map(AuthorDto source);
    public override partial void Map(AuthorDto source, CreateUpdateAuthorDto destination);
}
