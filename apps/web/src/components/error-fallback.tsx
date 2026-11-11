import type { ErrorComponentProps } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "react-aria-components";
import { getErrorMessage } from "react-error-boundary";

import { css } from "../../styled-system/css";

const panel = css({
  margin: "0 auto",
  maxWidth: "32rem",
  minHeight: "20rem",
  padding: "3rem 1.5rem",
});

const heading = css({ fontSize: "1.25rem", marginBottom: "0.75rem" });
const body = css({ color: "gray.700", marginBottom: "1.5rem" });

const action = css({
  background: "gray.900",
  borderRadius: "0.375rem",
  color: "white",
  padding: "0.5rem 1rem",
});

const actions = css({ display: "flex", gap: "0.75rem" });

/** Router の errorComponent。reset で再描画、それでもだめなら再読み込みさせる。 */
export const RouteError = ({ error, reset }: ErrorComponentProps) => (
  <main className={panel}>
    <h1 className={heading}>問題が発生しました</h1>
    <p className={body} role="alert">
      {getErrorMessage(error) ?? "画面を表示できませんでした。"}
    </p>
    <div className={actions}>
      <Button className={action} onPress={reset}>
        再試行
      </Button>
      <Button
        className={action}
        onPress={() => {
          window.location.reload();
        }}
      >
        再読み込み
      </Button>
    </div>
  </main>
);

export const NotFoundPanel = () => {
  const navigate = useNavigate();

  return (
    <main className={panel}>
      <h1 className={heading}>ページが見つかりません</h1>
      <p className={body}>URL を確認してください。</p>
      <Button
        className={action}
        onPress={() => {
          void navigate({ to: "/" });
        }}
      >
        ログイン画面へ
      </Button>
    </main>
  );
};
