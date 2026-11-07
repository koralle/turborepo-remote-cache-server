import { passkey, session, user } from "@repo/db";
import { signSetupToken } from "@repo/domain/setup-token";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { resolveSetupUser } from "../src/auth.ts";
import { db, seedUser } from "./helpers.ts";

// vitest.config.ts の miniflare bindings と同じ値。
const secret = "test-secret-test-secret-test-secret";

const token = async (
  email: string,
  options: { exp?: number; reset?: boolean } = {}
): Promise<string> =>
  await signSetupToken(secret, {
    email,
    exp: options.exp ?? Date.now() + 60_000,
    reset: options.reset ?? false,
  });

const seedPasskey = async (userId: string): Promise<void> => {
  await db.insert(passkey).values({
    backedUp: false,
    counter: 0,
    createdAt: new Date(),
    credentialID: crypto.randomUUID(),
    deviceType: "singleDevice",
    id: crypto.randomUUID(),
    publicKey: "public-key",
    userId,
  });
};

const seedSession = async (userId: string): Promise<void> => {
  const now = new Date();

  await db.insert(session).values({
    createdAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    updatedAt: now,
    userId,
  });
};

const countPasskeys = async (userId: string): Promise<number> => {
  const rows = await db
    .select()
    .from(passkey)
    .where(eq(passkey.userId, userId));

  return rows.length;
};

const countSessions = async (userId: string): Promise<number> => {
  const rows = await db
    .select()
    .from(session)
    .where(eq(session.userId, userId));

  return rows.length;
};

describe("セットアップトークンから登録する利用者を決める", () => {
  it("初回は利用者を作る", async () => {
    const email = `new-${crypto.randomUUID()}@example.com`;

    const resolved = await resolveSetupUser(db, secret, await token(email));

    const row = await db
      .select()
      .from(user)
      .where(eq(user.id, resolved.id))
      .get();

    expect(row?.email).toBe(email);
    expect(row?.role).toBe("admin");
  });

  it("期限切れと署名違いを拒否する", async () => {
    const email = `expired-${crypto.randomUUID()}@example.com`;

    await expect(
      resolveSetupUser(db, secret, await token(email, { exp: Date.now() - 1 }))
    ).rejects.toThrow("無効か期限切れ");

    await expect(
      resolveSetupUser(db, secret, await token(email))
    ).resolves.toBeDefined();

    await expect(resolveSetupUser(db, secret, "invalid-token")).rejects.toThrow(
      "無効か期限切れ"
    );
  });

  it("既にパスキーがある利用者は reset 無しでは拒否する", async () => {
    const userId = await seedUser();
    const row = await db.select().from(user).where(eq(user.id, userId)).get();

    if (row === undefined) {
      throw new Error("利用者が作成されていない");
    }

    await seedPasskey(userId);

    await expect(
      resolveSetupUser(db, secret, await token(row.email))
    ).rejects.toThrow("既にパスキーがある");
  });

  it("reset はパスキーとセッションを消す", async () => {
    const userId = await seedUser();
    const row = await db.select().from(user).where(eq(user.id, userId)).get();

    if (row === undefined) {
      throw new Error("利用者が作成されていない");
    }

    await seedPasskey(userId);
    await seedSession(userId);

    const resolved = await resolveSetupUser(
      db,
      secret,
      await token(row.email, { reset: true })
    );

    expect(resolved.id).toBe(userId);
    await expect(countPasskeys(userId)).resolves.toBe(0);
    await expect(countSessions(userId)).resolves.toBe(0);
  });
});
