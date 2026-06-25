# 純Web /live-view を popup と「まったく同じ」に — 北極星レーン複製計画(ultracode)

> ユーザー「比べるんじゃなくてコピーでいい・拡張の応援ライブビューとまったく同じものをWEBサイト共有で見たい」
> ultracode 調査(9エージェント・実コード裏取り)→逐語コピー方式で確定→ユーザーが「8レーン全部+trio含める」を選択。
> 生データ: tasks/wkqccbgt1.output / 起動: workflows/scripts/popup-html-copy-feasibility-*.js

## 確定方式: 逐語コピー(verbatim)+本物純関数 import

popup.html の DOM id/CSS を逐語コピー(目視同期)し、描画は chrome 非依存の本物純関数を import。
ビルド時自動生成は popup CSS 14,000行で抽出境界が曖昧+新ツールチェーンの脆さ=過剰で却下。
P0-P3 で既に成立している方式を北極星レーンに広げるだけ。drift は「描画は必ず共有 lib 経由・独自描画を一切書かない・
移植部の DOM/CSS は popup.html から逐語+目視」で抑える。

## 既に移植済み(P0-P3・実機確認済み)

配信者カード / 数字カード / 応援レーン(りんく/こん太/広告/たぬ姉) / 応援者ランキング(顔つき🥇🥈🥉)。

## 残る未移植 = 北極星レーン(公式値レーン)= これが「まったく同じ」の最後の差

★ユーザー確定=8レーン全部 + trio取得率も含める(完全一致)。
- 8レーン: eventBroadcasters / eventVotingSupporters / contributionRanking(ギフト貢献度) / giftHistory(ギフト履歴) /
  programPoints(番組pt) / adRanking(広告) / eventRank(イベント順位) / eventScore(イベントスコア)。
- 各レーンは `#northStarLaneBody-<laneId>` に mirrorHtml を sanitizeMirrorHtml で流し込む方式。
  renderNorthStarLane(laneId, mirrorHtml, fallbackState)(popup-entry.js:8989)が正本。
- ★sanitizeMirrorHtml(src/lib/mirrorSanitize.js)は chrome 非依存の純関数=純Web再利用できる(これが鍵)。
- 北極星3キャラ trio(#northStarCharaTrio・りんく/こん太/たぬ姉の取得率%)も含める。

## 送信データ追加(officialEventBundle + trio)

★status-entry.js は EXTRAS(12秒キャッシュ・_extrasCache)側で読む=毎回の直列 read を増やさない(MEMORY 鉄則)。
- 新フィールド officialEventBundle = { liveId, capturedAt, 各レーンの mirrorHtml(生 outerHTML)or rows, programStats, eventBanner }。
  正本=storage nls_event_dom_<lv> の officialEventDomBundle(content が8秒ごと保存・popup が読む)。
- trio = { rink/konta/tanu の tier/pct }(無ければ純Web側で rows 有無から再計算でも可)。
- mirrorHtml は生 outerHTML なので純Web側で必ず sanitizeMirrorHtml を通す(XSS/巨大化対策・popup と同じ)。
- api/status.js は payload 丸ごと保存=サーバー無変更。サイズ=mirrorHtml は各レーン cap(popup の mirrorHtmlBytes 上限)。

## TDD フェーズ(小さく安全な順・各段 verify:cc 緑+実機目視)

- **C0(抽出)**: renderNorthStarLane の「body へ sanitize して流し込む」核を src/lib/northStarLaneDom.js に無挙動抽出
  (chrome 非依存・テスト先行)。popup-entry は import 置換(挙動不変)。
- **C1(送信)**: status-entry.js の EXTRAS で officialEventBundle を読み jsonBlob に相乗り送信(+trio)。
  ★毎回 read を増やさない(12秒 extras)。送信後 payload サイズ計測(512KB 未満)。テスト先行(bundle 整形の純関数)。
- **C2(純Web DOM/CSS 逐語コピー)**: popup.html の北極星レーン DOM(#northStarLanes 8枠+#northStarCharaTrio)と
  参照 CSS(.nl-north-star-*)を app/live-view.html に逐語移植。参照 --nl-* 変数を :root light/dark 両方へ(裸要素化回避)。
  画像は絶対 /app/ パス。
- **C3(純Web 描画)**: app/live-view.js の render に renderNorthStarLanes を追加。officialEventBundle の各 mirrorHtml を
  本物 sanitizeMirrorHtml→northStarLaneDom で流し込む。trio も描画。鮮度ガード同型。
- **C4(整合・実機)**: verify:cc 全8緑→deploy→Claude-in-Chrome で「8レーン+trio が popup そっくり」を目視。

## リスクと緩和

- mirrorHtml の sanitize: 必ず sanitizeMirrorHtml を通す(popup と同じ・生 outerHTML を直貼りしない)。
- payload 肥大: mirrorHtml は各レーン cap。送信前にサイズ計測(現状 131KB=cap の25%・余裕)。
- CSS 変数移植漏れ→裸要素化(v0.1.900): 移植セクションが参照する --nl-north-star-* / --nl-lane-accent-* を :root 両方へ。
- 画像パス: 絶対 /app/(P1 の轍)。
- drift: 描画は共有 lib 経由・独自描画ゼロ・DOM/CSS は popup.html から逐語+目視。
- storage read 増やさない: officialEventBundle は extras(12秒)側。
- 拡張 live-view/popup/会場/既存 P0-P3 を壊さない: 共有 lib は無挙動抽出・status/popup は import 置換のみ。

## stopAndAsk(解決済み)

- コピー範囲=8レーン全部(ユーザー確定)。trio 取得率も含める(ユーザー確定)。

---
*ultracode 調査+設計: 2026-06-25 / Claude Opus 統合(実コード裏取り) / C0 から TDD 実装*
