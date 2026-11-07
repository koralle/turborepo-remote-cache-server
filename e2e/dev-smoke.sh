#!/usr/bin/env bash
# pnpm dev のローカル配線（D1 の migrate と /v8 転送）を確認する。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [ ! -f apps/api/.dev.vars ]; then
  echo "apps/api/.dev.vars が必要です（.dev.vars.example からコピー）" >&2
  exit 1
fi
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port 3000 が使用中です。pnpm dev を停止してから実行してください" >&2
  exit 1
fi

cleanup() {
  if [ -n "${dev_pid:-}" ]; then
    kill "$dev_pid" 2>/dev/null || true
    wait "$dev_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

log() { printf '\n=== %s ===\n' "$1"; }

log "pnpm dev を起動"
pnpm dev >/tmp/turbo-cache-dev-smoke.log 2>&1 &
dev_pid=$!
for _ in $(seq 1 90); do
  if curl -fsS http://localhost:3000/ >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://localhost:3000/ >/dev/null

log "パスキーの認証オプション"
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/auth/passkey/generate-authenticate-options)"
[ "$status" = "200" ]
echo "passkey options: $status"

log "CLI 用キーを dev の D1 に投入"
key="$(node e2e/seed.mjs)"
pnpm --filter @repo/web exec wrangler d1 execute turbo-remote-cache --local \
  --persist-to "$(cd apps/web && pwd)/.wrangler/state" \
  -c ../api/wrangler.jsonc --file ../../e2e/.seed.sql >/dev/null

log "Web(3000) 経由でキャッシュ API を確認"
status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/v8/artifacts/status -H "Authorization: Bearer $key")"
[ "$status" = "200" ]
echo "status: $status"

printf 'smoke' > /tmp/turbo-cache-smoke.bin
status="$(curl -s -o /dev/null -w '%{http_code}' -X PUT http://localhost:3000/v8/artifacts/abc123 \
  -H "Authorization: Bearer $key" -H "Content-Length: 5" --data-binary @/tmp/turbo-cache-smoke.bin)"
[ "$status" = "202" ]
echo "put: $status"

status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/v8/artifacts/abc123 -H "Authorization: Bearer $key")"
[ "$status" = "200" ]
echo "get: $status"

log "成功"
