# 会議 SYNTHESIS: ①watch本体 ＝ ②応援ライブビュー ＝ ③純Web を同じにする(3画面パリティ)

> 司令塔が実コードで土台を作り、3視点(並行性/データ整形/パリティ批判)で独立検証→統合。
> ユーザー要求「本物の watchtab診断 ＝ 応援ライブビュー ＝ このURLをWEBで公開 は 全部おなじじゃないとだめ」。

## 総合判定: confirmed

## 根の要約(P0 貢献度コピー漏れ)
popup-entry.js:5650-5686 publishNorthStarMirror は「合流バッファを先に更新し、その後に 3 秒 min-gap チェック」する構造。Promise.allSettled バースト内で貢献度と広告が 1-2ms 間隔で back-to-back に publishNorthStarMirror を呼ぶと、先に呼んだ方が min-gap を通過して write、後に呼んだ方は min-gap で return されてバッファだけ更新・永続化されない。実機（lv350833724）では広告が write を勝ち取り、貢献度の 6 件が鏡に出ず 0 件のままになった。解決順は非決定的なので、貢献度が落ちるケースと広告が落ちるケースが混在する。

## 他のコピー漏れ経路(優先順)
1. status の 12秒キャッシュと popup の 3秒min-gap が時間的にズレ: 後発レーンが min-gap で落ちた直後に status が読むと、古い状態の snapshot が jsonBlob に乗り、②③が古いデータを見る（P0 と相乗り）。
2. 数字カード・コメントティッカー鏡も同じ min-gap 3秒設計: popup-entry.js:5573-5595/5597-5630 で publishStatCardsMirror/publishCommentTimelineMirror も個別呼び出し。同じ並行性問題を持つ。修正案(b)と同じ構造に統一すれば同時解決。
3. ローディング overlay が①で畳まれない（描画済み 11件なのに）: ①固有の visual glitch。②③には出ない問題。
4. イベント順位・ギフト履歴が INLINE_PASSIVE で iframe 描画不可: 受動ビュー(②)では koken/sub-app iframe が描けないため、state=iframe_unrendered。これは**構造的制約**で正常。③は純 Web なので①が publish した鏡で代用。

## 第1段の最小修正(案b)
refreshAllNorthStarMirrorLanes（popup-entry.js:10965-10977）の Promise.allSettled バースト内の個別 publishNorthStarMirror 呼び出しを撤廃。代わり、allSettled 完了後に 1 回だけ publish を呼ぶ。(1) refreshNorthStarContributionRankingLaneAsync:9980 の publishNorthStarMirror 呼び出しを削除。(2) refreshNorthStarAdRankingLane:9864/9932 の publishNorthStarMirror 呼び出しを削除。(3) 10977 await Promise.allSettled(...) 直後に publishNorthStarMirror({ liveId: lid, contributionRanking: _northStarMirrorLanes.contributionRanking, adRanking: _northStarMirrorLanes.adRanking }) を 1 行追加。【同時に数字カード・コメントティッカー鏡も同じ構造に統一】

### なぜ安全か(地雷ゼロ)
最小・低リスク・確実。(1) read path に触れない(write-only 鏡・popup の refresh()/paint は storage の鏡を読まない)。(2) min-gap 3 秒原則を温存(allSettled 1 回 = 1 回の publish・write 頻度不変)。(3) INLINE_PASSIVE 原則守る(passive では publishNorthStarMirror 自体呼ばれない)。(4) content/会場 iframe 不触。(5) 遅延 flush は状態管理複雑・min-gap 撤廃は write 頻度跳ね上がり、に比べ修正(b)は両レーンが allSettled で揃ってから確実に 1 回の snapshot として write される。非決定的な解決順序に関わらず最終状態が常に両方揃う。

### 単体テスト方針
(1) min-gap ユニットテスト: Date.now() モック化 → T=0 に publishNorthStarMirror({adRanking:[...]}) → write 成功・_northStarMirrorLastWriteAt 更新 → T=500ms に publishNorthStarMirror({contributionRanking:[...]}) → min-gap チェック true → return 確認・storage に adRanking だけある状態 → T=3100ms に publishNorthStarMirror({contributionRanking:[...]}) → write 成功。(2) 修正後の統合テスト: refreshAllNorthStarMirrorLanes シミュレーション → 貢献度と広告の async 解決順序をランダム化（複数回） → Promise.allSettled 完了後、常に両レーン揃った snapshot が storage に write されることを確認・storage.local.set count=1。(3) round-trip 回帰: northStarMirror.test.js:56-65/110-120 の既出テスト実行 → buildNorthStarMirrorSnapshot → restore → officialDomRankingRowsToStripRooms が元 rows と byte 一致。(4) 実機検証: lv350833724 再度開く → status「北極星 貢献度」が 0 でなく拡張と一致する値 → 純 Web 公開で③にデータ送信・①②③で同値表示。

## 3画面が同じにならない根(網羅・優先順)
1. 【P0 根1: min-gap×合流バッファ後 return】popup-entry.js:5650-5686 publishNorthStarMirror が合流バッファを先に更新してから min-gap チェック。Promise.allSettled バースト内で貢献度と広告が back-to-back に resolve して両方 publishNorthStarMirror を呼ぶと、先着がwrite・後発が min-gap で return・バッファだけ更新・永続化されない。実機 lv350833724 では貢献度 6→0 に落ちた。修正案(b)で allSettled 後 1 回だけ publish に統一。
2. 【P1: status の 12 秒キャッシュ】status-entry.js:390 loadNorthStarMirrorSafe は 12 秒ごとに storage を読む。後発レーン落下直後に status が読むと、古い/空のデータが jsonBlob に乗り②③が古いデータを見る。修正(b)で後発レーン落下を防ぐと同時に解決。
3. 【P2: ローディング overlay①固有】popup-entry.js 内で①固有の visual glitch（描画済み 11 件なのに overlay 畳まれず）。②③には出ない問題。第2段。
4. 【P3: イベント順位/ギフト履歴 iframe_unrendered】INLINE_PASSIVE では koken/sub-app iframe 描画不可。②③に出ない**構造的制約**で正常。③は純Web なので①の鏡で代用。
5. 【P4: 数字カード・コメント鏡も min-gap】popup-entry.js:5573-5630 で publishStatCardsMirror/publishCommentTimelineMirror も同じ min-gap 3 秒。修正(b)と同じ構造に統一すれば同時解決。

## 段階方針
**第1段:** (1) 修正案(b) 実装 = 貢献度・広告の個別 publish 削除→allSettled 後 1 回 publish に統一。(2) 数字カード・コメント鏡も同じ構造に統一（read-all 後 1 回 publish）。(3) ユニット・統合・実機テスト。到達条件: ①②③ が同じデータを表示（実機 lv350833724 再検証）。| **第2段:** (1) ローディング overlay バグ（①固有）。(2) イベント順位・ギフト履歴の INLINE_PASSIVE 制約対応（既知・設計制約）。| **第3段以降:** Other parity issues（応援者ランキング等の複合パリティ）。

## 実機での到達条件
①②③ が同じ 1 つの真実を寸分違わず映す鏡。実機状態速報で「北極星 貢献度: 拡張/鏡が同じ件数」「北極星 広告: 拡張/鏡が同じ件数」を同時に確認。純Web 公開で③ にデータが送られ、popup ① と live-view ② と純 Web ③ が同じ値を描画。診断パネル（_northStarRenderProbe）で「貢献度 apiRows/鏡 rows/描画」が全て揃っていることを確認。
