import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { adminContract } from "@repo/api-contract";

const baseURL =
  typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;

const link = new RPCLink({ url: `${baseURL}/rpc` });

export const adminClient: ContractRouterClient<typeof adminContract> =
  createORPCClient(link);
