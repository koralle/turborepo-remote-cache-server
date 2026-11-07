import { ORPCError, implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { adminContract } from "@repo/api-contract";
import { createDb, repositories } from "@repo/db";
import { permissionsForScope } from "@repo/domain/artifact";
import type { CacheScope } from "@repo/domain/artifact";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { createAuth } from "./auth.ts";
import type { AppEnv } from "./env.ts";

interface AdminContext {
  env: AppEnv;
  headers: Headers;
}

const metadataSchema = v.object({
  repositoryId: v.string(),
  scope: v.picklist(["read", "read-write"]),
});

const readMetadata = (
  metadata: unknown
): v.InferOutput<typeof metadataSchema> | null => {
  const parsed = v.safeParse(metadataSchema, metadata);
  if (parsed.success) {
    return parsed.output;
  }
  if (typeof metadata !== "string") {
    return null;
  }
  try {
    const inner = v.safeParse(metadataSchema, JSON.parse(metadata));
    return inner.success ? inner.output : null;
  } catch {
    return null;
  }
};

export const createRpcHandler = (env: AppEnv) => {
  const db = createDb(env.DB);
  const auth = createAuth(env);
  const os = implement(adminContract).$context<AdminContext>();

  const requireAdmin = async (headers: Headers) => {
    const session = await auth.api.getSession({ headers });
    if (session === null) {
      throw new ORPCError("UNAUTHORIZED");
    }
    return session;
  };

  const assertSameOrigin = (headers: Headers) => {
    if (headers.get("origin") !== env.WEB_ORIGIN) {
      throw new ORPCError("FORBIDDEN", { message: "Origin が一致しない" });
    }
  };

  const router = os.router({
    repositories: {
      list: os.repositories.list.handler(async ({ context }) => {
        await requireAdmin(context.headers);
        const rows = await db
          .select()
          .from(repositories)
          .orderBy(repositories.slug);
        return {
          repositories: rows.map((row) => ({
            id: row.id,
            slug: row.slug,
            teamId: row.teamId,
          })),
        };
      }),
    },
    keys: {
      list: os.keys.list.handler(async ({ context }) => {
        await requireAdmin(context.headers);
        const result = await auth.api.listApiKeys({
          headers: context.headers,
          query: { limit: 100 },
        });
        const rows = await db.select().from(repositories);
        const byId = new Map(rows.map((row) => [row.id, row]));

        const keys = result.apiKeys.map((key) => {
          const metadata = readMetadata(key.metadata);
          const repository =
            metadata === null ? undefined : byId.get(metadata.repositoryId);
          return {
            id: key.id,
            name: key.name ?? null,
            start: key.start ?? null,
            repositorySlug: repository?.slug ?? null,
            scope: metadata?.scope ?? ("read" satisfies CacheScope),
            expiresAt:
              key.expiresAt === null
                ? null
                : new Date(key.expiresAt).toISOString(),
            enabled: key.enabled,
            lastRequest:
              key.lastRequest === null
                ? null
                : new Date(key.lastRequest).toISOString(),
            createdAt: new Date(key.createdAt).toISOString(),
          };
        });
        return { keys };
      }),
      create: os.keys.create.handler(async ({ input, context }) => {
        const session = await requireAdmin(context.headers);
        assertSameOrigin(context.headers);
        const teamId = input.teamId ?? null;

        const existing = await db
          .select()
          .from(repositories)
          .where(eq(repositories.slug, input.repositorySlug))
          .get();

        let repositoryId: string;
        if (existing === undefined) {
          repositoryId = crypto.randomUUID();
          await db.insert(repositories).values({
            id: repositoryId,
            slug: input.repositorySlug,
            teamId,
            createdAt: new Date(),
          });
        } else {
          if (existing.teamId !== teamId) {
            throw new ORPCError("BAD_REQUEST", {
              message: "既存リポジトリの teamId と一致しない",
            });
          }
          repositoryId = existing.id;
        }

        const created = await auth.api.createApiKey({
          body: {
            userId: session.user.id,
            name: input.scope === "read" ? "read-only" : "read-write",
            expiresIn: input.expiresInDays * 24 * 60 * 60,
            permissions: permissionsForScope(input.scope),
            metadata: { repositoryId, scope: input.scope },
          },
        });
        if (created.expiresAt === null) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "API キーの期限が設定されなかった",
          });
        }

        return {
          id: created.id,
          key: created.key,
          expiresAt: new Date(created.expiresAt).toISOString(),
        };
      }),
      revoke: os.keys.revoke.handler(async ({ input, context }) => {
        await requireAdmin(context.headers);
        assertSameOrigin(context.headers);
        await auth.api.updateApiKey({
          body: { keyId: input.id, enabled: false },
          headers: context.headers,
        });
        return { success: true as const };
      }),
    },
  });

  return new RPCHandler(router, {});
};
