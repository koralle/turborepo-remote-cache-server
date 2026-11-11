import { readD1Migrations } from "@cloudflare/vitest-plugin";
import type { TestProject } from "vitest/node";

export default async function setup(project: TestProject) {
  const migrations = await readD1Migrations("packages/db/drizzle");
  project.provide("migrations", migrations);
}

declare module "vitest" {
  export interface ProvidedContext {
    migrations: Awaited<ReturnType<typeof readD1Migrations>>;
  }
}
