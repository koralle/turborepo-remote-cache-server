#!/usr/bin/env bash
# 実 Turborepo で保存・復元・署名検証を確認する。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# 既存プロセスとの衝突を避けるため、空いているポートを使う。
api_port="$(node -e 'const net=require("node:net");const s=net.createServer();s.listen(0,()=>{console.log(s.address().port);s.close()})')"
api="http://127.0.0.1:${api_port}"
work="$(mktemp -d)"
fixture="$work/fixture"
mkdir -p "$work"
cp -R e2e/fixture "$fixture"

cleanup() {
  if [ -n "${api_pid:-}" ]; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

log() { printf '\n=== %s ===\n' "$1"; }

log "DB を準備"
pnpm run db:migrate >/dev/null

key="$(node e2e/seed.mjs)"
pnpm --filter @repo/api exec wrangler d1 execute turbo-remote-cache --local --file ../../e2e/.seed.sql >/dev/null

log "API を起動"
(
  cd apps/api
  pnpm exec wrangler dev --port "$api_port" --var BETTER_AUTH_SECRET:e2e-secret-e2e-secret-e2e-secret >"$work/api.log" 2>&1
) &
api_pid=$!

for _ in $(seq 1 60); do
  if curl -fsS "$api/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done
curl -fsS "$api/health" >/dev/null

export TURBO_API="$api"
export TURBO_TOKEN="$key"
export TURBO_TEAM="e2e/repo"
export TURBO_TELEMETRY_DISABLED=1
export TURBO_REMOTE_CACHE_SIGNATURE_KEY="e2e-signature-key-e2e-signature-key"

run_turbo() {
  TURBO_CACHE_DIR="$1" pnpm exec turbo run build --cwd "$fixture" --output-logs=full
}

# 実行ごとにハッシュを変え、過去の実行のリモートキャッシュと混ざらないようにする。
printf '\n// nonce %s\n' "$(date +%s)-$RANDOM" >> "$fixture/build.mjs"

log "1. 初回はミスして保存される"
out="$(run_turbo "$work/c1")"
grep -q "cache miss" <<<"$out"
test -f "$fixture/dist/out.txt"
grep -q "e2e-output-v1" "$fixture/dist/out.txt"

rm -rf "$fixture/dist"
log "2. ローカルキャッシュ無効 + 出力削除から復元する"
out="$(run_turbo "$work/c2")"
grep -Eq "cache hit|FULL TURBO" <<<"$out"
test -f "$fixture/dist/out.txt"
grep -q "e2e-output-v1" "$fixture/dist/out.txt"

log "3. ソース変更でミスになる"
perl -pi -e 's/e2e-output-v1/e2e-output-v2/' "$fixture/build.mjs"
rm -rf "$fixture/dist"
out="$(run_turbo "$work/c3")"
grep -q "cache miss" <<<"$out"
grep -q "e2e-output-v2" "$fixture/dist/out.txt"

log "4. 署名不一致の成果物を採用しない"
hash="$(pnpm exec turbo run build --cwd "$fixture" --dry=json | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{const j=JSON.parse(s);const t=j.tasks.find((x)=>x.task==="build");console.log(t.hash)})')"
run_turbo "$work/c4" >/dev/null
test -f "$fixture/dist/out.txt"

printf 'tampered\n' > "$work/tamper.bin"
length="$(wc -c < "$work/tamper.bin" | tr -d ' ')"
status="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$api/v8/artifacts/$hash" \
  -H "Authorization: Bearer $key" \
  -H "Content-Length: $length" \
  -H "x-artifact-tag: AAAA" \
  --data-binary "@$work/tamper.bin")"
[ "$status" = "202" ]

rm -rf "$fixture/dist"
set +e
out="$(run_turbo "$work/c5" 2>&1)"
set -e
if [ -f "$fixture/dist/out.txt" ] && grep -q "tampered" "$fixture/dist/out.txt"; then
  echo "署名不一致の成果物が復元された" >&2
  exit 1
fi
grep -q "e2e-output-v2" "$fixture/dist/out.txt"

log "E2E 成功"
