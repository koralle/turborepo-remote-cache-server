import { describe, expect, it } from "vitest";

import {
  artifactStorageKey,
  isArtifactHash,
  matchesRepositoryQuery,
  parseArtifactMetadata,
  permissionsForScope,
} from "../src/artifact.ts";

describe("成果物ハッシュの検証", () => {
  it("16 進数だけを受け付ける", () => {
    expect(isArtifactHash("a1b2c3")).toBeTruthy();
    expect(isArtifactHash("A1B2C3")).toBeTruthy();
    expect(isArtifactHash("xyz")).toBeFalsy();
    expect(isArtifactHash("")).toBeFalsy();
  });
});

describe("R2 の保存キー", () => {
  it("リポジトリごとに分離し、ハッシュを小文字にする", () => {
    expect(artifactStorageKey("repo-1", "ABC")).toBe("repos/repo-1/abc");
    expect(artifactStorageKey("repo-2", "ABC")).toBe("repos/repo-2/abc");
  });
});

describe("スコープの権限", () => {
  it("read と read-write を区別する", () => {
    expect(permissionsForScope("read")).toStrictEqual({ cache: ["read"] });
    expect(permissionsForScope("read-write")).toStrictEqual({
      cache: ["read", "write"],
    });
  });
});

describe("teamId / slug の照合", () => {
  const repository = { slug: "acme/web", teamId: "team-1" };

  it("未指定は許可する", () => {
    expect(matchesRepositoryQuery(repository, {})).toBeTruthy();
  });

  it("一致する teamId / slug は許可する", () => {
    expect(
      matchesRepositoryQuery(repository, { slug: "acme/web", teamId: "team-1" })
    ).toBeTruthy();
  });

  it("不一致は拒否する", () => {
    expect(
      matchesRepositoryQuery(repository, { slug: "other/repo" })
    ).toBeFalsy();
    expect(
      matchesRepositoryQuery(repository, { teamId: "team-2" })
    ).toBeFalsy();
  });

  it("teamId が未設定のリポジトリに teamId を指定すると拒否する", () => {
    expect(
      matchesRepositoryQuery(
        { slug: "acme/web", teamId: null },
        { teamId: "x" }
      )
    ).toBeFalsy();
  });
});

describe("成果物メタデータの読み取り", () => {
  it("ヘッダーを読み取る", () => {
    const headers = new Headers({
      "x-artifact-dirty-hash": "dirty",
      "x-artifact-duration": "42",
      "x-artifact-sha": "sha",
      "x-artifact-tag": "tag",
    });
    expect(parseArtifactMetadata(headers)).toStrictEqual({
      ok: true,
      value: { dirtyHash: "dirty", durationMs: 42, sha: "sha", tag: "tag" },
    });
  });

  it("duration が数値でなければ拒否する", () => {
    expect(
      parseArtifactMetadata(new Headers({ "x-artifact-duration": "1s" }))
    ).toStrictEqual({
      error: "x-artifact-duration must be a non-negative integer",
      ok: false,
    });
  });

  it("600 文字を超える tag を拒否する", () => {
    const headers = new Headers({ "x-artifact-tag": "a".repeat(601) });
    expect(parseArtifactMetadata(headers)).toStrictEqual({
      error: "x-artifact-tag must be at most 600 characters",
      ok: false,
    });
  });
});
