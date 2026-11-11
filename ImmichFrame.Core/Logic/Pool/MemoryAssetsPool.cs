using ImmichFrame.Core.Api;
using ImmichFrame.Core.Helpers;
using ImmichFrame.Core.Interfaces;
using Microsoft.Extensions.Caching.Memory;

namespace ImmichFrame.Core.Logic.Pool;

public class MemoryAssetsPool(ImmichApi immichApi, IAccountSettings accountSettings) : CachingApiAssetsPool(new DailyApiCache())
{
    protected override async Task<IEnumerable<AssetResponseDto>> LoadAssets(CancellationToken ct = default)
    {
        var searchDate = DateTimeOffset.Now;
        var memories = await immichApi.SearchMemoriesAsync(searchDate, null, null, null, null, null, null, null, null, ct);

        var memoryAssets = new List<AssetResponseDto>();
        var excludedSet = accountSettings.ExcludedAssets is { Count: > 0 } excluded
            ? excluded.ToHashSet()
            : null;

        foreach (var memory in memories)
        {
            var assets = memory.Assets.ToList();
            var yearsAgo = searchDate.Year - memory.Data.Year;

            if (excludedSet != null && excludedSet.Count > 0)
            {
                assets = assets.Where(a => !excludedSet.Contains(a.Id)).ToList();
            }

            if (!accountSettings.ShowVideos)
            {
                assets = assets.Where(a => a.Type == AssetTypeEnum.IMAGE).ToList();
            }

            foreach (var asset in assets)
            {
                if (asset.ExifInfo == null)
                {
                    var assetInfo = await immichApi.GetAssetInfoAsync(asset.Id, null, null, ct);
                    asset.ExifInfo = assetInfo.ExifInfo;
                    asset.People = assetInfo.People;
                }

                asset.ExifInfo.Description = $"{yearsAgo} {(yearsAgo == 1 ? "year" : "years")} ago";
            }

            memoryAssets.AddRange(assets);
        }

        return memoryAssets;
    }
}

class DailyApiCache : ApiCache
{
    public DailyApiCache() : base(() => new MemoryCacheEntryOptions
    {
        AbsoluteExpiration = DateTimeOffset.Now.Date.AddDays(1)
    }
    )
    {
    }
}