import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";

// 本番の zone route は CLI を Web に通さない。dev にはその route が無い。
const proxied = ["/api/auth", "/rpc", "/v8", "/artifacts", "/health"];

const isProxied = (pathname: string): boolean =>
  proxied.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

const pathnameOf = (request: Request): string => {
  try {
    return new URL(request.url).pathname;
  } catch (error) {
    throw new Error(`リクエスト URL が不正: ${request.url}`, { cause: error });
  }
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (isProxied(pathnameOf(request))) {
      return await env.API.fetch(request);
    }

    return await handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
