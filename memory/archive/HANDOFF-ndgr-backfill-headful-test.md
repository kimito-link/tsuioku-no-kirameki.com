# 引き継ぎ: 過去ログ一括バックフィルの「実機ヘッドフルテスト」（2026-05-27）

対象: ニコ生コメント記録 Chrome 拡張 `tsuioku-no-kirameki.com`。
作業dir: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`。

## なぜ引き継ぎになったか
前セッションで Claude-in-Chrome の **`javascript_tool` 呼び出しが繰り返し malformed**（XML が壊れて送信されない）になり、実機テストが完遂できなかった。ユーザーが「新セッションで仕切り直し」を選択。Bash/Edit/Read 等は正常。**次セッションの教訓: `javascript_tool` の text は極力短い単一式にする（複雑な多行 JS / `getElementById` 等でパースが壊れた疑い）。それでも malformed が続くなら `browser_batch` か、ユーザーに手動操作を依頼する。**

## 実装の現状（master = v0.1.405・全 merged 済み）
過去ログ一括バックフィル「ウルトラC」は **PR2/3a/3b 全て master merged 済み**。機能は実装完了でリリース済み。
- PR2 [#156](https://github.com/kimito-link/tsuioku-no-kirameki.com/pull/156): `decodeChunkedEntry` 純関数。
- PR3a [#157](https://github.com/kimito-link/tsuioku-no-kirameki.com/pull/157): `crawlNdgrBackward` 巡回エンジン（src/lib/ndgrBackfillCrawl.js・fetch注入式・test12件）。
- PR3b [#158](https://github.com/kimito-link/tsuioku-no-kirameki.com/pull/158): content 配線 + popup ボタン「過去のコメントも取り込む（β）」。
- 詳細設計・実装マップ・既知の制約は memory `plan_ndgr_past_log_backfill.md` に全記録。

## ⛔ まだやっていない＝次セッションのタスク: 実配信での実機ヘッドフルテスト
**unit/e2e は緑だが、本物のライブ配信でバックフィルが実際に過去コメントを取り込むかは未検証。** これを Claude-in-Chrome で確認する。

### 前セッションで分かったこと
- ブラウザ: deviceId `64dc09e5-0299-40d9-92fa-bf69440d3a3e`（Browser 1・Windows・ログイン済み）。`select_browser`→`tabs_context_mcp(createIfEmpty:true)` で接続できた。
- 開いた配信 `lv350348256`（アイマスシンデレラ #601）は **タイトルが「2026/5/27(水) 22:00開始」= 予約枠/開始前の疑い**。`data-nls-page-intercept=1`（拡張は動作）だが **`data-nls-ndgr-view-uri` が absent**（view 未観測）。→ **テストには「いま放送中で、ある程度コメントが流れている配信」を選ぶこと**（予約枠/開始直後は NDGR view が出ず不適）。
- ⚠️ **拡張バージョン未確認**。Chrome は build 後 unpacked 拡張を自動 reload しないので、**ユーザーの Chrome の拡張が v0.1.405 か最初に確認**（古ければ chrome://extensions で reload 依頼）。

### テスト手順（次セッション）
1. ブラウザ接続 → 新規タブ。
2. **拡張バージョン確認**: 配信ページで `document.querySelector` 等は使わず、popup を開いてバージョンバッジを見る or `chrome://extensions`。v0.1.405 でなければユーザーに reload 依頼。
3. **いま放送中の配信を選ぶ**: `live.nicovideo.jp` トップで lv を拾い、`embedded-data` の `program.status` が `ON_AIR` のものを開く（前回 status 確認の JS が malformed で取れなかった→短い式で。例: `document.getElementById('embedded-data')` を変数に入れず、1行で status だけ返す）。コメントが流れているのを目視。
4. **配信ページで観測属性確認**: `data-nls-ndgr-view-uri` が `present` になるまで待つ（参加後しばらく）。present でなければバックフィルは起動できない（view 基点が無い）。
5. **現在の保存コメント最小 commentNo を記録**（バックフィル前）: storage の `nls_comments_<lv>` を読む（content world でないと chrome.storage 不可なので、popup の DOM か、拡張の診断経由）。
6. **popup を開き「過去のコメントも取り込む（β）」ボタンを押す**（詳細設定の上・記録ON必須）。`#enableBackfillFetchBtn`。
7. **検証**: 押下後しばらくして、保存コメントに **押下前の最小 commentNo より小さい commentNo**（=参加前の過去コメント）が増えるか。`data-nls-backfill` 属性が `seg=N rows=M done=1` に進むか。
8. ⚠️ **MCP は cookie/クエリ文字列を含む値を返すとブロック**するので、URL 生値でなく status/件数等の結果だけ返す。

### 期待挙動 / 失敗時の切り分け
- 期待: ボタン押下 → content の `runNdgrBackfillOnce` が `data-nls-ndgr-view-uri` を起点に NDGR を `credentials:'omit'` で巡回 → 過去 chat を取得 → `persistCommentRows({source:backfill})` で保存 → 件数増 + 小さい commentNo 出現。
- 出ない時の疑い: ①拡張が古い（v0.1.405 でない）②view-uri absent（配信開始前/参加直後）③記録OFF ④rate limit（429・PoC未測定）⑤実配信で NDGR の wire 構造が PoC と違う（decodeChunkedEntry が URI 取れず）。診断は `data-nls-backfill` と保存件数で。

## 環境の罠（durable）
- ⚠️ Claude-in-Chrome `javascript_tool` は**短い単一式**で（多行/複雑式で malformed 多発）。
- Resilio がファイルを巻き戻す。編集→即 commit→push。CRLF 厳守。dist churn は `git checkout -- extension/dist/`。
- ⛔ CWS 申請フローは回さない（ユーザー明示）。このプロジェクトは Chrome 拡張で iOS/Android/fastlane は無関係。
- 実機検証手法の詳細は memory `feedback_verify_in_real_browser_before_reporting` / `reference_usericon_synthesis_headful_findings`（診断レス実機検証の手法）。
