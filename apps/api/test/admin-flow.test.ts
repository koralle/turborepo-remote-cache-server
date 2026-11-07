/* oxlint-disable typescript/no-deprecated -- テスト用の env は cloudflare:test から取得する */
import { session } from "@repo/db";
import { env } from "cloudflare:test";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { call, db, seedUser } from "./helpers.ts";

const origin = "http://localhost:3000";

// Better Auth はセッション Cookie を HMAC で署名する。内部形式に合わせてテストで再現する。
const signCookie = async (value: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.BETTER_AUTH_SECRET),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );
  const base64 = btoa(String.fromCodePoint(...new Uint8Array(signature)));
  return encodeURIComponent(`${value}.${base64}`);
};

const loginCookie = async (userId: string): Promise<string> => {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const now = new Date();
  await db.insert(session).values({
    createdAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
    id: crypto.randomUUID(),
    ipAddress: null,
    token,
    updatedAt: now,
    userAgent: "test",
    userId,
  });
  return `better-auth.session_token=${await signCookie(token)}`;
};

const rpc = async (path: string, cookie: string, body: unknown) =>
  await call(path, {
    body: JSON.stringify(body),
    headers: new Headers({
      cookie,
      "content-type": "application/json",
      origin,
    }),
    method: "POST",
  });

const createKey = async (cookie: string, slug: string) =>
  await rpc("/rpc/keys/create", cookie, {
    json: { expiresInDays: 30, repositorySlug: slug, scope: "read-write" },
  });

const parseIssued = (payload: unknown): { id: string; key: string } => {
  const parsed = v.safeParse(
    v.object({ json: v.object({ id: v.string(), key: v.string() }) }),
    payload
  );
  if (!parsed.success) {
    throw new Error(`キー発行の応答が不正: ${JSON.stringify(payload)}`);
  }
  return parsed.output.json;
};

describe("管理 API の一連の操作", () => {
  it("キーを発行できる", async () => {
    const cookie = await loginCookie(await seedUser());
    const response = await createKey(cookie, `acme/web-${crypto.randomUUID()}`);
    expect(response.status).toBe(200);
    const issued = parseIssued(await response.json());
    expect(issued.key.length).toBeGreaterThan(10);
  });

  it("発行したキーが一覧に出る", async () => {
    const cookie = await loginCookie(await seedUser());
    const slug = `acme/web-${crypto.randomUUID()}`;
    const created = await createKey(cookie, slug);
    const issued = parseIssued(await created.json());

    const listed = await rpc("/rpc/keys/list", cookie, {});
    const payload: unknown = await listed.json();
    const parsed = v.safeParse(
      v.object({
        json: v.object({
          keys: v.array(
            v.object({ id: v.string(), repositorySlug: v.nullable(v.string()) })
          ),
        }),
      }),
      payload
    );
    expect(parsed.success).toBeTruthy();
    if (!parsed.success) {
      throw new Error(`キー一覧の応答が不正: ${JSON.stringify(payload)}`);
    }
    expect(parsed.output.json.keys.map((key) => key.id)).toContain(issued.id);
    expect(parsed.output.json.keys.map((key) => key.repositorySlug)).toContain(
      slug
    );
  });

  it("失効するとキャッシュ API で使えなくなる", async () => {
    const cookie = await loginCookie(await seedUser());
    const created = await createKey(cookie, `acme/web-${crypto.randomUUID()}`);
    const issued = parseIssued(await created.json());

    const before = await call("/v8/artifacts/status", {
      headers: { authorization: `Bearer ${issued.key}` },
    });
    expect(before.status).toBe(200);

    const revoked = await rpc("/rpc/keys/revoke", cookie, {
      json: { id: issued.id },
    });
    expect(revoked.status).toBe(200);

    const after = await call("/v8/artifacts/status", {
      headers: { authorization: `Bearer ${issued.key}` },
    });
    expect(after.status).toBe(401);
  });

  it("Origin が一致しない変更操作を拒否する", async () => {
    const cookie = await loginCookie(await seedUser());
    const response = await call("/rpc/keys/create", {
      body: JSON.stringify({
        json: {
          expiresInDays: 30,
          repositorySlug: "acme/other",
          scope: "read",
        },
      }),
      headers: {
        cookie,
        "content-type": "application/json",
        origin: "http://evil.example",
      },
      method: "POST",
    });
    expect(response.status).toBe(403);
  });
});
