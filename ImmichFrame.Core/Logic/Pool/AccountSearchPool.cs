using ImmichFrame.Core.Api;
using ImmichFrame.Core.Helpers;
using ImmichFrame.Core.Interfaces;

namespace ImmichFrame.Core.Logic.Pool;

public class AccountSearchPool(IApiCache apiCache, ImmichApi immichApi, IAccountSettings accountSettings) : IAssetPool
{
    public async Task<long> GetAssetCount(CancellationToken ct = default)
    {
        var tagIds = await ResolveTagIds(ct);
        if (SearchFilters.HasConfiguredSource(accountSettings) && !SearchFilters.HasMatchingBranch(accountSettings, tagIds))
        {
            return 0;
        }

        var filter = SearchFilters.ForAccount(accountSettings, tagIds);
        return await apiCache.GetOrAddAsync("stats", async () =>
        {
            var stats = await immichApi.SearchAssetStatisticsAsync(new StatisticsSearchDto
            {
                Filter = filter
            }, ct);
            return stats.Total;
        });
    }

    public async Task<IEnumerable<AssetResponseDto>> GetAssets(int requested, CancellationToken ct = default)
    {
        if (requested <= 0)
        {
            return [];
        }

        var tagIds = await ResolveTagIds(ct);
        if (SearchFilters.HasConfiguredSource(accountSettings) && !SearchFilters.HasMatchingBranch(accountSettings, tagIds))
        {
            return [];
        }

        var filter = SearchFilters.ForAccount(accountSettings, tagIds);
        if (accountSettings.ExcludedAssets is not { Count: > 0 } excludedAssets)
        {
            return await immichApi.SearchRandomAsync(new RandomSearchDto
            {
                Size = requested,
                WithExif = true,
                WithPeople = true,
                Filter = filter
            }, ct);
        }

        var excludedSet = excludedAssets.ToHashSet();
        var results = new List<AssetResponseDto>(requested);
        var seenIds = new HashSet<Guid>();
        var attempts = 0;

        while (results.Count < requested && attempts < 3)
        {
            attempts++;
            var batch = await immichApi.SearchRandomAsync(new RandomSearchDto
            {
                Size = requested - results.Count,
                WithExif = true,
                WithPeople = true,
                Filter = filter
            }, ct);

            if (batch.Count == 0)
            {
                break;
            }

            var addedAny = false;
            foreach (var asset in batch)
            {
                if (!excludedSet.Contains(asset.Id) && seenIds.Add(asset.Id))
                {
                    results.Add(asset);
                    addedAny = true;
                }
            }

            if (!addedAny)
            {
                break;
            }
        }

        return results;
    }

    private async Task<IReadOnlyList<Guid>> ResolveTagIds(CancellationToken ct)
    {
        if (accountSettings.Tags is not { Count: > 0 } values)
        {
            return [];
        }

        var allTags = await apiCache.GetOrAddAsync($"allTags_{accountSettings.ImmichServerUrl}",
            () => immichApi.GetAllTagsAsync(ct));
        var tagValueToTag = allTags.ToDictionary(t => t.Value);
        return values
            .Where(tagValueToTag.ContainsKey)
            .Select(value => tagValueToTag[value].Id)
            .ToList();
    }
}
