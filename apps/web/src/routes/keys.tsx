import type { KeySummary } from "@repo/api-contract";
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import type { FallbackProps } from "react-error-boundary";
import { ErrorBoundary } from "react-error-boundary";

import { css } from "../../styled-system/css";
import { authClient } from "../auth-client";
import { IssueKeyForm } from "../components/issue-key-form";
import type { CreateKeyInput } from "../components/issue-key-form";
import { KeyTable } from "../components/key-table";
import { PagePending } from "../components/page-pending";
import { isAuthError, isRetryable, messageFor } from "../errors";
import { adminClient } from "../orpc";

const KEYS_QUERY_KEY = ["keys"] as const;
const REVOKE_MUTATION_KEY = ["keys", "revoke"] as const;

const textAction = css({ textDecoration: "underline" });

const errorBox = css({
  alignItems: "flex-start",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
});

interface KeysErrorProps {
  error: Error;
  onRetry: () => void;
  onSignIn: () => void;
}

/** 通信失敗・認証切れ・権限不足を区別する。再送で変わらない失敗には再試行を出さない。 */
const KeysError = ({ error, onRetry, onSignIn }: KeysErrorProps) => (
  <div className={errorBox}>
    <p className={css({ color: "red.600" })} role="alert">
      {messageFor(error, "API キーを読み込めませんでした。")}
    </p>
    {isAuthError(error) ? (
      <Button className={textAction} onPress={onSignIn}>
        ログイン画面へ
      </Button>
    ) : null}
    {isRetryable(error) ? (
      <Button className={textAction} onPress={onRetry}>
        再試行
      </Button>
    ) : null}
  </div>
);

const KeysTableFallback = ({ resetErrorBoundary }: FallbackProps) => (
  <div className={errorBox}>
    <p className={css({ color: "red.600" })} role="alert">
      一覧を表示できませんでした。
    </p>
    <Button className={textAction} onPress={resetErrorBoundary}>
      再試行
    </Button>
  </div>
);

const KeysRoute = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [issued, setIssued] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const issuedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sessionPending && session === null) {
      void navigate({ replace: true, to: "/" });
    }
  }, [navigate, session, sessionPending]);

  // フォームは発行成功で作り直すため、フォーカスが body に落ちる。発行した
  // キーの方へ移して、キーボード操作と読み上げを続けられるようにする。
  useEffect(() => {
    if (issued !== null) {
      issuedRef.current?.focus();
    }
  }, [issued]);

  // セッションの解決を待たない。待つと初回表示が 1 往復ぶん遅れる。
  // 未認証なら 401 になり、KeysError 側で扱う。
  const keysQuery = useQuery({
    queryFn: async () => await adminClient.keys.list(),
    queryKey: KEYS_QUERY_KEY,
  });

  const createKey = useMutation({
    mutationFn: async (input: CreateKeyInput) =>
      await adminClient.keys.create(input),
    onSuccess: (created) => {
      setIssued(created.key);
      // 同じ内容での二重発行を防ぐ。
      setFormVersion((version) => version + 1);
      // 一覧の再取得は待たない。待つとボタンが余分に 1 往復ぶん無効になる。
      void queryClient.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => await adminClient.keys.revoke({ id }),
    mutationKey: REVOKE_MUTATION_KEY,
    // 失効は取り消せない。失敗時は行を変えず、成功した応答で該当行だけ確定反映する。
    onSuccess: (_result, id) => {
      queryClient.setQueryData<{ keys: KeySummary[] }>(
        KEYS_QUERY_KEY,
        (previous) =>
          previous === undefined
            ? previous
            : {
                keys: previous.keys.map((key) =>
                  key.id === id ? { ...key, enabled: false } : key
                ),
              }
      );
    },
  });

  // 複数行を同時に失効させても、処理中の行だけを無効化する。
  const revokingIds = useMutationState<string>({
    filters: { mutationKey: REVOKE_MUTATION_KEY, status: "pending" },
    select: (mutation) => String(mutation.state.variables),
  });

  const signOut = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();

      // better-auth は HTTP エラーでも throw しない。
      if (error !== null) {
        throw new Error(
          "サインアウトできませんでした。もう一度試してください。"
        );
      }
    },
    onSuccess: async () => {
      await navigate({ replace: true, to: "/" });
      // 別の管理者がログインし直したときに前のキャッシュを見せない。
      queryClient.clear();
    },
  });

  // セッション確認中とリダイレクト待ちでは中身を出さない。
  if (sessionPending || session === null) {
    return <PagePending />;
  }

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
        isDisabled={signOut.isPending}
        onPress={() => {
          signOut.mutate();
        }}
      >
        {signOut.isPending ? "サインアウト中…" : "サインアウト"}
      </Button>

      {signOut.error === null ? null : (
        <p className={css({ color: "red.600" })} role="alert">
          {messageFor(signOut.error, "サインアウトできませんでした。")}
        </p>
      )}

      {issued === null ? null : (
        <section
          aria-live="polite"
          className={css({
            background: "yellow.50",
            border: "1px solid yellow.400",
            marginBottom: "1.5rem",
            padding: "1rem",
          })}
          ref={issuedRef}
          tabIndex={-1}
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
          error={
            createKey.error === null
              ? null
              : messageFor(createKey.error, "API キーを発行できませんでした。")
          }
          key={formVersion}
          onCreate={(input) => {
            createKey.mutate(input);
          }}
          pending={createKey.isPending}
        />
      </section>

      <section
        aria-busy={keysQuery.isFetching}
        className={css({ minHeight: "12rem" })}
      >
        <h2 className={css({ fontSize: "1.125rem", marginBottom: "1rem" })}>
          発行済みのキー
        </h2>
        {revokeKey.error === null ? null : (
          <p className={css({ color: "red.600" })} role="alert">
            {messageFor(revokeKey.error, "キーを失効できませんでした。")}
          </p>
        )}
        <ErrorBoundary
          FallbackComponent={KeysTableFallback}
          onReset={() => {
            void keysQuery.refetch();
          }}
        >
          {keysQuery.isPending ? (
            <output className={css({ color: "gray.600" })}>読み込み中…</output>
          ) : null}
          {keysQuery.isError ? (
            <KeysError
              error={keysQuery.error}
              onRetry={() => {
                void keysQuery.refetch();
              }}
              onSignIn={() => {
                void navigate({ replace: true, to: "/" });
              }}
            />
          ) : null}
          {keysQuery.isSuccess ? (
            <KeyTable
              keys={keysQuery.data.keys}
              onRevoke={(id) => {
                revokeKey.mutate(id);
              }}
              revoking={revokingIds}
            />
          ) : null}
        </ErrorBoundary>
      </section>
    </main>
  );
};

export const Route = createFileRoute("/keys")({ component: KeysRoute });
