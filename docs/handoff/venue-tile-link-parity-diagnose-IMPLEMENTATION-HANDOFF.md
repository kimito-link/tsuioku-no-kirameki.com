# 実装ハンドオフ — 会場タイルのリンク欠落: 診断先行アプローチ(実害確定計器)

正本設計: [venue-tile-link-parity-diagnose-DESIGN.md](venue-tile-link-parity-diagnose-DESIGN.md)

**重要**: このファイルのC章の完全な差分(新規lib全文・venueBar.js/venueSeatsDiag.js/aiShareFullText.jsの配線)は、設計を行ったFableサブエージェントの応答(本セッション内)にある。実装開始時は必ずその応答を参照し、行番号を実コードと突き合わせて裏取りしてから着手すること。

## 前提: これは旧Patch①の後継設計

`diagnostic-architecture-strengthen-DESIGN.md`のPatch①(桁レンジ統一解除)は誤った前提に基づいており**実装しない**。本設計書が正しい後継。

## ゴール

**「直す」ことではなく「実害の有無・頻度を計測する診断計器を作ること」**。構造修正は今回のスコープ外。

## スコープ

1. 新規`src/lib/venueSeatLinkParity.js`(数えるだけの純関数lib)
2. `venueBar.js`の席装飾ループへの観測配線(4箇所: import・state宣言・ループ内観測・seatsDiagObs追加)
3. `venueSeatsDiag.js`のwhitelistに`seatLinkParity`追加
4. `aiShareFullText.js`に状態速報1行追加
5. テスト: `venueSeatLinkParity.test.js`新規+`venueLaneParity.wiring.test.js`に配線断言追加

## 着手手順(TDD)

1. ブランチを切る(例: `feat/venue-seat-link-parity-diagnose`)
2. `venueSeatLinkParity.test.js`を先に書いて赤にする(✅全一致/uid≠/実体≠両方向/href古/匿名同士一致/checked=0=⚪/badPaints1paint1回/lastSample上書き)
3. `venueSeatLinkParity.js`を実装
4. `venueBar.js`への配線(観測は毎paint・publishは既存3秒サイクルに相乗り、という非対称を必ずコメントで明記)
5. `venueSeatsDiag.js`のwhitelist追加
6. `aiShareFullText.js`の状態速報1行追加
7. `venueLaneParity.wiring.test.js`に配線断言を追加(CI赤で登録漏れを検知)
8. `npm run verify:cc`全緑確認
9. `rg "nlsb-seat-link" src --glob "*.test.js"`で既存characterizationテストへの影響確認
10. tree-map/feature-map再生成をコミットに含める
11. version bump(3点セット)+`npm run copy:ext`

## 機械的な完了判定

- `npm run verify:cc`全緑
- 実機確認(ユーザーへ依頼): 反映3手順後、実配信で(a)配信序盤・(b)コメント滝の最中・(c)配信終盤の3回、状態速報の「席リンク一致」行をコピペしてもらう
- 判定基準(正本設計の実機確認の手順セクション参照): ✅が続けば実害なし確定、🔴の種類によって次のアクションが変わる(構造修正/churn調査/即修正のいずれか)

## 地雷(正本設計から再掲)

1. 観測を3秒期日ゲート(diagDue)の中に置かない。過渡的不一致を取り逃す
2. venueSeatsDiag whitelist登録忘れは黙って空欄になる。wiring testで機械保証する
3. statusFastDiagLiteには載らない設計。実装コミットメッセージに明記して将来の誤診断を防ぐ
4. Date.now()(壁時計)を使う。performance.now()と混ぜない
5. 検証エージェント(reality-checker)実行中はcommitしない

## 次に必要な作業

実装は次チャット、または別モデルへ委譲してよい。着手時はこの1枚と正本設計、必要なら本セッションのFable応答(会話履歴)を参照すること。実装完了後は「実害の有無」が確定するまでは構造修正(旧Patch①相当)には着手しない。
