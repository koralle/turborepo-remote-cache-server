import { QueryClient } from "@tanstack/react-query";

import { isRetryable } from "./errors";

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // 画面遷移やタブ復帰のたびに取り直さない。更新は mutation 側で無効化する。
        staleTime: 30_000,
        retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
      },
    },
  });
