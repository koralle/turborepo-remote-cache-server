import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const styledSystem = fileURLToPath(
  new URL("../apps/web/styled-system", import.meta.url)
);
const manifest = fileURLToPath(
  new URL("../apps/web/styled-system.sha256", import.meta.url)
);

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? await walk(full) : [full];
    })
  );
  return nested.flat();
};

const walked = await walk(styledSystem);
const files = walked.toSorted();
const contents = await Promise.all(
  files.map(
    async (file) =>
      [path.relative(styledSystem, file), await readFile(file)] as const
  )
);

const hash = createHash("sha256");
for (const [name, content] of contents) {
  hash.update(name);
  hash.update("\0");
  hash.update(content);
}
await writeFile(manifest, `${hash.digest("hex")}\n`);
