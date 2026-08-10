# 3画面 状態速報パリティ — 実機 verify 完了 (2026-06-29 / v0.1.997)

## 結論(一行)
**②応援ライブビュー・③WEB に①と同一のフル状態速報(完全性スコア含む)が、実拡張/実Webで実際に描画されることを probe+目視で確認済み。** HANDOFF-resume-0629 §3-(C) のゴール達成。

## 現在地
- master HEAD = v0.1.997。origin 同期 0/0。実装は v0.1.994(②③に状態速報)〜v0.1.997(完全性スコア+観点レジストリ)で出荷済み。
- 作業ツリーの差分は dist のビルドIDノイズ(NL_BUILD_ID 相当・`0629-172706`→`0629-220353`)+ セッション開始時からの council/* と scripts/meeting.mjs だけ。実コード差分ゼロ=捨ててよい(HANDOFF §5)。

## verify の方法(再現手順)
chrome-devtools MCP の別Chrome(ユーザー配信に無関係)で:
1. `npm run build` → `install_extension('...repo.../extension')`。ID=edpellgokebgpjboflekdmmlnjgajnfn・v0.1.997 Enabled。
2. **②**: `live-view.html?lv=lvXXXX`(popup?dock=liveview ではなく **live-view.html** が②本体)を開く。
   sw-1 で `chrome.storage.local.set({ 'nls_liveview_publish_payload_v1': { jsonBlob:{ statusReport:'...', northStarMirror:{liveId} } } })` を seed
   → `storage.onChanged` で `#lvStatusReport`(`<details>`「🩺 状態速報(診断)を開く」内 `#lvStatusReportText`)に**バイト一致**で描画。確認済。
3. **③**: 静的サーバ + `/api/status?v=tok` スタブ(`{ data: jsonBlob }` を返す)で `app/live-view.html?v=tok` を開く。
   `fetchSnapshot`→`bootWithSnapshot`→`paintAllMirrors(jsonBlob)`→`paintStatusReport` が動的生成 `#lvWebStatusReport`/`#lvWebStatusReportText` に描画。確認済(WEB-VERIFY マーカー一致)。
   スタブサーバ雛形: scratchpad/serve-app.mjs(repo root を配信+ /api/status だけ差し替え)。`live-view.html` は `/app/dist/live-view.js`、その中で `../src/extension/popup-entry.js` を dynamic import するので **repo root 配信**が必須。

## 設計の要(触るときの前提)
- ②=`extension/live-view.html` + `src/extension/live-view-entry.js`。本物 popup を iframe 埋め込み(`lvPopupFrame`)+ `KEY_LIVEVIEW_PUBLISH_PAYLOAD`(=`nls_liveview_publish_payload_v1`)`.jsonBlob.statusReport` を**読むだけ**で `#lvStatusReport` に貼る。受動ビュー不可侵=書かない。
- ③=`app/live-view.js`。`/api/status?v=token` の `json.data` を jsonBlob として `paintAllMirrors` →末尾で `paintStatusReport(jsonBlob.statusReport)`。拡張storage非依存=サーバの鏡のみ。
- ①②③とも本文は status の `buildAiShareFullText`(src/lib/aiShareFullText.js)の結果=**再構築せず貼るだけ=バイト一致**。①を直せば②③も自動追従。

## 残課題(描画とは別系統・未着手)
- 記録101%(記録>本家コメ)=別配信混入 or 二重計上の疑い。`commentCountProvenance` が毎回「要確認」。実コードで切り分け。
- 取り込みが遅い(取得率%が低い)=backfill の取得スピード。描画とは別。
