import "@cloudflare/vitest-plugin/types";
import type { AppEnv } from "../src/env.ts";

// テストの env は wrangler の vars に加えて miniflare の bindings を持つ。
declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      readonly BETTER_AUTH_SECRET: string;
    }
  }
}
