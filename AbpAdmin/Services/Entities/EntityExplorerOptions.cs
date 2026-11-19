using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Volo.Abp.Domain.Entities;
using Volo.Abp.MultiTenancy;

namespace AbpAdmin.Services.Entities;

/// <summary>
/// Entities the Entity Explorer exposes. Nothing is exposed unless listed here.
/// <code>Configure&lt;EntityExplorerOptions&gt;(o => o.Add&lt;Book&gt;().Add&lt;IdentityUser&gt;("PasswordHash"));</code>
/// or every entity a DbContext has a DbSet for: <c>o.AddAllFrom&lt;MyDbContext&gt;(typeof(Tenant))</c>.
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

    /// <summary>Exposes <typeparamref name="TEntity"/> under its CLR type name; <paramref name="hiddenProperties"/> are never returned nor written.</summary>
    public EntityExplorerOptions Add<TEntity>(params string[] hiddenProperties) where TEntity : class, IEntity
        => AddAs<TEntity>(typeof(TEntity).Name, hiddenProperties);

    /// <summary>Exposes <typeparamref name="TEntity"/> under <paramref name="name"/> (e.g. when two entities share a type name).</summary>
    public EntityExplorerOptions AddAs<TEntity>(string name, params string[] hiddenProperties) where TEntity : class, IEntity
    {
        Entities[name] = new EntityExplorerEntity(name, typeof(TEntity), new HashSet<string>(hiddenProperties, StringComparer.OrdinalIgnoreCase));
        return this;
    }

    /// <summary>
    /// Every entity <typeparamref name="TDbContext"/> has a <c>DbSet&lt;T&gt;</c> property for (the rule ABP's
    /// AddDefaultRepositories uses), named by its CLR type name, except <paramref name="except"/>. Module tables a context
    /// only maps with <c>builder.ConfigureXxx()</c> have no DbSet and stay out. Call <see cref="Add{TEntity}(string[])"/>
    /// afterwards to hide fields on one of them.
    /// <code>o.AddAllFrom&lt;MyDbContext&gt;(typeof(IdentitySecurityLog), typeof(Tenant))</code>
    /// </summary>
    public EntityExplorerOptions AddAllFrom<TDbContext>(params Type[] except) where TDbContext : DbContext
    {
        var skip = except.ToHashSet();
        var types = typeof(TDbContext).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.PropertyType)
            .Where(t => t.IsGenericType && t.GetGenericTypeDefinition() == typeof(DbSet<>))
            .Select(t => t.GenericTypeArguments[0])
            .Where(t => typeof(IEntity).IsAssignableFrom(t) && !skip.Contains(t))
            .Distinct();
        foreach (var type in types)
        {
            Entities[type.Name] = new EntityExplorerEntity(type.Name, type, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        }

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
