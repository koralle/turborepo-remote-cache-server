import * as v from "valibot";

import { vArtifactError, vArtifactInfo } from "./turborepo/valibot.gen.ts";

// 生成器は additionalProperties を空のオブジェクトにするため、一括照会の map を仕様どおり補う。
export const vArtifactQueryMap = v.record(
  v.string(),
  v.nullable(v.union([vArtifactInfo, vArtifactError]))
);

// Turborepo クライアントは仕様外の sha / dirtyHash も読むため、応答では両方を返す。
export const vArtifactQueryEntry = v.object({
  ...vArtifactInfo.entries,
  sha: v.optional(v.string()),
  dirtyHash: v.optional(v.string()),
});

export type ArtifactQueryEntry = v.InferOutput<typeof vArtifactQueryEntry>;
