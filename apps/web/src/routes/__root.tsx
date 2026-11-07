import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { NotFoundPanel, RouteError } from "../components/error-fallback";

import appCss from "../styles.css?url";

// エラー時もドキュメントごと差し替えないよう、html は shell 側に置く。
const RootShell = ({ children }: { children: ReactNode }) => (
  <html lang="ja">
    <head>
      <HeadContent />
    </head>
    <body>
      {children}
      <Scripts />
    </body>
  </html>
);

const Root = () => {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Root,
    errorComponent: RouteError,
    head: () => ({
      links: [{ href: appCss, rel: "stylesheet" }],
      meta: [
        { charSet: "utf-8" },
        { content: "width=device-width, initial-scale=1", name: "viewport" },
        { title: "Turborepo Remote Cache" },
      ],
    }),
    notFoundComponent: NotFoundPanel,
    shellComponent: RootShell,
  }
);
