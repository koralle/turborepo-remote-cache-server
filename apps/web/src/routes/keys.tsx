import type { KeySummary } from "@repo/api-contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "react-aria-components";

import { css } from "../../styled-system/css";
import { authClient } from "../auth-client";
import { IssueKeyForm } from "../components/issue-key-form";
import type { CreateKeyInput } from "../components/issue-key-form";
import { KeyTable } from "../components/key-table";
import { adminClient } from "../orpc";

const KeysRoute = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && session === null) {
      void navigate({ to: "/" });
    }
  }, [isPending, navigate, session]);

  const keysQuery = useQuery({
    enabled: session !== null,
    queryFn: async () => await adminClient.keys.list(),
    queryKey: ["keys"],
  });

  const createKey = useMutation({
    mutationFn: async (input: CreateKeyInput) =>
      await adminClient.keys.create(input),
    onError: (cause: Error) => {
      setError(cause.message);
    },
    onSuccess: async (created) => {
      setError(null);
      setIssued(created.key);
      await queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => await adminClient.keys.revoke({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });

  const signOut = async (): Promise<void> => {
    const { error: cause } = await authClient.signOut();

    // better-auth は HTTP エラーでも throw しない。失敗時は画面を移らず、その場で知らせる。
    if (cause !== null) {
      setSignOutError("サインアウトできませんでした。もう一度試してください。");

      return;
    }

    await navigate({ to: "/" });
  };

  if (session === null) {
    return null;
  }

  const keys: KeySummary[] = keysQuery.data?.keys ?? [];

  return (
    <main
      className={css({
        margin: "0 auto",
        maxWidth: "56rem",
        padding: "3rem 1.5rem",
      })}
    >
      <h1 className={css({ fontSize: "1.5rem", marginBottom: "1.5rem" })}>
        API キー
      </h1>

      <Button
        className={css({
          color: "gray.700",
          marginBottom: "1.5rem",
          textDecoration: "underline",
        })}
        onPress={() => {
          // oxlint-disable-next-line typescript/no-floating-promises
          signOut();
        }}
      >
        サインアウト
      </Button>

      {signOutError === null ? null : (
        <p className={css({ color: "red.600" })} role="alert">
          {signOutError}
        </p>
      )}

      {issued === null ? null : (
        <section
          className={css({
            background: "yellow.50",
            border: "1px solid yellow.400",
            marginBottom: "1.5rem",
            padding: "1rem",
          })}
        >
          <p className={css({ fontWeight: "bold", marginBottom: "0.5rem" })}>
            このキーは一度しか表示されません。TURBO_TOKEN に設定してください。
          </p>
          <code className={css({ wordBreak: "break-all" })}>{issued}</code>
        </section>
      )}

      <section className={css({ marginBottom: "2rem" })}>
        <h2 className={css({ fontSize: "1.125rem", marginBottom: "1rem" })}>
          キーを発行
        </h2>
        <IssueKeyForm
          error={error}
          onCreate={(input) => {
            createKey.mutate(input);
          }}
          pending={createKey.isPending}
        />
      </section>

      <section>
        <h2 className={css({ fontSize: "1.125rem", marginBottom: "1rem" })}>
          発行済みのキー
        </h2>
        {keysQuery.isPending ? (
          <p className={css({ color: "gray.600" })}>読み込み中…</p>
        ) : (
          <KeyTable
            keys={keys}
            onRevoke={(id) => {
              revokeKey.mutate(id);
            }}
            revoking={revokeKey.isPending ? revokeKey.variables : null}
          />
        )}
      </section>
    </main>
  );
};

export const Route = createFileRoute("/keys")({ component: KeysRoute });
