# 純Web /live-view を popup そっくりにする — 調査+TDD実装計画(ultracode)

> ユーザー「純Web版 /live-view?v= が 拡張内 live-view.html?lv=(popupそっくり)と同じになってない・また勝手にアレンジされてる」
> ultracode ワークフロー(9エージェント・実コード裏取り)で調査→案B-移植で確定→ユーザーが「実装する」を選択。
> 生データ: tasks/wotwek84c.output / 起動スクリプト: workflows/scripts/liveview-popup-parity-investigation-*.js

## 確定した方式: 案B-移植(本物の描画関数を純Webに import)

★案B-iframe(popup.html を純Webで iframe 埋込)は【物理的に不可能】= popup.html は chrome-extension:// スキーム +
popup-entry.js が chrome.* に190箇所依存。純Web(app.tsuioku-no-kirameki.com)から chrome-extension:// を src に
できずロードも storage 読取もできない。拡張内 live-view の iframe が成立するのは同一拡張オリジン内だから。
→ 本物の描画関数(paintStoryUserLaneDomFilled/buildPersonTileEl/renderStatCardsMirror/supporterRowToPersonTile/
resolveBroadcasterFollowTarget)は全て chrome 非依存の純JS=純Webに import するだけで「似せて自作しない・本物そっくり」を満たす。
応援レーンは既にこの方式で移植済み(実証済み)。同じ轍を数字カード/配信者カード/ランキングに広げる=最小ブラスト半径。

## 現状差分(実コード確定)

| セクション | 純Web現状 | 送信データ jsonBlob | 対応 |
|---|---|---|---|
| 応援レーン | ✅本物関数で描画済 | laneMirror 送信済 | 退行させない |
| 数字カード | ❌受信のみ・未描画(帯域浪費) | statCardsMirror 送信済 | P1で描画 |
| 配信者カード | ❌DOM無し | lives[0] に材料(broadcasterName/title/thumbnailUrl…)・確定カードは未送信 | P2で送信+描画 |
| 応援者ランキング | ❌無し | reportPreview.topSupporters 【未送信】 | P3で送信+描画 |

api/status.js は payload を v 削除のみで丸ごと保存=新フィールド追加はサーバー無変更。

## TDD フェーズ(小さく安全な順・各段 verify:cc 緑+実機目視)

- **P0 退行ガード(characterization)**: renderStatCardsMirror を status-entry.js から src/lib/renderStatCardsMirrorDom.js
  (DOM DI 型・chrome 非依存)へ【無挙動変更で抽出】。先にテストで現挙動(setVal/setSub のテキスト+is-placeholder トグル・
  official=null で全チップ '—' に戻る)を固定。status は import して呼ぶだけ(挙動不変)。
- **P1 純Webに数字カード鏡**: app/live-view.html に status.html:1051-1132 の statCardsMirror DOM をそっくり移植
  (id/class 完全一致)+参照 CSS 変数を :root light/dark に追加(v0.1.900 裸要素化の轍回避)。app/live-view.js の render に
  renderStatCardsMirror(jsonBlob.statCardsMirror) を1行。送信データ追加なし。鮮度切れ hidden のネガコン。
- **P2 配信者カード送信+描画**: jsonBlob に broadcasterCard(name/level/iconUrl/pageUrl・resolveBroadcasterFollowTarget の
  確定値)を相乗り。app/live-view に配信者ヘッダ DOM 移植+render に1関数。null で hidden。
- **P3 応援者ランキング送信+描画**: jsonBlob に reportPreview.topSupporters(+liveId+capturedAt・上位10件cap)を相乗り。
  app/live-view で supporterRowToPersonTile→buildPersonTileEl の本物再利用(v0.1.937 の status 顔つきランキングと同一見た目)。
  匿名は identicon(chrome.runtime.getURL 非依存の displaySrc をそのまま・app/live-view.js:48 既存パターン)。
- **P4 整合・無駄送信の掃除**: 読まれず捨てるフィールドが無いか確認。JSDoc 更新。複数lv非対応(laneMirror グローバルキー)は後段明示。

## リスクと緩和

- drift(将来 popup を直したとき移植部がズレる): 描画は必ず共有 lib(本物関数)経由・独自描画を書かない・DOM id/CSS は status.html から逐語移植。
- CSS 変数移植漏れで裸要素化(v0.1.900): 移植セクションが参照する --nl-* を :root light/dark 両方に定義してから描画。
- payload 肥大(512KB cap 半減で laneMirror が痩せる): ランキング上位10件cap・broadcasterCard 数フィールド=増分小。送信前サイズ計測。
- 公式チップ再計算齟齬: statCardsMirror は popup 側で確定格納済み=純Webは再計算せず値をそのまま描く。
- 匿名 identicon の chrome 依存: upgradeAnonymousAvatarImage を渡さず displaySrc をそのまま(既存方針)。

## 解決済みの stopAndAsk

- 純Web共有を残すか: ユーザーが「実装する=純Webを popup そっくりに」を選択(共有を残す前提で確定)。
- リアルタイム vs スナップショット取り違え: 純Webは既存の「最終送信 HH:MM」表示で明示。
- 個人情報の公開: OSINT 範囲で公開可([[project_liveview_web_public]] で確定済み)。

## 実装進捗

- ✅ **P0 完了**(v0.1.938 内・dbc相当): renderStatCardsMirror の値セットを src/lib/statCardsMirrorDom.js
  (paintStatCardsMirrorValues・純DOM・chrome非依存)へ無挙動抽出。特性テスト7本。status は import して使う。
- ✅ **P1 完了**(v0.1.939・89c88fd0 + 画像パス修正 47772278): 純Web /live-view に数字カードを描画。
  status.html の DOM/CSS を verbatim 移植・本物 paintStatCardsMirrorValues 再利用・鮮度/signature ガード同型。
  ★実機確認済(deploy 後・記録1,959/同接~261/来場1,527/公式チップ5つ・キャラアイコン3枚)。
  ★画像パス問題=relative `images/yukkuri/` は /live-view(ルート)で /images/ に解決され404→絶対 /app/images/ に修正。
  これで数字カードアイコンも pre-existing の応援レーン顔割れも両方直った(naturalWidth 0→1500 実機確認)。
- ⏭ **P2 未着手**: 配信者カード(broadcasterCard を jsonBlob に送信+純Web描画)。
- ⏭ **P3 未着手**: 応援者ランキング(reportPreview.topSupporters を jsonBlob に送信+純Web描画)。
- ⏭ **P4 未着手**: 整合・無駄送信掃除。

★教訓(P1)=純Web(vercel rewrite 配下・/live-view=ルート)の画像/スクリプトは必ず絶対 /app/ パス。
relative は /images/ /dist/ に解決され 404。dist/app.js を /app/dist/ にした v0.1.932 と同じ轍。

---
*ultracode 調査+設計: 2026-06-25 / Claude Opus 統合 / P0+P1 完了(実機確認済)・P2-P4 は次セッション*
