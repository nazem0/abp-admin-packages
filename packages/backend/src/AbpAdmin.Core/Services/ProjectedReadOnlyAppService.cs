using AbpAdmin.Localization;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace AbpAdmin.Services;

/// <summary>
/// A <see cref="ReadOnlyAppService{TEntity,TEntityDto,TKey,TGetListInput}"/> whose GetAsync/GetListAsync project into
/// the DTO inside the SQL SELECT (<see cref="ProjectTo"/>, a Mapperly projection) instead of loading tracked entities.
/// Same steps and policies as ABP's own Get/GetList (filter, count, sort, page). ABP 11 has a built-in hook for this
/// (IQueryProjector), ABP 10 does not, so the packages do it here and run the same code on both.
/// </summary>
public abstract class ProjectedReadOnlyAppService<TEntity, TDto, TKey, TGetListInput>
    : ReadOnlyAppService<TEntity, TDto, TKey, TGetListInput>
    where TEntity : class, IEntity<TKey>
{
    protected ProjectedReadOnlyAppService(IReadOnlyRepository<TEntity, TKey> repository)
        : base(repository)
    {
        LocalizationResource = typeof(AbpAdminResource);
    }

    /// <summary>Translates to SQL: the DTO's columns only.</summary>
    protected abstract IQueryable<TDto> ProjectTo(IQueryable<TEntity> query);

    public override async Task<TDto> GetAsync(TKey id)
    {
        await CheckGetPolicyAsync();
        var query = (await ReadOnlyRepository.GetQueryableAsync()).Where(EntityHelper.CreateEqualityExpressionForId<TEntity, TKey>(id));
        return await AsyncExecuter.FirstOrDefaultAsync(ProjectTo(query))
            ?? throw new EntityNotFoundException(typeof(TEntity), id);
    }

    public override async Task<PagedResultDto<TDto>> GetListAsync(TGetListInput input)
    {
        await CheckGetListPolicyAsync();
        var query = await CreateFilteredQueryAsync(input);
        var totalCount = await AsyncExecuter.CountAsync(query);
        if (totalCount == 0)
        {
            return new PagedResultDto<TDto>(0, []);
        }

        query = ApplyPaging(ApplySorting(query, input), input);
        return new PagedResultDto<TDto>(totalCount, await AsyncExecuter.ToListAsync(ProjectTo(query)));
    }
}
