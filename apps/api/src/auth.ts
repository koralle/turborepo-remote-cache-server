import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import {
  apikey,
  account,
  createDb,
  passkey as passkeyTable,
  session,
  user,
  verification,
} from "@repo/db";
import type { Database } from "@repo/db";
import { verifySetupToken } from "@repo/domain/setup-token";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count, eq } from "drizzle-orm";

import type { AppEnv } from "./env.ts";

const hostnameOf = (origin: string): string => {
  try {
    return new URL(origin).hostname;
  } catch (error) {
    throw new Error(`Web のオリジンが URL ではない: ${origin}`, {
      cause: error,
    });
  }
};

// セットアップトークンから、登録対象の利用者を決める（新規作成・復旧・拒否）。
// パスキーとセッションを実際に消すため、plugin の外に出してテストできるようにする。
export const resolveSetupUser = async (
  db: Database,
  secret: string,
  context: string | null | undefined
): Promise<{ id: string; name: string }> => {
  if (context === null || context === undefined || context === "") {
    throw new Error("セットアップトークンが必要");
  }

  const payload = await verifySetupToken(secret, context, Date.now());

  if (payload === null) {
    throw new Error("セットアップトークンが無効か期限切れ");
  }

  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, payload.email))
    .get();

  if (existing === undefined) {
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(user).values({
      id,
      name: payload.email,
      email: payload.email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    return { id, name: payload.email };
  }

  if (payload.reset) {
    await db.delete(passkeyTable).where(eq(passkeyTable.userId, existing.id));
    await db.delete(session).where(eq(session.userId, existing.id));

    return { id: existing.id, name: existing.email };
  }

  const registered = await db
    .select({ value: count() })
    .from(passkeyTable)
    .where(eq(passkeyTable.userId, existing.id));

  if ((registered[0]?.value ?? 0) > 0) {
    throw new Error(
      "この利用者には既にパスキーがある。復旧には --reset を使う"
    );
  }

  return { id: existing.id, name: existing.email };
};

// origin はブラウザから見た Web のオリジン。
// 本番は WEB_ORIGIN に固定し、ローカルは portless の URL をリクエストから都度求める。
export const createAuth = (env: AppEnv, origin: string) => {
  const db = createDb(env.DB);

  return betterAuth({
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    // アダプタの findMany は既定で 100 件に切られる。ここを上げないと、
    // 101 件目以降の API キーが一覧に出ず失効できなくなる。
    advanced: { database: { defaultFindManyLimit: 1000 } },
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        role: {
          defaultValue: "admin",
          input: false,
          required: false,
          type: "string",
        },
      },
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        account,
        apikey,
        passkey: passkeyTable,
        session,
        user,
        verification,
      },
    }),
    plugins: [
      apiKey({
        enableMetadata: true,
        rateLimit: { enabled: false },
        keyExpiration: { defaultExpiresIn: 90 * 24 * 60 * 60 * 1000 },
      }),
      passkey({
        rpID: hostnameOf(origin),
        rpName: "Turborepo Remote Cache",
        origin,
        registration: {
          requireSession: false,
          resolveUser: async ({ context }) =>
            await resolveSetupUser(db, env.BETTER_AUTH_SECRET, context),
        },
      }),
    ],
  });
};
