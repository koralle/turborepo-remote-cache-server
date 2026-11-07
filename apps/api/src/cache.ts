import { vArtifactQueryRequest, vCacheEvents } from "@repo/api-contract";
import { createDb, repositories } from "@repo/db";
import {
  artifactStorageKey,
  matchesRepositoryQuery,
  parseArtifactMetadata,
  toArtifactHash,
  toRepositoryId,
} from "@repo/domain/artifact";
import type { RepositoryId } from "@repo/domain/artifact";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import * as v from "valibot";

import { createAuth } from "./auth.ts";
import type { AppEnv } from "./env.ts";

const defaultMaxBytes = 100 * 1024 * 1024;
const maxBatchHashes = 100;

interface CacheVariables {
  repository: {
    id: RepositoryId;
    slug: string;
    teamId: string | null;
  };
}

interface CacheEnv {
  Bindings: AppEnv;
  Variables: CacheVariables;
}

interface ApiErrorBody {
  code: string;
  message: string;
  error: { code: string; message: string };
}

interface BatchEntry {
  size: number;
  taskDurationMs: number;
  tag?: string;
  sha?: string;
  dirtyHash?: string;
}

const errorBody = (code: string, message: string): ApiErrorBody => ({
  code,
  error: { code, message },
  message,
});

const corsHeaders = {
  "access-control-allow-headers":
    "authorization, content-type, x-artifact-client-ci, x-artifact-client-interactive, x-artifact-dirty-hash, x-artifact-duration, x-artifact-sha, x-artifact-tag",
  "access-control-allow-methods": "GET, HEAD, POST, PUT, OPTIONS",
  "access-control-allow-origin": "*",
};

const bearerToken = (header: string | undefined): string | null => {
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer (?<token>.+)$/u.exec(header);
  return match?.groups?.["token"] ?? null;
};

const metadataHeaders = (metadata: Record<string, string> | undefined) => {
  const { durationMs = "0", tag, sha, dirtyHash } = metadata ?? {};
  const headers: Record<string, string> = { "x-artifact-duration": durationMs };
  if (tag !== undefined) {
    headers["x-artifact-tag"] = tag;
  }
  if (sha !== undefined) {
    headers["x-artifact-sha"] = sha;
  }
  if (dirtyHash !== undefined) {
    headers["x-artifact-dirty-hash"] = dirtyHash;
  }
  return headers;
};

const maxBytesOf = (env: AppEnv): number => {
  const configured = Number(env.MAX_ARTIFACT_BYTES);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : defaultMaxBytes;
};

const repositoryIdOf = (metadata: unknown): string | null => {
  const schema = v.object({ repositoryId: v.string() });
  const direct = v.safeParse(schema, metadata);
  if (direct.success) {
    return direct.output.repositoryId;
  }
  if (typeof metadata !== "string") {
    return null;
  }
  try {
    const inner = v.safeParse(schema, JSON.parse(metadata));
    return inner.success ? inner.output.repositoryId : null;
  } catch {
    return null;
  }
};

const batchEntryOf = (object: R2Object): BatchEntry => {
  const { durationMs = "0", tag, sha, dirtyHash } = object.customMetadata ?? {};
  const entry: BatchEntry = {
    size: object.size,
    taskDurationMs: Number(durationMs),
  };
  if (tag !== undefined) {
    entry.tag = tag;
  }
  if (sha !== undefined) {
    entry.sha = sha;
  }
  if (dirtyHash !== undefined) {
    entry.dirtyHash = dirtyHash;
  }
  return entry;
};

export const createCacheRoutes = () => {
  const cache = new Hono<CacheEnv>();

  cache.use("/artifacts/*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return c.newResponse(null, { headers: corsHeaders, status: 204 });
    }

    const { env } = c;
    const required =
      c.req.method === "PUT" ? { cache: ["write"] } : { cache: ["read"] };
    const token = bearerToken(c.req.header("authorization"));
    if (token === null) {
      return c.json(errorBody("unauthorized", "Bearer トークンが必要"), 401);
    }

    const auth = createAuth(env);
    let valid = false;
    let keyMetadata: unknown = null;
    try {
      const result = await auth.api.verifyApiKey({
        body: { key: token, permissions: required },
      });
      const { key, valid: isValid } = result;
      valid = isValid;
      keyMetadata = key?.metadata ?? null;
    } catch {
      valid = false;
    }
    if (!valid) {
      return c.json(errorBody("unauthorized", "API キーが無効"), 401);
    }

    const repositoryId = repositoryIdOf(keyMetadata);
    if (repositoryId === null) {
      return c.json(
        errorBody("forbidden", "キーにリポジトリが紐付いていない"),
        403
      );
    }

    const db = createDb(env.DB);
    const repository = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, repositoryId))
      .get();
    if (repository === undefined) {
      return c.json(errorBody("forbidden", "リポジトリが存在しない"), 403);
    }

    const query: { teamId?: string; slug?: string } = {};
    const teamId = c.req.query("teamId");
    if (teamId !== undefined) {
      query.teamId = teamId;
    }
    const slug = c.req.query("slug");
    if (slug !== undefined) {
      query.slug = slug;
    }
    if (!matchesRepositoryQuery(repository, query)) {
      return c.json(errorBody("forbidden", "teamId / slug が一致しない"), 403);
    }

    const storedRepositoryId = toRepositoryId(repository.id);
    if (storedRepositoryId === null) {
      return c.json(errorBody("forbidden", "リポジトリ ID が不正"), 403);
    }
    c.set("repository", {
      id: storedRepositoryId,
      slug: repository.slug,
      teamId: repository.teamId,
    });
    // Hono の next() は void を返すため、callback-return の要求と両立しない。
    // oxlint-disable-next-line node/callback-return
    await next();
    return c.res;
  });

  cache.get("/artifacts/status", (c) =>
    c.json({ status: "enabled" }, 200, corsHeaders)
  );

  cache.on("HEAD", "/artifacts/:hash", async (c) => {
    const parsedHash = toArtifactHash(c.req.param("hash"));
    if (parsedHash === null) {
      return c.body(null, 400, corsHeaders);
    }
    const object = await c.env.BUCKET.head(
      artifactStorageKey(c.var.repository.id, parsedHash)
    );
    if (object === null) {
      return c.body(null, 404, corsHeaders);
    }
    return c.body(null, 200, {
      ...corsHeaders,
      ...metadataHeaders(object.customMetadata),
      "content-length": String(object.size),
    });
  });

  cache.get("/artifacts/:hash", async (c) => {
    const parsedHash = toArtifactHash(c.req.param("hash"));
    if (parsedHash === null) {
      return c.json(errorBody("bad_request", "ハッシュが不正"), 400);
    }
    const object = await c.env.BUCKET.get(
      artifactStorageKey(c.var.repository.id, parsedHash)
    );
    if (object === null) {
      return c.json(errorBody("not_found", "成果物が無い"), 404);
    }
    return c.newResponse(object.body, {
      headers: {
        ...corsHeaders,
        ...metadataHeaders(object.customMetadata),
        "content-length": String(object.size),
        "content-type": "application/octet-stream",
      },
      status: 200,
    });
  });

  cache.put("/artifacts/:hash", async (c) => {
    const hash = c.req.param("hash");
    const parsedHash = toArtifactHash(hash);
    if (parsedHash === null) {
      return c.json(errorBody("bad_request", "ハッシュが不正"), 400);
    }

    const declaredLength = c.req.header("content-length");
    if (declaredLength === undefined || !/^\d+$/u.test(declaredLength)) {
      return c.json(errorBody("bad_request", "Content-Length が必要"), 411);
    }
    if (Number(declaredLength) > maxBytesOf(c.env)) {
      return c.json(errorBody("payload_too_large", "成果物が大きすぎる"), 413);
    }

    const parsed = parseArtifactMetadata(c.req.raw.headers);
    if (!parsed.ok) {
      return c.json(errorBody("bad_request", parsed.error), 400);
    }

    const { body } = c.req.raw;
    if (body === null) {
      return c.json(errorBody("bad_request", "本文が無い"), 400);
    }

    const customMetadata: Record<string, string> = {
      durationMs: String(parsed.value.durationMs ?? 0),
    };
    if (parsed.value.tag !== undefined) {
      customMetadata["tag"] = parsed.value.tag;
    }
    if (parsed.value.sha !== undefined) {
      customMetadata["sha"] = parsed.value.sha;
    }
    if (parsed.value.dirtyHash !== undefined) {
      customMetadata["dirtyHash"] = parsed.value.dirtyHash;
    }

    const stored = await c.env.BUCKET.put(
      artifactStorageKey(c.var.repository.id, parsedHash),
      body,
      {
        customMetadata,
        httpMetadata: { contentType: "application/octet-stream" },
      }
    );
    if (stored === null) {
      return c.json(errorBody("internal_error", "保存に失敗した"), 500);
    }
    return c.json({ urls: [] }, 202, corsHeaders);
  });

  cache.post("/artifacts", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(errorBody("bad_request", "JSON ではない"), 400);
    }
    const parsed = v.safeParse(vArtifactQueryRequest, payload);
    if (!parsed.success || parsed.output.hashes.length > maxBatchHashes) {
      return c.json(errorBody("bad_request", "hashes が不正"), 400);
    }

    const entries = await Promise.all(
      parsed.output.hashes.map(async (hash) => {
        const parsedHash = toArtifactHash(hash);
        if (parsedHash === null) {
          return [hash, null] as const;
        }
        const object = await c.env.BUCKET.head(
          artifactStorageKey(c.var.repository.id, parsedHash)
        );
        return [hash, object === null ? null : batchEntryOf(object)] as const;
      })
    );

    return c.json(Object.fromEntries(entries), 200, corsHeaders);
  });

  cache.post("/artifacts/events", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(errorBody("bad_request", "JSON ではない"), 400);
    }
    const parsed = v.safeParse(vCacheEvents, payload);
    if (!parsed.success) {
      return c.json(errorBody("bad_request", "イベントが不正"), 400);
    }
    return c.body(null, 200, corsHeaders);
  });

  return cache;
};
