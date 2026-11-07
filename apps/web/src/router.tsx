import { createRouter } from "@tanstack/react-router";

import { createQueryClient } from "./query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // SSR のリクエストごとに 1 つ作る。モジュールスコープに置くと
  // 別の利用者のキャッシュが混ざる。
  const queryClient = createQueryClient();

  return createRouter({
    context: { queryClient },
    routeTree,
    scrollRestoration: true,
  });
};
