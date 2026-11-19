using Riok.Mapperly.Abstractions;
using Volo.Abp.AuditLogging;

namespace AbpAdmin.Services.AuditLogs;

/// <summary>
/// Runs inside the SQL SELECT (AuditLogAppService.GetAsync/GetListAsync), so audit logs (with their actions and
/// entity changes) are never loaded as tracked aggregates.
/// </summary>
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public static partial class AuditLogDtoProjector
{
    public static partial IQueryable<AuditLogDto> ProjectTo(IQueryable<AuditLog> query);
}

/// <summary>Projects entity changes (with their property changes) straight into the SQL SELECT.</summary>
[Mapper(RequiredMappingStrategy = RequiredMappingStrategy.Target)]
public static partial class EntityChangeProjections
{
    public static partial IQueryable<EntityChangeListItemDto> ProjectToListItem(this IQueryable<EntityChange> query);

    // Filled from the owning audit log afterwards (see AuditLogAppService.WithRequestsAsync).
    [MapperIgnoreTarget(nameof(EntityChangeListItemDto.UserName))]
    [MapperIgnoreTarget(nameof(EntityChangeListItemDto.HttpMethod))]
    [MapperIgnoreTarget(nameof(EntityChangeListItemDto.Url))]
    private static partial EntityChangeListItemDto ToListItem(EntityChange source);
}
