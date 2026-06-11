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

- **SW 30秒アイドル死**: fetch ループ中はイベントで生存延長される。
  ⚠️ **実機確認済みの穴(2026-06-11)**: crawl lib の no_progress バックオフ睡眠(最大~45秒)中は
  fetch/メッセージが無く、SW が 30 秒アイドルで死に crawl が finally 不達のまま消える。
  対策(未実装・次PR): crawl 実行中だけ setInterval(20-25秒)で chrome.runtime.getPlatformInfo()
  等の安価な拡張 API を self-call してアイドルタイマーをリセット(chrome.alarms は最小30秒で競合)。
- **チャンク index 二重書き**: 当初案の navigator.locks は不可能と判明(content=ページorigin /
  SW=拡張origin で lock manager が別)。PR1-b-2 で「SW は正本に直接書かず取り置き staging に書き、
  content が既存 persist パイプラインへ畳み込む」方式に変更=レースを構造的に排除。
- **タブが閉じた後の persist 先**: PR1-b-2 の staging で解消済み(実機実証済み)。

## 実機検証結果（2026-06-11・chrome-devtools-mcp・v0.1.690）

1. ✅ **SW crawl 完走**: lv350729261 で rows=45/seg=3/reached_start。rows→タブ送付→既存 persist
   経由でチャンク正本 55 件。既存進捗キーへの完走ミラーも同値で書込確認。
2. ✅ **staging(タブ消失時)**: lv350663581 で crawl 中にタブが次番組へ自動遷移(lid 変化)→
   rows 送付が lid_mismatch で fail → 設計どおり staging へ切替、**1,224 行を reached_start まで
   取り切って取り置き**(進捗に staged:true)。タブ依存根絶の直接証明。
3. ✅ **fold-in(畳み込み)**: lv350663581 を開き直した瞬間(0秒)に取り置き 1,224 行が正本チャンクへ
   畳み込まれ(total=1,422)、取り置きキー削除済み。
4. ⚠️ **既知制約(v1)**: backward_exhausted(入口問題)時に SW モードはリトライしない
   (content のワンショット guard が ok:true で立つため再送なし)。既存 content 経路は
   transient retry 対象。SW モード既定 ON 昇格前に SW 側リトライ移植が必要。
5. ⚠️ 手動起動(古い viewBase 使い回し)は backward_exhausted になりやすい=viewBase token は
   鮮度が要る。content 自動起動(ページ load 直後の新鮮な base)は成功。

## SW モード既定 ON 昇格前の必須宿題（2026-06-12 更新）

1. ✅ SW 側 transient リトライ — v0.1.694(e2dba37a)。既存純関数再利用・上限5・rows>0で予算回復
2. ✅ SW アイドル死 keepalive — v0.1.694。crawl中+リトライ待機中 20 秒毎 getPlatformInfo
3. ✅ リクエスト嵐の抑制 — v0.1.695(2a721d31)。空リトライに sleep(150ms) ペーシング
   （429 トークンバケツ移植は不要と判断: crawl lib 内の 429 backoff(2/4/8s)+ペーシングで足りる。
   既存 globalFetchRateLimiter は setAccessLevel 未配線で休眠＝起こすと 1-6req/s で一気取りを殺す
   ので絶対に配線しない）
4. ⬜ **SW 並列度（最後の壁・2026-06-12 実機で確認）**: SW エンジンは global single-flight のため、
   巨大配信1本が crawl/橋渡しで SW を最大 cap_elapsed(15分)占有し、他の配信の backfill が
   待たされる（content 経路は N=2 スロット並列だった）。per-lid 並列(2本)に拡張してから既定 ON。
5. ⬜ 巨大配信で rows 凍結のまま running が長引くケースの診断（実機 lv350674461: 14,818行で
   5分以上前進なし・SW は応答可・cap_elapsed で有界）
6. PR1-c(visibility 系削除)は 4-5 と実機安定確認の後

## 実機検証2（2026-06-12 v0.1.694-695）

- ✅ SW 応答性: v0.1.694 時点では若い配信でメッセージ応答不能（空リトライ嵐）→ v0.1.695 の
  ペーシングで完全回復（連続ポーリング全応答）
- ✅ タブ閉じ継続: lv350674461 のタブを閉じても SW crawl が 14,818 行まで継続（大規模実証）
- ✅ keepalive: 5分超の crawl 継続中も SW 生存

## 触らないもの（絶対）

- 既存 background.js の 2945 行（importScripts 1行追加のみ）
- content-entry.js の既存 backfill 経路（PR1-b-3 まで現役。並走させない = SW モードは PR1-b-3 のフラグで排他）
- v0.1.642〜687 で積んだ根治群（rotation gate / slot pool / persist flush / no_progress retry / 完走 enabled）

## 役割分担（2026-06-11 ユーザー確定）

- 設計・会議・判断: Claude Code 本体（Fable 5・6/22 まで定額内）
- 実装: Codex CLI（codex-impl 経由・Claude 枠消費ゼロ）
- 軽い雑用: OpenCode ローカル（無料）
- 検証: npm run verify:cc + chrome-devtools-mcp 実機
