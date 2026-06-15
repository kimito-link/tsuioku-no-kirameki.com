# 引き継ぎ: 過去ログ一括バックフィル（NDGR backward 巡回）PR2 の続き（2026-05-27）

対象: ニコ生コメント記録/可視化 Chrome 拡張 `tsuioku-no-kirameki.com`。
作業dir: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`。
ユーザー希望: **会議modeで慎重に / 承認を求めず自走し結果のみ報告 / 「直した」前に実ブラウザで実証 / 推測で hot path を重くしない / 版こまめに bump**。

## ⚠️ なぜ引き継ぎになったか（重要・環境問題）
このセッション終盤、**Bash tool の呼び出しが繰り返し malformed で止まった**（XML が `court`/`<invoke>` という壊れた形で出力され、実行されない）。Edit/Write/Read/Grep ツールは正常。**次セッションでは Bash 呼び出しを 1 コマンドずつ・シンプルに**（`&&` 連結や複雑な構文を避ける）。git/build/verify は個別 Bash で。

## 現在地（master = v0.1.402・コミット f6bed9f）
過去ログ一括バックフィル「ウルトラC」を会議→PoC→実装中。詳細計画=[plan_ndgr_past_log_backfill.md](memory)。
- ✅ **PR1 観測（#155・v0.1.402）master merged 済**: page-intercept で `view/v\d` 基点URLを `data-nls-ndgr-view-uri` 属性に露出（観測のみ）。
- ✅✅✅ **実機 PoC 完了=GO 判定**（2026-05-27 lv350560887）。**核心結果**:
  - viewUri host = `mpn.live.nicovideo.jp`（watch ページと別オリジン＝**cross-origin**）。
  - ⭐**CORS は `credentials:'omit'` 必須**（`include` だと Failed to fetch）。`*` CORS。
  - `view?at=now`→9バイト（field1=ポインタ）。`view?at={unixtime}`→913バイトの ChunkedEntry。中に `/data/backward/v4/`（過去へ）+ `/data/snapshot/v4/` + `/data/segment/v4/`複数 の URI が埋まる。
  - **segment fetch→実際の過去コメント本文「水ダウと比べる意味なんてないのに」取得確認**。backward fetch→68KB・さらに前の backward URI も在る＝**配信開始まで連鎖遡及可能**。
  - 認証: omit で OK（ログイン不要）。連続巡回の rate limit は未測定（要実機再確認）。

## 🔴 このセッションで完成済みだが **未コミット** の作業（PR2 = v0.1.403）
**全て書き終わり、`npm run verify` 緑（unit 3944 / lint / typecheck）を確認済み。あとは build → commit → push → PR 作成だけ。**

### 変更ファイル（未コミット・working tree にある）
1. **`src/lib/ndgrDecode.js`**（末尾に追加）= `export function decodeChunkedEntry(buf, start, end)`。
   - ChunkedEntry から backward/segment/snapshot URI と long-poll ポインタ(nextAt)を抽出する純関数。
   - ⭐**field 番号に依存せず、length-delimited 値を再帰的に掘って NDGR URI を path で分類**する防御的方式（niconico の field 番号差し替え耐性。decodeGift の v0.1.209/211/233 churn 教訓）。`classify()` で `/data/backward/`・`/data/segment/`・`/data/snapshot/`・`/api/view/` を判定。深さ上限6・segment dedupe・空bufで空nav返す。
   - 戻り型 `NdgrChunkedEntryNav = { backwardUri, segmentUris[], snapshotUri, nextAt }`。
2. **`src/lib/ndgrDecode.test.js`**: import に `decodeChunkedEntry` 追加 + 末尾に describe ブロック5件（PoC で確認した実URI形式のフィクスチャ・field番号バラバラでも抽出/nextAt varint/dedupe/非NDGR無視/空buf）。**実行済=5件 pass**。
3. **`src/lib/changelog.js`**: 先頭に v0.1.403 エントリ追加（summary「内部: 過去コメント遡及の巡回情報デコーダ追加」）。
4. **`src/lib/changelog.test.js`**: 先頭版テストを 0.1.403 に。
5. **`extension/manifest.json`** / **`package.json`**: version 0.1.403。

### 次セッション最初の手順（Bash は1個ずつ）
1. `git status --short` で上記 working tree 変更を確認（Resilio が巻き戻していたら下記から復元—ただし全部 Edit 済みなので残っているはず）。
2. `npm run build`（dist 再生成）。
3. `git checkout -b feat/ndgr-decode-chunked-entry`
4. `git add src/lib/ndgrDecode.js src/lib/ndgrDecode.test.js src/lib/changelog.js src/lib/changelog.test.js extension/manifest.json package.json extension/dist/popup.js extension/dist/content.js extension/dist/page-intercept.js`
5. commit（メッセージは %TEMP% に書いて `-F` 渡す・末尾 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`）。
6. `git push origin feat/ndgr-decode-chunked-entry:feat/ndgr-decode-chunked-entry`、dist churn は `git checkout -- extension/dist/` で破棄。
7. PR 作成（base master・本文は %TEMP% に書いて `--body-file`）。PR2 は**純関数 decoder + test のみ・挙動変更ゼロ**（新 export で未配線）。
8. CI 緑確認（⚠️**flaky e2e `save-ctx-invalidated-recovery` が時々赤→rerun で緑**になる既知問題・本変更と無関係。`gh run rerun <id> --failed`）。緑なら merge（merge commit 方式 `gh pr merge <n> --merge`）。

## ⭐ 次の本番 = PR3 巡回ループ ＝ **ここでユーザーは「会議して慎重に実装したい」**
PR2 を出したら、**PR3（backward 巡回ループ本体）の前に会議室レビューを必ず実施**（ユーザー明示要望）。会議で詰める論点:
- **cross-origin omit fetch** をどこで撃つか（page-intercept MAIN world か content か。`*` CORS なので両方可だが、既存 scheduleNdgrChatRowsPost 合流を考えると…要設計）。
- 巡回アルゴリズム: `view?at=now`→nextポインタ→`view?at={unixtime}` で ChunkedEntry 取得→`decodeChunkedEntry` で segment/backward 抽出→各 segment fetch→`decodeChunkedMessage` で chat 抽出→既存 `scheduleNdgrChatRowsPost`(80msバッチ) 合流→content `persistCommentRows`→`mergeNewComments`。backward URI で過去へループ。
- **停止条件**: backward 尽きる(配信開始)/visited Set/segment数・elapsed・bytes 三重cap/既知commentNo最小到達で早期終了。
- **hot path 非干渉**: tryProcessBinaryBuffer/fetch readerループ(:901)に絶対入れない。独立 async・throttle・opt-in トリガ(`KEY_BACKFILL_ENABLED`・既存 KEY_GIFT_RANKING_LANE_ENABLED と同作法)。
- **rate limit**: PoC 未測定→巡回時 throttle 必須・BAN 回避。
- **mergeNewComments 件数 cap 不在**(commentRecord.js:283)→数万コメで storage/描画膨張→cap 設計（PR4 でも可）。
- 保存順≠時系列（backfill 古い順 append・capturedAt は取込時刻）→ソート/時刻設計。
- 会議の出し方: `Agent` tool の `Plan` subagent に実コード行番号付きで投げる（このセッションで2回成功。`run_in_background:true`）。

## 既存の合流点（PR3 で使う・実コード確認済み）
page-intercept handleNdgrResult(:538) → scheduleNdgrChatRowsPost(:133・80msバッチ・POST_CHUNK=220) → postMessage → content NLS_INTERCEPT_CHAT_ROWS(:1813) → schedulePersistNdgrChatRows(:1400) → flushNdgrChatRowsBatch(:1394) → **persistCommentRows(merged,{source:NDGR}) → mergeNewComments(commentRecord.js:283)**。canonical key=liveId+messageId で RT/DOM と二段 dedupe。

## 環境の注意（durable）
- ⚠️**Bash は1コマンドずつ・シンプルに**（このセッションで malformed 多発）。`cd` prefix 付けない。日本語 heredoc 文字化け→needle は src から読む。PowerShell 構文を bash に混ぜない（`Get-Content`等NG・`wc`等を使う）。
- Resilio: 編集→即commit→push。CRLF厳守。dist churn は `git checkout -- extension/dist/` で破棄。明示 refspec で push。
- 版bump こまめに(manifest/package/changelog.js/changelog.test.js・summary≤35字・先頭最大版・verify+verify:bump)。⛔CWS申請フロー回さない。
- 実機検証手法: Claude-in-Chrome で deviceId 64dc09e5… の Browser 1 に select_browser→tabs_context_mcp(createIfEmpty)→navigate→javascript_tool。⚠️**クエリ文字列/cookie を含む値を返すと MCP がブロック**するので、URL 生値でなく結果(status等)を返す。fetch は **credentials:'omit'** 必須。
- flaky e2e `save-ctx-invalidated-recovery.spec.js:104`（extensionContextBanner が10s内に visible にならない）は CI で時々赤・本物の退行でない・rerun で緑。安定化は spawn 済み別タスク。

## このセッションの既出荷（全 master merged・master=v0.1.402）
#150(イベント順位)→#151(全部—固定の根治 withTimeout)→#152(C-7①配信時間)→#154(C-7②③ サムネ/head情報表)→#155(backfill PR1 観測)。#153 は flaky で #154 superset マージ→クローズ。退避ブランチ fix/snapshot-fetch-stuck-guard 削除済。
