import * as v from "valibot";

// https://turborepo.dev/api/remote-cache-spec のうち、このサーバーが実際に使う定義だけを
// 手で写したもの。生成物ではないので、仕様を更新したらこのファイルも直す。

export const vCachingStatus = v.picklist([
  "disabled",
  "enabled",
  "over_limit",
  "paused",
]);

export const vCachingStatusResponse = v.object({ status: vCachingStatus });

export const vArtifactQueryRequest = v.object({ hashes: v.array(v.string()) });

export const vCacheEvent = v.object({
  sessionId: v.pipe(v.string(), v.uuid()),
  source: v.picklist(["LOCAL", "REMOTE"]),
  event: v.picklist(["HIT", "MISS"]),
  hash: v.string(),
  duration: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

export const vCacheEvents = v.array(vCacheEvent);

export type CachingStatusResponse = v.InferOutput<
  typeof vCachingStatusResponse
>;
