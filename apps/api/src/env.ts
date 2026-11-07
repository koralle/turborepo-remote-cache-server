export type AppEnv = Omit<Env, "WEB_ORIGIN"> & {
  BETTER_AUTH_SECRET: string;
  // 本番は prepare-production-config が固定値を入れ、ローカルは空のまま。
  WEB_ORIGIN: string;
};

// ブラウザから見た Web のオリジン。本番は WEB_ORIGIN に固定し、
// ローカル（空）は portless の URL をリクエストから都度求める。
export const originOf = (env: AppEnv, request: Request): string => {
  if (env.WEB_ORIGIN !== "") {
    return env.WEB_ORIGIN;
  }

  try {
    return new URL(request.url).origin;
  } catch (error) {
    throw new Error(`リクエスト URL が不正: ${request.url}`, { cause: error });
  }
};
