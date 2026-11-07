import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { adminContract } from "@repo/api-contract";

// 管理 API は Web の同一オリジン経由でのみ呼ぶ。SSR から呼ぶ作りにしたら
// リクエストのオリジンを渡すこと（ここでは未対応）。
const link = new RPCLink({
  url: () => {
    if (typeof window === "undefined") {
      throw new TypeError("SSR からは管理 API を呼ばない");
    }

    return `${window.location.origin}/rpc`;
  },
});

export const adminClient: ContractRouterClient<typeof adminContract> =
  createORPCClient(link);
