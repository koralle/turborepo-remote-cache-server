import { css } from "../../styled-system/css";

/**
 * 何も断定できない待機状態。ログイン画面と同じ幅と高さを確保して
 * layout shift を増やさない。
 */
export const PagePending = () => (
  <main
    className={css({
      margin: "0 auto",
      maxWidth: "32rem",
      minHeight: "20rem",
      padding: "3rem 1.5rem",
    })}
  >
    <output className={css({ color: "gray.600" })}>確認中…</output>
  </main>
);
