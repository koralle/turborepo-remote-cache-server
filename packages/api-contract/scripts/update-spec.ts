import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import * as v from "valibot";

const source = "https://turborepo.dev/api/remote-cache-spec";

const specInfoSchema = v.looseObject({
  info: v.looseObject({ title: v.string(), version: v.string() }),
});

type SpecInfo = v.InferOutput<typeof specInfoSchema>;

const readSpecInfo = (text: string): SpecInfo => {
  try {
    return v.parse(specInfoSchema, JSON.parse(text));
  } catch (error) {
    throw new Error("OpenAPI の応答を解釈できない", { cause: error });
  }
};

const main = async (): Promise<void> => {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`${source} の取得に失敗した: ${response.status}`);
  }
  const body = await response.text();
  const spec = readSpecInfo(body);

  await writeFile(
    new URL("../spec/turborepo-remote-cache.openapi.json", import.meta.url),
    body
  );
  await writeFile(
    new URL("../spec/SOURCE.md", import.meta.url),
    `# OpenAPI の出典

- 取得元: ${source}
- 取得日: ${new Date().toISOString().slice(0, 10)}
- 仕様: ${spec.info.title} v${spec.info.version}
- sha256: ${createHash("sha256").update(body).digest("hex")}
- 保存先: \`spec/turborepo-remote-cache.openapi.json\`

\`pnpm spec:update\` で再取得する。生成物は \`pnpm generate\` で作る。
`
  );
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
