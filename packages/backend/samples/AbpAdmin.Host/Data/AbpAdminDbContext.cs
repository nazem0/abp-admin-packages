using Microsoft.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore.DistributedEvents;
using Volo.Abp.EntityFrameworkCore.Modeling;
using Volo.Abp.AuditLogging.EntityFrameworkCore;
using Volo.Abp.BackgroundJobs.EntityFrameworkCore;
using Volo.Abp.BlobStoring.Database.EntityFrameworkCore;
using Volo.Abp.FeatureManagement.EntityFrameworkCore;
using Volo.Abp.Identity.EntityFrameworkCore;
using Volo.Abp.OpenIddict.EntityFrameworkCore;
using Volo.Abp.PermissionManagement.EntityFrameworkCore;
using Volo.Abp.SettingManagement.EntityFrameworkCore;
using Volo.Abp.TenantManagement.EntityFrameworkCore;
using AbpAdmin.Host.Entities;

namespace AbpAdmin.Host.Data;

public class AbpAdminDbContext : AbpDbContext<AbpAdminDbContext>, IHasEventOutbox, IHasEventInbox
{
    public const string DbTablePrefix = "App";
    public const string DbSchema = null;

    public DbSet<Author> Authors { get; set; }
    public DbSet<Book> Books { get; set; }
    public DbSet<OutgoingEventRecord> OutgoingEvents { get; set; }
    public DbSet<IncomingEventRecord> IncomingEvents { get; set; }

    public AbpAdminDbContext(DbContextOptions<AbpAdminDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        /* Include modules to your migration db context */

        builder.ConfigureSettingManagement();
        builder.ConfigureBackgroundJobs();
        builder.ConfigureAuditLogging();
        builder.ConfigureFeatureManagement();
        builder.ConfigurePermissionManagement();
        builder.ConfigureBlobStoring();
        builder.ConfigureIdentity();
        builder.ConfigureOpenIddict();
        builder.ConfigureTenantManagement();
        builder.ConfigureEventOutbox();
        builder.ConfigureEventInbox();

        /* Configure your own entities here */

        builder.Entity<Author>(b =>
        {
            b.ToTable(DbTablePrefix + "Authors", DbSchema);
            b.ConfigureByConvention();
            b.Property(x => x.Name).IsRequired().HasMaxLength(Author.MaxNameLength);
            b.Property(x => x.Country).HasMaxLength(64);
        });

        builder.Entity<Book>(b =>
        {
            b.ToTable(DbTablePrefix + "Books", DbSchema);
            b.ConfigureByConvention();
            b.Property(x => x.Title).IsRequired().HasMaxLength(Book.MaxTitleLength);
            b.Property(x => x.Price).HasPrecision(18, 2);
            b.HasOne<Author>().WithMany().HasForeignKey(x => x.AuthorId).IsRequired();
        });
    }
}

