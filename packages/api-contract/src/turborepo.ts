import * as v from "valibot";

// https://turborepo.dev/api/remote-cache-spec の定義を手で写したもの。
// 生成物ではないので、仕様を更新したらこのファイルも直す。

export const vArtifactHash = v.pipe(v.string(), v.regex(/^[a-fA-F0-9]+$/u));
export const vTeamId = v.string();
export const vSlug = v.string();

export const vCachingStatus = v.picklist([
  "disabled",
  "enabled",
  "over_limit",
  "paused",
]);
export const vCachingStatusResponse = v.object({ status: vCachingStatus });

export const vArtifactInfo = v.object({
  size: v.pipe(v.number(), v.integer()),
  taskDurationMs: v.pipe(v.number(), v.integer()),
  tag: v.optional(v.string()),
});

export const vArtifactUploadResponse = v.object({ urls: v.array(v.string()) });

export const vArtifactQueryRequest = v.object({ hashes: v.array(v.string()) });

export const vArtifactError = v.object({
  error: v.object({ message: v.string() }),
});

// クライアントは taskDurationMs / sha / dirtyHash を読む。spec の ArtifactInfo に sha と dirtyHash は無い。
export const vArtifactQueryEntry = v.object({
  size: v.pipe(v.number(), v.integer()),
  taskDurationMs: v.pipe(v.number(), v.integer()),
  tag: v.optional(v.string()),
  sha: v.optional(v.string()),
  dirtyHash: v.optional(v.string()),
});

export const vArtifactQueryResponse = v.record(
  v.string(),
  v.nullable(v.union([vArtifactQueryEntry, vArtifactError]))
);

export const vCacheEvent = v.object({
  sessionId: v.pipe(v.string(), v.uuid()),
  source: v.picklist(["LOCAL", "REMOTE"]),
  event: v.picklist(["HIT", "MISS"]),
  hash: v.string(),
  duration: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

export const vCacheEvents = v.array(vCacheEvent);

// spec は { code, message } だが、実クライアントは { error: { code, message } } を読む。
export const vApiError = v.object({ code: v.string(), message: v.string() });

export const vApiErrorBody = v.intersect([
  vApiError,
  v.object({ error: vApiError }),
]);

export type ApiError = v.InferOutput<typeof vApiError>;
export type ArtifactInfo = v.InferOutput<typeof vArtifactInfo>;
export type ArtifactQueryEntry = v.InferOutput<typeof vArtifactQueryEntry>;
export type ArtifactQueryRequest = v.InferOutput<typeof vArtifactQueryRequest>;
export type ArtifactUploadResponse = v.InferOutput<
  typeof vArtifactUploadResponse
>;
export type CacheEvent = v.InferOutput<typeof vCacheEvent>;
export type CachingStatus = v.InferOutput<typeof vCachingStatus>;
export type CachingStatusResponse = v.InferOutput<
  typeof vCachingStatusResponse
>;
