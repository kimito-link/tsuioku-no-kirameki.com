# reference: backfill Service Worker 移行（PR1-b〜PR1-c）設計正本

> 2026-06-11 Fable 5 設計会議結論。PR1-a（runNdgrBackfillOnce ctx引数化・2427a38f）の続き。
> 目的: backfill のタブ依存（visibilitychange で止まる）を根絶し、将来の Web 化でも同じ SW ロジックを使えるようにする。

## 調査で確定した事実（2026-06-11 実測）

1. **backfill 関連 lib は全部 DOM 非依存** — grep 実測で `document.` / `window.` / `location.href` ヒットは
   persistThrottle.js / livePersistInterval.js のコメント内言及のみ。コードに DOM 参照ゼロ。
   対象: ndgrBackfillCrawl / ndgrForwardCrawl / ndgrChatRows / cleanNdgrChatRows / backfillFlushThreshold /
   backfillRetryBackoff / backfillCapturedAt / backfillRotationGate / backfillSlotPool / persistThrottle /
   livePersistInterval / persistableCommentRow / commentSubmitSteps
   → **esbuild で SW にそのままバンドル可**。
2. **`readNdgrViewBaseUri` が唯一の DOM 依存**（content-entry.js:15114）。
   page-intercept-entry.js:503 が MAIN world で `data-nls-ndgr-view-uri` 属性に書き、content が読む。
   → SW は DOM を読めない。**content が view URI をメッセージで SW に中継**する（PR1-a の `viewBaseOverride` が受け口）。
3. **`persistCommentRows` は SW に持ち込まない** — recording 判定・スクロール defer・in-memory dedupe
   （liveDedupeState/liveChunkIndex）・intercept enrich に密結合。
   → SW 専用の軽量チャンク書込を新設（PR1-a の `onPersist` が受け口）。
   background.js には既にチャンク鍵ミラー（chunkIndexKeyLocal / chunkStorageKeyLocal / tailStorageKeyLocal /
   isChunkIndexLocal）が存在し、書式互換の土台がある。
4. **background.js はクラシック SW**（manifest に `"type": "module"` 無し）
   → `importScripts('dist/backfill-sw.js')` で built バンドルを追加読込できる。**既存 2945 行は動かさない**。
5. **NDGR ドメインは `*.live2.nicovideo.jp` 等 = `*.nicovideo.jp`** で host_permissions 済み
   → SW の fetch は CORS 免除（content より有利）。

## アーキテクチャ

```
[page-intercept MAIN world] --DOM属性--> [content script]
                                            |  chrome.runtime.sendMessage
                                            |  { type:'nls_backfill_start', liveId, viewBase,
                                            |    officialCount, recordedCount, programBeginAtMs }
                                            v
[background.js(既存・無改修)] -- importScripts --> [dist/backfill-sw.js(新規ビルド)]
                                            |  crawlNdgrBackward(SW fetch・CORS免除)
                                            |  onProgress: KEY_BACKFILL_PROGRESS へ直書き(popup/status表示は無変更)
                                            |  onPersist: SW軽量チャンク書込(PR1-b-2)
                                            v
                                   chrome.storage.local
```

## PR 分割（Codex に振る単位・1 PR = 即 commit/push）

- **PR1-b-1**: scripts/build.mjs に `src/extension/backfill-sw-entry.js` → `extension/dist/backfill-sw.js`
  エントリ追加（IIFE・target chrome111）+ background.js 冒頭に `importScripts('dist/backfill-sw.js')` 1行 +
  SW エンジン骨格（`nls_backfill_start` メッセージ受信 → SW 内で crawl 実行 → progress を storage に書く。
  persist はまず rows を sender タブへ送り返して既存 persistCommentRows に流す = 二段階移行の安全策）。
- **PR1-b-2**: SW 直書き persist（チャンク書込 + commentNo dedupe + index 競合対策 = navigator.locks で直列化。
  content の live tail 書込と SW backfill 書込が同じ chunk index を read-modify-write する競合への対策が本丸）。
  ⚠️ 宿題（PR1-b-1 Codex 指摘）: SW 版 fetchBinary はグローバルトークンバケツ（429 レート制御・
  content 版 acquireGlobalFetchToken/reportGlobalFetchResult 相当）を持たない。SW 経路を本採用する
  PR1-b-3 までに移植 or 共有化する。
- **PR1-b-3**: content 切替（runNdgrBackfillOnce 呼び出し → SW メッセージ送信に置換。
  `nls_backfill_sw_mode` フラグで旧経路に即ロールバック可能に）。
- **PR1-c**: onHidden / visibilitychange / backfillVisibilityRearm の実行経路削除（タブ依存根絶の総仕上げ。
  SW モードが実機で安定してから）。

## 残リスクと対策

- **SW 30秒アイドル死**: fetch ループ中はイベントで生存延長される + `chrome.alarms`（25秒周期）保険。
  crawl 1 hop ごとに progress 書込 = イベント活動でも延命。
- **チャンク index 二重書き**: PR1-b-2 で navigator.locks（SW でも使用可）により書込直列化。
  PR1-b-1 の間は persist を content に送り返すので競合自体が発生しない。
- **タブが閉じた後の persist 先**(PR1-b-1 の制約): sender タブが閉じると rows を流せない →
  PR1-b-2 の SW 直書きで解消。PR1-b-1 は「タブ非表示でも進む」までを達成（タブ閉じはまだ）。

## 触らないもの（絶対）

- 既存 background.js の 2945 行（importScripts 1行追加のみ）
- content-entry.js の既存 backfill 経路（PR1-b-3 まで現役。並走させない = SW モードは PR1-b-3 のフラグで排他）
- v0.1.642〜687 で積んだ根治群（rotation gate / slot pool / persist flush / no_progress retry / 完走 enabled）

## 役割分担（2026-06-11 ユーザー確定）

- 設計・会議・判断: Claude Code 本体（Fable 5・6/22 まで定額内）
- 実装: Codex CLI（codex-impl 経由・Claude 枠消費ゼロ）
- 軽い雑用: OpenCode ローカル（無料）
- 検証: npm run verify:cc + chrome-devtools-mcp 実機
