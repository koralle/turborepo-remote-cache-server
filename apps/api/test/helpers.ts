// tsconfig の types 条件だけでは node10 解決の TS サーバー（lens）が引けないため、実ファイルを読み込む。
import "../node_modules/@cloudflare/vitest-plugin/types/cloudflare-test.d.ts";
/* oxlint-disable typescript/no-deprecated -- テスト用の env は cloudflare:test から取得する */
import { createDb, repositories, user } from "@repo/db";
import { env } from "cloudflare:test";

import { createAuth } from "../src/auth.ts";

export const db = createDb(env.DB);

// Hono の app.request(path) は http://localhost で受ける。
export const testOrigin = "http://localhost";

const auth = createAuth(env, testOrigin);

export const seedUser = async (): Promise<string> => {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: `admin-${id}`,
    email: `admin-${id}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  return id;
};

export const seedRepository = async (
  slug: string,
  teamId: string | null = null
): Promise<string> => {
  const id = crypto.randomUUID();
  await db
    .insert(repositories)
    .values({ id, slug, teamId, createdAt: new Date() });

  return id;
};

interface KeyOptions {
  userId: string;
  repositoryId: string;
  scope: "read" | "read-write";
  expiresIn?: number;
}

export const issueKey = async (options: KeyOptions): Promise<string> => {
  const created = await auth.api.createApiKey({
    body: {
      userId: options.userId,
      name: `test (${options.scope})`,
      expiresIn: options.expiresIn ?? 86_400,
      metadata: { repositoryId: options.repositoryId, scope: options.scope },
      permissions:
        options.scope === "read"
          ? { cache: ["read"] }
          : { cache: ["read", "write"] },
    },
  });

  return created.key;
};

export const call = async (
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
  const { default: app } = await import("../src/index.ts");

  return await app.request(path, init, env);
};
