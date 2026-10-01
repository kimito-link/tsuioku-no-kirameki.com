# 実装ハンドオフ: /live/ に Kick セクションを足す（MVP）

> 作成: 2026-10-01 / 司令塔。**この1枚と SPEC を読めば着手できる**。
> 仕様: [live-multiplatform-kick-youtube-SPEC.md](live-multiplatform-kick-youtube-SPEC.md)（正本）／地図: [live-multiplatform-kick-youtube-MAP.md](live-multiplatform-kick-youtube-MAP.md)
> 規約調査の結論: memory `youtube_live_ranking_policy_and_quota_2026-10-01.md`

## ⛔ 着手前の前提（ユーザー側の準備）

- [ ] ユーザーが Kick 開発者ページでアプリを作り、**`KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` を Vercel の Production 環境変数に直接入力**済み（司令塔は値を見ない。Twitch と同じ運用）。
  - 未登録でもコード実装・テストは進めてよい。ただし **§手順7（workflow に `kick` ジョブを足す）は鍵登録後**。先に足すと5分ごとに Actions が赤くなる（SPEC §7-13）。

## スコープ

- **やる（MVP）**: Kick のみ。SPEC §4.1 の新規ファイル4本＋テスト4本、entry/index.html/privacy.html の最小追記、Actions `kick` ジョブ、tree-map、bump。
- **やらない**: SPEC §6 Out of Scope 全部（YouTube 実装・Kick のシェア/ピン/OG・閲覧者 refresh・ページング・脈拍レーン等）。**`api/live-ranking.js` は変更しない。**

## 着手手順

1. `.agent/coord.md` の `write_lock` を確認（FREE であること）。`git checkout -b feature/live-kick-section`。
2. **TDD・純関数から**: `src/lib/kickLivestreams.test.js` を SPEC §5 のケース名どおりに書く → 赤 → `src/lib/kickLivestreams.js`（SPEC §4.3）→ 緑。
3. `src/lib/livePlatformsHtml.test.js` → `src/lib/livePlatformsHtml.js`（SPEC §4.6）。既存の `escapeHtml/safeHttpUrl/formatNumberJa`（htmlText.js）と `jstClock/elapsedText/freshness/cacheBust`（liveRankingView.js）を import。**`jstClock`/`elapsedText` は秒**。
4. `src/server/kickApi.test.js` → `src/server/kickApi.js`（SPEC §4.4）。先に `src/server/nicoliveGuest.test.js` を読んで fetch 注入の流儀に合わせる。
5. `api/live-platforms.js`（SPEC §4.5）。`upstash/TTL_SECONDS/readBody` は `./live-ranking.js` から import。
6. 画面: `tsuioku-no-kirameki/live/index.html` に `#platforms`・CSS・`.note` 段落（CSS 変数名を `:root` で確認）、`src/extension/live-ranking-entry.js` に `loadPlatforms()` と3経路の配線。`src/lib/livePlatforms.wiring.test.js` を先に書く。CRLF に注意。
7. **（鍵登録後）** `.github/workflows/live-ranking.yml` に `kick` ジョブ（SPEC §4.7）。
8. `privacy.html` §14 に 14-1 の1行＋ 14-5 新設（SPEC §2.2-11）→ `npm run site-health`。
9. `scripts/repo-tree-map.mjs` の `ROLES['api']`・`FEATURES` 更新 → bump 3点セット（summary 35字以内）。

## 完了判定（機械的に）

- `npm run test:cc` 緑（新規4テストファイルが走っていること＝件数が増えていることを確認）
- `npm run typecheck` 緑
- `git add <新規ファイルを明示列挙>` → `npm run tree-map` → `git add -A` → `npm run verify:cc` 緑（`.artifacts/verify-cc.log`）
- `npm run verify:bump` 緑・`npm run site-health` 緑
- **変異テスト**: `decideKickStore` の「0件は store:true」を一時的に false にして赤くなる → 戻す。`livePlatformsHtml.js` に `estimateConcurrent` の import を一時的に足して配線テストが赤くなる → 戻す。
- デプロイ後（鍵登録済み）: `workflow_dispatch` で `kick` を1回 → SPEC §7-1 の4項目（count / truncated / headersSample / expiresIn）を SPEC 末尾に「実測」として追記。
- **reality-checker に検証を委任**（SPEC §7-11 の3点。自己採点しない）。

## 地雷

- `npm run tree-map` は `git add` の後（逆だと pre-commit で BLOCKED。2026-10-01 にも踏んだ）。
- 新規ファイルは `git add` で明示列挙（`git status | grep -v '^??'` で取りこぼし→Vercel 全デプロイ失敗の前例）。
- token をログ・レスポンス・例外文に出さない。
- Kick 行に「推定」「増分」「前回比」を出さない（YouTube を後で同じ枠に乗せるため、最初から自前指標の無い作りにする）。
- 未確認（SPEC assumption A1〜A9）を実測前に確定扱いしない。特に応答の包み（A1）とサムネのホットリンク可否は初回実測で確かめる。

## 未解決（ユーザー判断待ち・実装は既定値で進めてよい）

- 成人向け配信を出すか（既定: 出さない `SHOW_MATURE=false`）
- Kick の緑色バッジを使ってよいか（既定: 使う・ロゴ画像は使わない）
