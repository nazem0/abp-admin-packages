using Volo.Abp;
using Volo.Abp.Domain.Entities.Auditing;
using Volo.Abp.MultiTenancy;

namespace AbpAdmin.Host.Entities;

/// <summary>Sample entities for the entity explorer (each tenant has its own library).</summary>
public enum BookGenre
{
    Fiction,
    NonFiction,
    Poetry,
    History,
    Science,
}

/// <summary>Deliberately has no parameterless constructor: EF binds the constructor, and so does the entity explorer.</summary>
public class Author : FullAuditedAggregateRoot<Guid>, IMultiTenant
{
    public const int MaxNameLength = 128;

    public Guid? TenantId { get; private set; }
    public string Name { get; private set; }
    public string? Country { get; private set; }
    public DateTime? BirthDate { get; private set; }

    public Author(Guid id, string name, string? country = null, DateTime? birthDate = null, Guid? tenantId = null) : base(id)
    {
        Name = Check.NotNullOrWhiteSpace(name, nameof(name), MaxNameLength);
        Country = country;
        BirthDate = birthDate;
        TenantId = tenantId;
    }
}

/// <summary>Protected setters and constructor, like most DDD entities.</summary>
public class Book : FullAuditedAggregateRoot<Guid>, IMultiTenant
{
    public const int MaxTitleLength = 256;

    public Guid? TenantId { get; protected set; }
    public Guid AuthorId { get; protected set; }
    public string Title { get; protected set; } = null!;
    public BookGenre Genre { get; protected set; }
    public decimal Price { get; protected set; }
    public DateTime PublishDate { get; protected set; }
    public bool InStock { get; protected set; }

    protected Book()
    {
    }

    public Book(Guid id, Guid authorId, string title, BookGenre genre, decimal price, DateTime publishDate, bool inStock = true, Guid? tenantId = null) : base(id)
    {
        AuthorId = authorId;
        Title = Check.NotNullOrWhiteSpace(title, nameof(title), MaxTitleLength);
        Genre = genre;
        Price = price;
        PublishDate = publishDate;
        InStock = inStock;
        TenantId = tenantId;
    }
}
