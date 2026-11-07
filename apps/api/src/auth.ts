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
import { verifySetupToken } from "@repo/domain/setup-token";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count, eq } from "drizzle-orm";

import type { AppEnv } from "./env.ts";

const hostnameOf = (origin: string): string => {
  try {
    return new URL(origin).hostname;
  } catch (error) {
    throw new Error(`WEB_ORIGIN が URL ではない: ${origin}`, { cause: error });
  }
};

export const createAuth = (env: AppEnv) => {
  const db = createDb(env.DB);
  const webOrigin = env.WEB_ORIGIN;

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [webOrigin],
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
        rpID: hostnameOf(webOrigin),
        rpName: "Turborepo Remote Cache",
        origin: webOrigin,
        registration: {
          requireSession: false,
          resolveUser: async ({ context }) => {
            if (context === null || context === undefined || context === "") {
              throw new Error("セットアップトークンが必要");
            }
            const payload = await verifySetupToken(
              env.BETTER_AUTH_SECRET,
              context,
              Date.now()
            );
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
              await db
                .delete(passkeyTable)
                .where(eq(passkeyTable.userId, existing.id));
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
          },
        },
      }),
    ],
  });
};
