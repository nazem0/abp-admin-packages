using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Linq.Dynamic.Core;
using System.Linq.Expressions;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using AbpAdmin.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata;
using Volo.Abp.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Linq;
using Volo.Abp.Data;
using Volo.Abp.Authorization;
using Volo.Abp.MultiTenancy;
using Volo.Abp.Validation;

namespace AbpAdmin.Services.Entities;

public class EntityInfoDto
{
    public string Name { get; set; } = "";
    /// <summary>Key field type (see <see cref="EntityFieldDto.Type"/>), or "composite" (rows are then read-only).</summary>
    public string KeyType { get; set; } = "";
    public bool CanCreate { get; set; }
    public bool CanUpdate { get; set; }
    public bool CanDelete { get; set; }
}

public class EntitySchemaDto
{
    public string Name { get; set; } = "";
    public List<string> KeyFields { get; set; } = [];
    /// <summary>Best human-readable field (Name, UserName, …), for lookups; the key when there's none.</summary>
    public string DisplayField { get; set; } = "";
    public List<EntityFieldDto> Fields { get; set; } = [];
}

public class EntityFieldDto
{
    public string Name { get; set; } = "";
    /// <summary>string | integer | number | boolean | datetime | guid | enum | json</summary>
    public string Type { get; set; } = "";
    /// <summary>Can't be null.</summary>
    public bool Required { get; set; }
    public int? MaxLength { get; set; }
    /// <summary>Set by ABP (audit fields, concurrency stamp) or not writable; shown only. Keys are writable on create.</summary>
    public bool ReadOnly { get; set; }
    public bool IsKey { get; set; }
    public List<EntityEnumValueDto>? EnumValues { get; set; }
    /// <summary>Foreign key to another exposed entity; render as a lookup.</summary>
    public EntityReferenceDto? Reference { get; set; }
}

public class EntityEnumValueDto
{
    public string Name { get; set; } = "";
    public long Value { get; set; }
}

public class EntityReferenceDto
{
    public string Entity { get; set; } = "";
    /// <summary>The referenced entity's key field: the value this field stores.</summary>
    public string KeyField { get; set; } = "";
    public string DisplayField { get; set; } = "";
}

public class GetEntityRowsInput : PagedAndSortedResultRequestDto
{
    /// <summary>A key value (exact match) or text searched in every string field.</summary>
    public string? Filter { get; set; }
}

public class EntityValuesDto
{
    /// <summary>Field name → JSON value. Unlisted fields are left as they are; include ConcurrencyStamp on update.</summary>
    public Dictionary<string, JsonElement> Values { get; set; } = [];
}

/// <summary>
/// Generic CRUD over the entities listed in <see cref="EntityExplorerOptions"/>, driven by the EF model. Writes go
/// through ABP repositories (audit fields, soft delete, tenant, concurrency stamp, entity history all apply), and
/// through an <see cref="IEntityExplorerHandler{TEntity}"/> when one is registered.
/// </summary>
[Authorize(AbpAdminPermissions.Entities.Default)]
public class EntityExplorerAppService : ApplicationService
{
    private readonly EntityExplorerOptions _options;

    public EntityExplorerAppService(IOptions<EntityExplorerOptions> options)
    {
        _options = options.Value;
        LocalizationResource = typeof(AbpAdmin.Localization.AbpAdminResource);
    }

    public virtual async Task<List<EntityInfoDto>> GetEntitiesAsync()
    {
        var result = new List<EntityInfoDto>();
        foreach (var entity in _options.Entities.Values.OrderBy(e => e.Name))
        {
            if ((entity.IsHostOnly && CurrentTenant.IsAvailable) || !await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.Entities.Read(entity.Name)))
            {
                continue;
            }

            EntitySchemaDto schema;
            try
            {
                schema = await (await AccessorAsync(entity.Name, null)).GetSchemaAsync();
            }
            catch (AbpException exception)
            {
                /* A misconfigured entity (no IRepository<T>, not in the EF model) must not take the whole picker down,
                 * e.g. a child entity AddAllFrom picked up from a context that only registers aggregate-root
                 * repositories. Opening it directly still reports the error. */
                Logger.LogWarning(exception, "Entity explorer: '{Entity}' is left out of the list: {Reason}", entity.Name, exception.Message);
                continue;
            }

            var composite = schema.KeyFields.Count != 1;
            result.Add(new EntityInfoDto
            {
                Name = entity.Name,
                KeyType = composite ? "composite" : schema.Fields.First(f => f.IsKey).Type,
                CanCreate = !composite && await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.Entities.Create(entity.Name)),
                CanUpdate = !composite && await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.Entities.Update(entity.Name)),
                CanDelete = !composite && await AuthorizationService.IsGrantedAsync(AbpAdminPermissions.Entities.Delete(entity.Name)),
            });
        }
        return result;
    }

    public virtual async Task<EntitySchemaDto> GetSchemaAsync(string entity)
        => await (await AccessorAsync(entity, AbpAdminPermissions.Entities.Read)).GetSchemaAsync();

    public virtual async Task<PagedResultDto<Dictionary<string, object?>>> GetListAsync(string entity, GetEntityRowsInput input)
        => await (await AccessorAsync(entity, AbpAdminPermissions.Entities.Read)).GetListAsync(input);

    public virtual async Task<Dictionary<string, object?>> GetAsync(string entity, string id)
        => await (await AccessorAsync(entity, AbpAdminPermissions.Entities.Read)).GetAsync(id);

    public virtual async Task<Dictionary<string, object?>> CreateAsync(string entity, EntityValuesDto input)
        => await (await AccessorAsync(entity, AbpAdminPermissions.Entities.Create)).CreateAsync(input.Values);

    public virtual async Task<Dictionary<string, object?>> UpdateAsync(string entity, string id, EntityValuesDto input)
        => await (await AccessorAsync(entity, AbpAdminPermissions.Entities.Update)).UpdateAsync(id, input.Values);

    public virtual async Task DeleteAsync(string entity, string id)
        => await (await AccessorAsync(entity, AbpAdminPermissions.Entities.Delete)).DeleteAsync(id);

    private async Task<EntityAccessor> AccessorAsync(string name, Func<string, string>? permission)
    {
        if (!_options.Entities.TryGetValue(name, out var entity))
        {
            throw new EntityNotFoundException($"Entity '{name}' is not exposed.");
        }
        if (entity.IsHostOnly && CurrentTenant.IsAvailable)
        {
            // Shared by all tenants (no TenantId), so a tenant must never read or write it. Permissions are host-side too.
            throw new AbpAuthorizationException($"'{entity.Name}' is shared by all tenants; only the host can open it.");
        }
        if (permission != null)
        {
            await AuthorizationService.CheckAsync(permission(entity.Name));
        }

        var accessor = (EntityAccessor)Activator.CreateInstance(typeof(EntityAccessor<>).MakeGenericType(entity.EntityType))!;
        await accessor.InitializeAsync(LazyServiceProvider, entity, _options);
        return accessor;
    }
}

internal abstract class EntityAccessor
{
    /// <summary>Maintained by ABP on save; shown, never written from input (ConcurrencyStamp is the optimistic-lock token).</summary>
    private static readonly string[] AbpManagedOrder =
    [
        "CreationTime", "CreatorId", "LastModificationTime", "LastModifierId",
        "IsDeleted", "DeleterId", "DeletionTime", "ConcurrencyStamp", "EntityVersion",
    ];

    private static readonly HashSet<string> AbpManaged = new(AbpManagedOrder, StringComparer.OrdinalIgnoreCase);

    private static readonly string[] DisplayFieldCandidates = ["UserName", "DisplayName", "Name", "Title", "Code", "ClientId"];

    protected static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    protected IAbpLazyServiceProvider Services = null!;
    protected EntityExplorerEntity Entity = null!;
    protected EntityExplorerOptions Options = null!;
    protected DbContext Context = null!;
    protected IEntityType EntityType = null!;

    public abstract Task InitializeAsync(IAbpLazyServiceProvider services, EntityExplorerEntity entity, EntityExplorerOptions options);
    public abstract Task<PagedResultDto<Dictionary<string, object?>>> GetListAsync(GetEntityRowsInput input);
    public abstract Task<Dictionary<string, object?>> GetAsync(string id);
    public abstract Task<Dictionary<string, object?>> CreateAsync(Dictionary<string, JsonElement> values);
    public abstract Task<Dictionary<string, object?>> UpdateAsync(string id, Dictionary<string, JsonElement> values);
    public abstract Task DeleteAsync(string id);

    protected IEnumerable<IProperty> Properties => EntityType.GetProperties().Where(p => !IsHidden(p.Name));
    protected IReadOnlyList<IProperty> Key => EntityType.FindPrimaryKey()!.Properties;

    private bool IsHidden(string name) => Options.HiddenProperties.Contains(name) || Entity.HiddenProperties.Contains(name);

    /// <summary>Inside a tenant: TenantId is fixed to the current tenant (rows can't be moved or created for another tenant).</summary>
    protected bool InTenant;

    /// <summary>
    /// The host sees every tenant's rows (in the shared database), like a DBA; a tenant only its own (ABP's filter).
    /// Dispose after the query ran.
    /// </summary>
    protected IDisposable? AllTenantsForHost() => InTenant ? null : Services.LazyGetRequiredService<IDataFilter>().Disable<IMultiTenant>();

    protected bool IsReadOnly(IProperty p) =>
        AbpManaged.Contains(p.Name) || p.IsShadowProperty() || (InTenant && p.Name == nameof(IMultiTenant.TenantId));

    public Task<EntitySchemaDto> GetSchemaAsync() => Task.FromResult(new EntitySchemaDto
    {
        Name = Entity.Name,
        KeyFields = Key.Select(p => p.Name).ToList(),
        DisplayField = DisplayField(EntityType),
        Fields = Ordered(Properties).Select(Field).ToList(),
    });

    /// <summary>
    /// Form/column order: key; the entity's own fields as declared (its class first, then base classes), or by
    /// [Display(Order = n)]; then TenantId and ExtraProperties; ABP-managed audit fields last.
    /// </summary>
    private IEnumerable<IProperty> Ordered(IEnumerable<IProperty> properties) => properties
        .OrderBy(p => p.IsPrimaryKey() ? 0 : AbpManaged.Contains(p.Name) ? 3 : p.Name is nameof(IMultiTenant.TenantId) or "ExtraProperties" ? 2 : 1)
        .ThenBy(p => Array.IndexOf(AbpManagedOrder, p.Name)) // creation, modification, deletion, stamp
        .ThenBy(p => p.PropertyInfo?.GetCustomAttribute<DisplayAttribute>()?.GetOrder() ?? int.MaxValue)
        .ThenBy(p => InheritanceDepth(p.PropertyInfo?.DeclaringType))
        .ThenBy(p => p.PropertyInfo?.MetadataToken ?? int.MaxValue); // declaration order within a class

    private int InheritanceDepth(Type? declaringType)
    {
        var depth = 0;
        for (var t = EntityType.ClrType; t != null; t = t.BaseType, depth++)
        {
            if (t == declaringType) return depth;
        }
        return int.MaxValue; // shadow property
    }

    private string DisplayField(IEntityType type) =>
        DisplayFieldCandidates.FirstOrDefault(n => type.FindProperty(n)?.ClrType == typeof(string) && !IsHidden(n))
        ?? type.FindPrimaryKey()!.Properties[0].Name;

    private EntityFieldDto Field(IProperty p)
    {
        var type = Nullable.GetUnderlyingType(p.ClrType) ?? p.ClrType;
        var principal = p.GetContainingForeignKeys().FirstOrDefault()?.PrincipalEntityType;
        var reference = principal == null ? null : Options.Entities.Values.FirstOrDefault(e => e.EntityType == principal.ClrType);
        return new EntityFieldDto
        {
            Name = p.Name,
            Type = TypeName(type),
            Required = !p.IsNullable,
            MaxLength = p.GetMaxLength(),
            ReadOnly = IsReadOnly(p),
            IsKey = p.IsPrimaryKey(),
            EnumValues = type.IsEnum
                ? Enum.GetValues(type).Cast<object>().Select(v => new EntityEnumValueDto { Name = v.ToString()!, Value = Convert.ToInt64(v, CultureInfo.InvariantCulture) }).ToList()
                : null,
            Reference = reference == null ? null : new EntityReferenceDto { Entity = reference.Name, KeyField = principal!.FindPrimaryKey()!.Properties[0].Name, DisplayField = DisplayField(principal) },
        };
    }

    private static string TypeName(Type t) => t switch
    {
        _ when t == typeof(string) => "string",
        _ when t == typeof(bool) => "boolean",
        _ when t == typeof(Guid) => "guid",
        _ when t.IsEnum => "enum",
        _ when t == typeof(DateTime) || t == typeof(DateTimeOffset) => "datetime",
        _ when t == typeof(int) || t == typeof(long) || t == typeof(short) || t == typeof(byte) => "integer",
        _ when t == typeof(decimal) || t == typeof(double) || t == typeof(float) => "number",
        _ => "json", // ExtraProperties, byte[], DateOnly, TimeSpan, … sent and received as JSON values.
    };

    protected Dictionary<string, object?> ToRow(object entity)
    {
        var entry = Context.Entry(entity);
        return Properties.ToDictionary(p => p.Name, p => entry.Property(p.Name).CurrentValue);
    }

    protected object? ParseKey(string id)
    {
        var type = Nullable.GetUnderlyingType(Key[0].ClrType) ?? Key[0].ClrType;
        try
        {
            return type == typeof(Guid) ? Guid.Parse(id) : Convert.ChangeType(id, type, CultureInfo.InvariantCulture);
        }
        catch (Exception e) when (e is FormatException or InvalidCastException or OverflowException)
        {
            return null;
        }
    }

    /// <summary>JSON input → property CLR values, checked against the schema. ConcurrencyStamp is returned apart.</summary>
    protected Dictionary<string, object?> ConvertValues(Dictionary<string, JsonElement> input, bool isCreate, out string? concurrencyStamp)
    {
        concurrencyStamp = null;
        var errors = new List<ValidationResult>();
        var result = new Dictionary<string, object?>();
        var properties = Properties.ToDictionary(p => p.Name, StringComparer.OrdinalIgnoreCase);

        foreach (var (name, json) in input)
        {
            if (string.Equals(name, "ConcurrencyStamp", StringComparison.OrdinalIgnoreCase))
            {
                concurrencyStamp = json.ValueKind == JsonValueKind.String ? json.GetString() : null;
                continue;
            }
            if (!properties.TryGetValue(name, out var p))
            {
                errors.Add(new ValidationResult($"Unknown field '{name}'.", [name]));
                continue;
            }
            if (IsReadOnly(p) || (p.IsPrimaryKey() && !isCreate))
            {
                continue; // Clients may send the whole row back.
            }

            object? value;
            try
            {
                value = json.ValueKind == JsonValueKind.Null ? null : json.Deserialize(p.ClrType, Json);
            }
            catch (Exception e) when (e is JsonException or NotSupportedException or FormatException or InvalidOperationException)
            {
                errors.Add(new ValidationResult($"'{json}' is not a valid value for {p.Name}.", [p.Name]));
                continue;
            }

            if (value == null && !p.IsNullable)
            {
                errors.Add(new ValidationResult($"{p.Name} is required.", [p.Name]));
            }
            else if (value is string s && p.GetMaxLength() is { } max && s.Length > max)
            {
                errors.Add(new ValidationResult($"{p.Name} must be at most {max} characters.", [p.Name]));
            }
            else if (p.PropertyInfo?.GetCustomAttributes<ValidationAttribute>(true).ToList() is { Count: > 0 } attributes)
            {
                Validator.TryValidateValue(value!, new ValidationContext(input) { MemberName = p.Name, DisplayName = p.Name }, errors, attributes);
            }
            result[p.Name] = value;
        }

        ThrowIfAny(errors);
        return result;
    }

    /// <summary>Non-nullable reference fields (strings, …) still null after the values were applied.</summary>
    protected void CheckRequired(EntityEntry entry) => ThrowIfAny(Properties
        .Where(p => !p.IsNullable && !IsReadOnly(p) && !p.ClrType.IsValueType && entry.Property(p.Name).CurrentValue == null)
        .Select(p => new ValidationResult($"{p.Name} is required.", [p.Name]))
        .ToList());

    /// <summary>
    /// Foreign keys being set (all required ones on create) must point at an existing row the caller can see, so a bad
    /// or missing reference is a validation error instead of a database error. Tenants see only their own rows.
    /// </summary>
    protected async Task CheckReferencesAsync(EntityEntry entry, IEnumerable<string> changed, bool isCreate)
    {
        var errors = new List<ValidationResult>();
        var set = changed.ToHashSet(StringComparer.OrdinalIgnoreCase);
        using var allTenants = AllTenantsForHost();
        foreach (var fk in entry.Metadata.GetForeignKeys().Where(f => f.Properties.Count == 1 && f.PrincipalKey.IsPrimaryKey()))
        {
            var p = fk.Properties[0];
            if (IsReadOnly(p) || (!isCreate && !set.Contains(p.Name)))
            {
                continue;
            }
            var value = entry.Property(p.Name).CurrentValue;
            var type = Nullable.GetUnderlyingType(p.ClrType) ?? p.ClrType;
            if (value == null || (type.IsValueType && value.Equals(Activator.CreateInstance(type))))
            {
                if (fk.IsRequired)
                {
                    errors.Add(new ValidationResult($"{p.Name} is required.", [p.Name]));
                }
                continue;
            }
            if (await Context.FindAsync(fk.PrincipalEntityType.ClrType, value) == null)
            {
                errors.Add(new ValidationResult($"No {fk.PrincipalEntityType.ClrType.Name} with id {value}.", [p.Name]));
            }
        }
        ThrowIfAny(errors);
    }

    protected static void ThrowIfAny(List<ValidationResult> errors)
    {
        if (errors.Count > 0)
        {
            throw new AbpValidationException("The entity values are not valid.", errors);
        }
    }

    /// <summary>"Name desc, CreationTime" with known field names only.</summary>
    protected string Sorting(string? sorting)
    {
        if (string.IsNullOrWhiteSpace(sorting))
        {
            return string.Join(", ", Key.Select(p => p.Name));
        }

        var names = Properties.Where(p => !p.IsShadowProperty()).Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var part in sorting.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            var tokens = part.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (!names.Contains(tokens[0]) || tokens.Length > 2 || (tokens.Length == 2 && tokens[1].ToLowerInvariant() is not ("asc" or "desc")))
            {
                ThrowIfAny([new ValidationResult($"Can't sort by '{part}'.", ["Sorting"])]);
            }
        }
        return sorting;
    }
}

internal sealed class EntityAccessor<TEntity> : EntityAccessor where TEntity : class, IEntity
{
    private IRepository<TEntity> _repository = null!;
    private IEntityExplorerHandler<TEntity>? _handler;

    public override async Task InitializeAsync(IAbpLazyServiceProvider services, EntityExplorerEntity entity, EntityExplorerOptions options)
    {
        Services = services;
        Entity = entity;
        Options = options;
        InTenant = services.LazyGetRequiredService<ICurrentTenant>().IsAvailable;
        _repository = services.LazyGetService<IRepository<TEntity>>()
            ?? throw new AbpException($"No IRepository<{typeof(TEntity).Name}> is registered for the exposed entity '{entity.Name}'.");
        _handler = services.LazyGetService<IEntityExplorerHandler<TEntity>>();
        Context = await _repository.GetDbContextAsync();
        EntityType = Context.Model.FindEntityType(typeof(TEntity))
            ?? throw new AbpException($"'{typeof(TEntity).Name}' is not in the EF model.");
    }

    public override async Task<PagedResultDto<Dictionary<string, object?>>> GetListAsync(GetEntityRowsInput input)
    {
        using var allTenants = AllTenantsForHost();
        var query = await _repository.GetQueryableAsync();
        if (!string.IsNullOrWhiteSpace(input.Filter))
        {
            var filter = input.Filter.Trim();
            var key = Key.Count == 1 ? ParseKey(filter) : null;
            if (key != null)
            {
                query = query.Where(KeyEquals(key));
            }
            else
            {
                var texts = Properties.Where(p => p.ClrType == typeof(string) && !p.IsShadowProperty()).Select(p => $"({p.Name} != null && {p.Name}.Contains(@0))").ToList();
                query = texts.Count == 0 ? query.Where(_ => false) : query.Where(string.Join(" || ", texts), filter);
            }
        }

        var executer = Services.LazyGetRequiredService<IAsyncQueryableExecuter>();
        var total = await executer.CountAsync(query);
        var rows = await executer.ToListAsync(query.OrderBy(Sorting(input.Sorting)).Skip(input.SkipCount).Take(input.MaxResultCount));
        return new PagedResultDto<Dictionary<string, object?>>(total, rows.Select(ToRow).ToList());
    }

    public override async Task<Dictionary<string, object?>> GetAsync(string id) => ToRow(await FindAsync(id));

    public override async Task<Dictionary<string, object?>> CreateAsync(Dictionary<string, JsonElement> input)
    {
        var values = ConvertValues(input, isCreate: true, out _);
        TEntity entity;
        if (_handler != null)
        {
            entity = await _handler.CreateAsync(values);
        }
        else
        {
            entity = Instantiate(values);
            var entry = Context.Entry(entity);
            foreach (var (name, value) in values)
            {
                entry.Property(name).CurrentValue = value; // Private setters and backing fields included.
            }
            if (InTenant && entity is IMultiTenant)
            {
                entry.Property(nameof(IMultiTenant.TenantId)).CurrentValue = Services.LazyGetRequiredService<ICurrentTenant>().Id;
            }
            CheckRequired(entry);
            await CheckReferencesAsync(entry, values.Keys, isCreate: true);
            await _repository.InsertAsync(entity, autoSave: true); // ABP sets a Guid key when none was given.
        }
        return ToRow(entity);
    }

    public override async Task<Dictionary<string, object?>> UpdateAsync(string id, Dictionary<string, JsonElement> input)
    {
        var entity = await FindAsync(id);
        var values = ConvertValues(input, isCreate: false, out var concurrencyStamp);
        if (_handler != null)
        {
            await _handler.UpdateAsync(entity, values);
        }
        else
        {
            var entry = Context.Entry(entity);
            foreach (var (name, value) in values)
            {
                entry.Property(name).CurrentValue = value;
            }
            CheckRequired(entry);
            await CheckReferencesAsync(entry, values.Keys, isCreate: false);
        }

        if (concurrencyStamp != null && entity is IHasConcurrencyStamp stamped)
        {
            stamped.ConcurrencyStamp = concurrencyStamp; // ABP compares it on save → 409 when the row changed meanwhile.
        }
        await _repository.UpdateAsync(entity, autoSave: true);
        return ToRow(entity);
    }

    public override async Task DeleteAsync(string id)
    {
        var entity = await FindAsync(id);
        if (_handler != null)
        {
            await _handler.DeleteAsync(entity);
        }
        else
        {
            await _repository.DeleteAsync(entity, autoSave: true); // Soft delete for ISoftDelete entities.
        }
    }

    private async Task<TEntity> FindAsync(string id)
    {
        using var allTenants = AllTenantsForHost();
        if (Key.Count != 1)
        {
            throw new UserFriendlyException($"'{Entity.Name}' has a composite key; its rows can only be listed.");
        }
        var key = ParseKey(id) ?? throw new EntityNotFoundException(typeof(TEntity), id);
        var executer = Services.LazyGetRequiredService<IAsyncQueryableExecuter>();
        return await executer.FirstOrDefaultAsync((await _repository.GetQueryableAsync()).Where(KeyEquals(key)))
            ?? throw new EntityNotFoundException(typeof(TEntity), id);
    }

    private Expression<Func<TEntity, bool>> KeyEquals(object key)
    {
        var property = Key[0];
        var entity = Expression.Parameter(typeof(TEntity), "e");
        var value = Expression.Call(typeof(EF), nameof(EF.Property), [property.ClrType], entity, Expression.Constant(property.Name));
        return Expression.Lambda<Func<TEntity, bool>>(Expression.Equal(value, Expression.Constant(key, property.ClrType)), entity);
    }

    /// <summary>Parameterless constructor (any visibility) when there is one. The values are applied to the properties afterwards too.</summary>
    private TEntity Instantiate(Dictionary<string, object?> values)
    {
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        if (typeof(TEntity).GetConstructor(flags, Type.EmptyTypes) is { } empty)
        {
            return (TEntity)empty.Invoke(null);
        }

        // No parameterless constructor: the one binding the most given fields by name, like EF's constructor binding.
        // Missing parameters get their default (a Guid id then comes from ABP on insert); a constructor that rejects a
        // value (ABP's Check.*) becomes a validation error.
        var named = new Dictionary<string, object?>(values, StringComparer.OrdinalIgnoreCase);
        var ctor = typeof(TEntity).GetConstructors(flags)
            .MaxBy(c => (c.GetParameters().Count(p => named.ContainsKey(p.Name!)), -c.GetParameters().Length))!;
        try
        {
            return (TEntity)ctor.Invoke(ctor.GetParameters()
                .Select(p => named.TryGetValue(p.Name!, out var v) ? Coerce(v, p.ParameterType)
                    : p.HasDefaultValue ? p.DefaultValue
                    : p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType) : null)
                .ToArray());
        }
        catch (TargetInvocationException e) when (e.InnerException is ArgumentException arg)
        {
            ThrowIfAny([new ValidationResult(arg.Message, arg.ParamName == null ? [] : [arg.ParamName])]);
            throw;
        }
    }

    private static object? Coerce(object? value, Type type) =>
        value == null || type.IsInstanceOfType(value) ? value : JsonSerializer.SerializeToElement(value, Json).Deserialize(type, Json);
}
