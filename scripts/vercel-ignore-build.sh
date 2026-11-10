#!/usr/bin/env bash
# 役割: Vercel の「Ignored Build Step」。vercel.json の ignoreCommand から呼ばれる。
#       exit 0 = このデプロイを作らない / exit 1 = いつもどおり作る（Vercel の決まり）。
# なぜ要るか: 2026-11-10 03:49 UTC、全30ブランチ×2プロジェクト（約60本）のプレビューが一度に作られ、
#       そのうち14本が始まってすぐ失敗して「Preview deployment failed」のメールが大量に届いた。
#       中身の変わらない古いブランチや dependabot のブランチは、Web のプレビューを見る人がいない。
# 使い方: 手で実行しない。Vercel がビルドの前に自動で実行する（VERCEL_* は Vercel が入れる環境変数）。
set -u

# 本番（master）はいつも作る。ここで止めると本番が更新されなくなる。
if [ "${VERCEL_ENV:-}" = "production" ]; then
  exit 1
fi

ref="${VERCEL_GIT_COMMIT_REF:-}"

# dependabot の更新は静的サイト（ビルド無し）の見た目を変えない。
case "$ref" in
  dependabot/*)
    echo "skip: dependabot branch ($ref)"
    exit 0
    ;;
esac

# 最後のコミットが14日より古いブランチは作らない（一斉の作り直しで古いブランチが全部走るのを防ぐ）。
last=$(git log -1 --format=%ct 2>/dev/null || echo "")
if [ -n "$last" ]; then
  age=$(( $(date +%s) - last ))
  if [ "$age" -gt 1209600 ]; then
    echo "skip: last commit is $((age / 86400)) days old ($ref)"
    exit 0
  fi
fi

exit 1
