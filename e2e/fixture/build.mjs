import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });

await writeFile("dist/out.txt", "e2e-output-v1\n");
