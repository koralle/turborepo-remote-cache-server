import { ORPCError } from "@orpc/client";

const statusOf = (error: Error): number | null =>
  error instanceof ORPCError ? error.status : null;

/** 4xx は再送しても結果が変わらないので、待たせずに失敗させる。 */
export const isRetryable = (error: Error): boolean => {
  const status = statusOf(error);

  return status === null || status >= 500;
};

export const isAuthError = (error: Error): boolean => statusOf(error) === 401;

const statusMessage = (status: number | null): string | null => {
  if (status === 401) {
    return "セッションが切れました。ログインし直してください。";
  }

  if (status === 403) {
    return "この操作を行う権限がありません。";
  }

  return null;
};

/**
 * 種別が分かる失敗は日本語を優先する。5xx と通信断は内部の文言を出さず、
 * 呼び出し側の再試行導線に任せる。
 */
export const messageFor = (error: Error, fallback: string): string => {
  const status = statusOf(error);

  if (status === null || status >= 500) {
    return fallback;
  }

  return (
    statusMessage(status) ?? (error.message === "" ? fallback : error.message)
  );
};
