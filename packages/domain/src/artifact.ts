export const CACHE_READ = "cache:read";
export const CACHE_WRITE = "cache:write";

export type CacheScope = "read" | "read-write";

const hashPattern = /^[a-fA-F0-9]+$/u;

export const isArtifactHash = (value: string): boolean =>
  hashPattern.test(value);

// 大文字と小文字で別オブジェクトにならないよう、保存キーは小文字に揃える。
export const artifactStorageKey = (
  repositoryId: string,
  hash: string
): string => `repos/${repositoryId}/${hash.toLowerCase()}`;

export const permissionsForScope = (
  scope: CacheScope
): Record<string, string[]> => ({
  cache: scope === "read" ? ["read"] : ["read", "write"],
});

export interface RepositoryIdentity {
  slug: string;
  teamId: string | null;
}

export const matchesRepositoryQuery = (
  repository: RepositoryIdentity,
  query: { teamId?: string; slug?: string }
): boolean => {
  if (query.teamId !== undefined && query.teamId !== repository.teamId) {
    return false;
  }
  return query.slug === undefined || query.slug === repository.slug;
};

export interface ArtifactMetadata {
  tag: string | undefined;
  durationMs: number | undefined;
  sha: string | undefined;
  dirtyHash: string | undefined;
}

export type ParsedArtifactMetadata =
  | { ok: true; value: ArtifactMetadata }
  | { ok: false; error: string };

export const parseArtifactMetadata = (
  headers: Headers
): ParsedArtifactMetadata => {
  const tag = headers.get("x-artifact-tag") ?? undefined;
  if (tag !== undefined && tag.length > 600) {
    return {
      ok: false,
      error: "x-artifact-tag must be at most 600 characters",
    };
  }

  const duration = headers.get("x-artifact-duration") ?? undefined;
  const metadata: ArtifactMetadata = {
    tag,
    durationMs: undefined,
    sha: headers.get("x-artifact-sha") ?? undefined,
    dirtyHash: headers.get("x-artifact-dirty-hash") ?? undefined,
  };
  if (duration === undefined) {
    return { ok: true, value: metadata };
  }

  if (!/^\d+$/u.test(duration)) {
    return {
      ok: false,
      error: "x-artifact-duration must be a non-negative integer",
    };
  }

  return { ok: true, value: { ...metadata, durationMs: Number(duration) } };
};
