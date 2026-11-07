#!/usr/bin/env bash
# 既存マイグレーションの変更・改名・削除を検出する。追加は許可する。
# meta/_journal.json は drizzle-kit が追記するだけなので対象外にする。
set -euo pipefail

base="${1:-}"
if [ -z "$base" ] || ! git rev-parse --verify "$base" >/dev/null 2>&1; then
  echo "比較対象のリビジョンが無いためスキップ: ${base:-none}"
  exit 0
fi

changed="$(git diff --name-status "$base" -- 'packages/db/drizzle/*.sql' 'packages/db/drizzle/meta/*_snapshot.json' | awk '$1 ~ /^[MDR]/ {print}')"
if [ -n "$changed" ]; then
  echo "既存のマイグレーションを変更している:"
  echo "$changed"
  exit 1
fi
