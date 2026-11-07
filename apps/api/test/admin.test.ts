import { describe, expect, it } from "vitest";

import { call, issueKey, seedRepository, seedUser } from "./helpers.ts";

const post = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  return await call(path, {
    ...init,
    body: init.body ?? JSON.stringify({}),
    headers,
    method: "POST",
  });
};

describe("管理 API の保護", () => {
  it("未認証ではキー一覧を取得できない", async () => {
    const response = await call("/rpc/keys/list", { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("未認証ではキーを発行できない", async () => {
    const response = await post("/rpc/keys/create", {
      body: JSON.stringify({
        json: { expiresInDays: 30, repositorySlug: "acme/web", scope: "read" },
      }),
    });

    expect(response.status).toBe(401);
  });

  it("キャッシュ用キーではキー一覧を取得できない", async () => {
    const userId = await seedUser();

    const repositoryId = await seedRepository(
      `acme/web-${crypto.randomUUID()}`
    );

    const key = await issueKey({ repositoryId, scope: "read", userId });

    const response = await call("/rpc/keys/list", {
      headers: { authorization: `Bearer ${key}` },
      method: "POST",
    });

    expect(response.status).toBe(401);
  });

  it("キャッシュ用キーではキーを失効できない", async () => {
    const userId = await seedUser();

    const repositoryId = await seedRepository(
      `acme/web-${crypto.randomUUID()}`
    );

    const key = await issueKey({ repositoryId, scope: "read-write", userId });

    const response = await post("/rpc/keys/revoke", {
      body: JSON.stringify({ json: { id: "x" } }),
      headers: { authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(401);
  });
});
