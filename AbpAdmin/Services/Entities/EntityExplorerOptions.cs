using Volo.Abp.Domain.Entities;
using Volo.Abp.MultiTenancy;

namespace AbpAdmin.Services.Entities;

/// <summary>
/// Entities the Entity Explorer exposes. Nothing is exposed unless listed here.
/// <code>Configure&lt;EntityExplorerOptions&gt;(o => o.Add&lt;Book&gt;().Add&lt;IdentityUser&gt;("PasswordHash"));</code>
/// </summary>
public class EntityExplorerOptions
{
    /// <summary>Entity name (the CLR type name unless given) → registration.</summary>
    public Dictionary<string, EntityExplorerEntity> Entities { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Never returned nor written, on any entity.</summary>
    public HashSet<string> HiddenProperties { get; } = new(StringComparer.OrdinalIgnoreCase)
    {
        "PasswordHash", "SecurityStamp", "ClientSecret",
    };

    public EntityExplorerOptions Add<TEntity>(params string[] hiddenProperties) where TEntity : class, IEntity
        => Add<TEntity>(typeof(TEntity).Name, hiddenProperties);

    public EntityExplorerOptions Add<TEntity>(string name, params string[] hiddenProperties) where TEntity : class, IEntity
    {
        Entities[name] = new EntityExplorerEntity(name, typeof(TEntity), new HashSet<string>(hiddenProperties, StringComparer.OrdinalIgnoreCase));
        return this;
    }
}

public record EntityExplorerEntity(string Name, Type EntityType, HashSet<string> HiddenProperties)
{
    /// <summary>No TenantId (not <see cref="IMultiTenant"/>): rows are shared by all tenants, so only the host may see them.</summary>
    public bool IsHostOnly => !typeof(IMultiTenant).IsAssignableFrom(EntityType);
}

/// <summary>
/// Optional: takes over create/update/delete for <typeparamref name="TEntity"/> so domain rules run
/// (e.g. go through IdentityUserManager instead of raw columns). Without one, values are written straight to the
/// entity's properties/backing fields through EF. <paramref name="values"/> are already converted to the
/// property CLR types and validated against the schema. Register with
/// <c>[ExposeServices(typeof(IEntityExplorerHandler&lt;Book&gt;))]</c> + ITransientDependency.
/// </summary>
public interface IEntityExplorerHandler<TEntity> where TEntity : class
{
    Task<TEntity> CreateAsync(IReadOnlyDictionary<string, object?> values);
    Task UpdateAsync(TEntity entity, IReadOnlyDictionary<string, object?> values);
    Task DeleteAsync(TEntity entity);
}
