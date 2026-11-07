import { Hono } from "hono";

import { createAuth } from "./auth.ts";
import { createCacheRoutes } from "./cache.ts";
import type { AppEnv } from "./env.ts";
import { createRpcHandler } from "./rpc.ts";

const app = new Hono<{ Bindings: AppEnv }>();

app.get("/health", (c) => c.json({ ok: true }));

const cache = createCacheRoutes();
app.route("/v8", cache);
app.route("/", cache);

app.on(
  ["GET", "POST"],
  "/api/auth/*",
  async (c) => await createAuth(c.env).handler(c.req.raw)
);

app.use("/rpc/*", async (c, next) => {
  const handler = createRpcHandler(c.env);
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: "/rpc",
    context: { env: c.env, headers: c.req.raw.headers },
  });
  if (matched) {
    return c.newResponse(response.body, response);
  }
  // Hono の next() は void を返すため、callback-return の要求と両立しない。
  // oxlint-disable-next-line node/callback-return
  await next();
  return c.res;
});

export default app;
