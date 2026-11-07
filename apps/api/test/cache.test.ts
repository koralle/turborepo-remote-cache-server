import { apikey } from "@repo/db";
import { eq } from "drizzle-orm";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { call, db, issueKey, seedRepository, seedUser } from "./helpers.ts";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const body = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);

const setup = async (
  scope: "read" | "read-write" = "read-write",
  teamId: string | null = null
) => {
  const userId = await seedUser();
  const slug = `acme/web-${crypto.randomUUID()}`;
  const repositoryId = await seedRepository(slug, teamId);
  const key = await issueKey({ repositoryId, scope, userId });

  return { key, repositoryId, slug, userId };
};

const put = async (
  key: string,
  hash: string,
  payload = body,
  extra: Record<string, string> = {}
) =>
  await call(`/v8/artifacts/${hash}`, {
    body: payload,
    headers: {
      authorization: `Bearer ${key}`,
      "content-length": String(payload.length),
      ...extra,
    },
    method: "PUT",
  });

const keyRow = async (userId: string) => {
  const [row] = await db
    .select()
    .from(apikey)
    .where(eq(apikey.referenceId, userId));

  if (row === undefined) {
    throw new Error("API キーが作成されていない");
  }

  return row;
};

describe("キャッシュ API の認証", () => {
  it("トークンが無ければ 401", async () => {
    const response = await call(`/v8/artifacts/${hashA}`);
    expect(response.status).toBe(401);
  });

  it("不正なキーは 401", async () => {
    const response = await call(`/v8/artifacts/${hashA}`, {
      headers: { authorization: "Bearer nope" },
    });

    expect(response.status).toBe(401);
  });

  it("失効したキーは 401", async () => {
    const { key, userId } = await setup();
    const row = await keyRow(userId);
    await db
      .update(apikey)
      .set({ enabled: false })
      .where(eq(apikey.id, row.id));
    const response = await put(key, hashA);
    expect(response.status).toBe(401);
  });

  it("期限切れのキーは 401", async () => {
    const { key, userId } = await setup();
    const row = await keyRow(userId);
    await db
      .update(apikey)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apikey.id, row.id));
    const response = await put(key, hashA);
    expect(response.status).toBe(401);
  });

  it("読み取り専用キーでは書き込めない", async () => {
    const { key } = await setup("read");
    const response = await put(key, hashA);
    expect(response.status).toBe(401);
  });
});

describe("成果物の保存と復元", () => {
  it("保存すると 202 を返す", async () => {
    const { key } = await setup();
    const response = await put(key, hashA);
    expect(response.status).toBe(202);
  });

  it("HEAD でサイズとメタデータを返す", async () => {
    const { key } = await setup();
    await put(key, hashA, body, {
      "x-artifact-dirty-hash": "dirty",
      "x-artifact-duration": "42",
      "x-artifact-sha": "deadbeef",
    });

    const head = await call(`/v8/artifacts/${hashA}`, {
      headers: { authorization: `Bearer ${key}` },
      method: "HEAD",
    });

    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(body.length));
    expect(head.headers.get("x-artifact-duration")).toBe("42");
    expect(head.headers.get("x-artifact-sha")).toBe("deadbeef");
    expect(head.headers.get("x-artifact-dirty-hash")).toBe("dirty");
  });

  it("GET でバイナリと署名タグをそのまま返す", async () => {
    const { key } = await setup();
    await put(key, hashA, body, { "x-artifact-tag": "c2lnbmF0dXJl" });

    const download = await call(`/v8/artifacts/${hashA}`, {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(download.status).toBe(200);
    expect(download.headers.get("x-artifact-tag")).toBe("c2lnbmF0dXJl");
    expect(new Uint8Array(await download.arrayBuffer())).toStrictEqual(body);
  });

  it("存在しない成果物は HEAD/GET とも 404", async () => {
    const { key } = await setup();

    const download = await call(`/v8/artifacts/${hashB}`, {
      headers: { authorization: `Bearer ${key}` },
    });

    const head = await call(`/v8/artifacts/${hashB}`, {
      headers: { authorization: `Bearer ${key}` },
      method: "HEAD",
    });

    expect(download.status).toBe(404);
    expect(head.status).toBe(404);
  });

  it("status を返す", async () => {
    const { key } = await setup();

    const status = await call("/v8/artifacts/status", {
      headers: { authorization: `Bearer ${key}` },
    });

    await expect(status.json()).resolves.toStrictEqual({ status: "enabled" });
  });

  it("events を受け付ける", async () => {
    const { key } = await setup();

    const response = await call("/v8/artifacts/events", {
      body: JSON.stringify([
        {
          event: "HIT",
          hash: hashA,
          sessionId: crypto.randomUUID(),
          source: "REMOTE",
        },
      ]),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
  });

  it("不正な events は 400", async () => {
    const { key } = await setup();

    const response = await call("/v8/artifacts/events", {
      body: JSON.stringify([{ event: "NOPE" }]),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
  });

  it("一括照会で保存済みと未保存を区別する", async () => {
    const { key } = await setup();
    await put(key, hashA);

    const response = await call("/v8/artifacts", {
      body: JSON.stringify({ hashes: [hashA, hashB] }),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    const payload: unknown = await response.json();
    const parsed = v.safeParse(v.record(v.string(), v.unknown()), payload);
    expect(parsed.success).toBeTruthy();

    if (!parsed.success) {
      throw new Error("応答がオブジェクトではない");
    }

    expect(parsed.output[hashA]).toBeTruthy();
    expect(parsed.output[hashB]).toBeNull();
  });
});

describe("リポジトリ分離と teamId / slug", () => {
  it("別リポジトリからは読めない", async () => {
    const first = await setup();
    await put(first.key, hashA, body);
    const second = await setup();

    const response = await call(`/v8/artifacts/${hashA}`, {
      headers: { authorization: `Bearer ${second.key}` },
    });

    expect(response.status).toBe(404);
  });

  it("別リポジトリから同じハッシュを上書きできない", async () => {
    const first = await setup();
    await put(first.key, hashA, body);
    const second = await setup();
    await put(second.key, hashA, new Uint8Array([1, 2, 3]));

    const original = await call(`/v8/artifacts/${hashA}`, {
      headers: { authorization: `Bearer ${first.key}` },
    });

    expect(new Uint8Array(await original.arrayBuffer())).toStrictEqual(body);
  });

  it("一致する teamId / slug は許可する", async () => {
    const { key, slug } = await setup("read-write", "team-1");

    const response = await call(
      `/v8/artifacts/${hashA}?teamId=team-1&slug=${encodeURIComponent(slug)}`,
      { headers: { authorization: `Bearer ${key}` } }
    );

    expect(response.status).toBe(404);
  });

  it("slug の偽装を拒否する", async () => {
    const { key } = await setup("read-write", "team-1");

    const response = await call(`/v8/artifacts/${hashA}?slug=other/repo`, {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(403);
  });

  it("teamId の偽装を拒否する", async () => {
    const { key } = await setup("read-write", "team-1");

    const response = await call(`/v8/artifacts/${hashA}?teamId=team-9`, {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(403);
  });

  it("teamId 未設定のリポジトリに teamId を指定すると拒否する", async () => {
    const { key } = await setup();

    const response = await call(`/v8/artifacts/${hashA}?teamId=team-1`, {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(403);
  });
});

describe("サイズと入力の境界", () => {
  it("上限を超えると 413", async () => {
    const { key } = await setup();
    const response = await put(key, hashA, new Uint8Array(32));
    expect(response.status).toBe(413);
  });

  it("不正なハッシュは 400", async () => {
    const { key } = await setup();

    const response = await call("/v8/artifacts/zzz", {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(response.status).toBe(400);
  });

  it("600 文字を超えるタグは 400", async () => {
    const { key } = await setup();

    const response = await put(key, hashA, body, {
      "x-artifact-tag": "a".repeat(601),
    });

    expect(response.status).toBe(400);
  });

  it("Content-Length が無いアップロードを拒否する", async () => {
    const { key } = await setup();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(body);
        controller.close();
      },
    });

    const response = await call(`/v8/artifacts/${hashA}`, {
      body: stream,
      headers: { authorization: `Bearer ${key}` },
      method: "PUT",
    });

    expect(response.status).toBe(411);
  });
});

describe("仕様とのルーティング対応", () => {
  it("接頭辞なしの PUT を 202 で受け、/v8 から取得できる", async () => {
    const { key } = await setup();

    const response = await call(`/artifacts/${hashA}`, {
      body,
      headers: {
        authorization: `Bearer ${key}`,
        "content-length": String(body.length),
        "x-artifact-tag": "dGFn",
      },
      method: "PUT",
    });

    expect(response.status).toBe(202);

    const download = await call(`/v8/artifacts/${hashA}`, {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(download.status).toBe(200);
    expect(download.headers.get("x-artifact-tag")).toBe("dGFn");
  });

  it("接頭辞なしの HEAD がヘッダーを返す", async () => {
    const { key } = await setup();
    await put(key, hashA, body, { "x-artifact-duration": "7" });

    const head = await call(`/artifacts/${hashA}`, {
      headers: { authorization: `Bearer ${key}` },
      method: "HEAD",
    });

    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(body.length));
    expect(head.headers.get("x-artifact-duration")).toBe("7");
  });

  it("OPTIONS が認証ヘッダーを許可する", async () => {
    const response = await call(`/v8/artifacts/status`, { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "authorization"
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "PUT"
    );
  });

  it("status と一括照会が仕様のパスで動く", async () => {
    const { key } = await setup();

    const status = await call("/artifacts/status", {
      headers: { authorization: `Bearer ${key}` },
    });

    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toStrictEqual({ status: "enabled" });

    const batch = await call("/artifacts", {
      body: JSON.stringify({ hashes: [hashA] }),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(batch.status).toBe(200);
  });
});
