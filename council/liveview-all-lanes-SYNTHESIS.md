# SYNTHESIS: 応援プレビュー(passive)で「他のレーンが出ない・重い」を直す設計

会議 2026-06-26(council/liveview-all-lanes-question.txt)。発散役(deepseek系)+爆速役(llama-3.3-70b)一致。

## 裁定(A〜D)
- **A(主因)**: 両方かつ連動。(a)heavy comments read が passive プレビューで完走しない(567/14878件)=応援レーン/
  応援者ランキングが出ない。(b)北極星 refreshAll が after_gift_sync の `await Promise.allSettled([6本])` で
  1本 pending して止まる=北極星レーンが出ない。
- **B(heavy 567件で止まる)**: 多タブ IDB 競合 or iframe リロード中断 or 567 は cdbSummary.recent 由来の短い arr
  (heavy 全件未到達)。iframe で本物 popup を全面起動し watch タブと IDB を奪い合う構造が根。
- **C(北極星 pending)**: ギフト履歴 iframe(診断 state=iframe_unrendered)が passive で描画できず Promise が
  解決しない疑い。→ ★passive ではギフト履歴 iframe レーンを「最初から畳む(待たない)」べき。
- **D(重い)**: 本物 popup を iframe 全面起動する方式が watch タブと storage/IDB を奪い合う構造的重さ。
  全レーンを heavy read で出すと watch の記録(心臓部)を巻き込む。

## 設計の選択(E: 鏡経路=(2)採用)
**応援レーン/応援者ランキング/北極星レーンは、heavy comments read に依存せず、storage の「鏡」を
read だけして本物 paint で描く(status と同じ実績ある経路)。** iframe popup の重い描画/heavy read に依存しない。
- 応援レーン: KEY_LANE_MIRROR(buildLaneMirrorSnapshot/restoreLaneMirrorBuckets)→ paintStoryUserLaneDomFilled。
  ★status-entry.js が v0.1.948 まで実際にこれで描いていた(撤去したが lib は生きてる)。app/live-view.js も同経路。
- 応援者ランキング: topSupporters 鏡 → renderTopSupportRankStripInto(app/live-view.js に実装済)。
- 北極星(貢献度/広告): northStarMirror → officialDomRankingRowsToStripRooms → renderTopSupportRankStripInto。
- これらは全て chrome 非依存の本物 lib=似せて自作しない。app/live-view.js(純Web)が既にこの経路で描いている。

## ★重要: 発散役の指摘(Mirror-First Snapshot)
iframe で本物 popup の重いロジック(heavyDataPromise / refreshAll)を走らせること自体が、passive・読み取り専用・
共有 context で資源競合と pending を生む元凶。プレビューは「鏡を読んで描くだけ」の read-only renderer にするのが筋。
= app/live-view.js(純Web)が既にやっていること。拡張内プレビューも同じ思想に寄せる。

## PR 分割(リスク低→高)
- **PR1(最小・即効・低リスク)**: passive のとき北極星 refreshAll でギフト履歴 iframe レーンを待たない/畳む。
  10689 の allSettled から refreshNorthStarGiftHistoryLaneAsync を passive 時は除外 or 内部で passive 即 return。
  → 北極星の pending(refreshAllCompleted=0)が解消し、貢献度/広告レーンが出る・「止まる/重い」が緩和。
- **PR2(本丸・鏡経路)**: 応援レーン/応援者ランキングを、heavy read 完走に依存せず鏡(KEY_LANE_MIRROR/topSupporters)
  から描く。ただし鏡は status/popup が publish する=プレビュー単独だと鏡が無い場合がある。
  → publish 元(本物 popup が watch タブで KEY_LANE_MIRROR を書く・既存 publishLaneMirror)を passive プレビューが
  read して描く。app/live-view.js の paintLaneMirror / paintSupporterRanking を拡張内プレビューにも適用。
- **PR3(任意・軽量化)**: heavy read を passive プレビューでは走らせない(鏡で足りるなら IDB 全件読み自体を skip)
  =watch タブとの IDB 競合を断つ=「重い」の根治。

## 制約(触らない)
- popup の refresh()/paint の read path は触らない(v0.1.948 で2回却下)。
- content-entry.js(記録の心臓部)は触らない。watch タブの記録を巻き込まない。
- passive 原則(書かない/注入しない/外部 fetch しない)。storage/IDB read は可。
- テスト緑でも実機確認まで「直った」と言わない(v0.1.911-913 で3回外した教訓)。

## 実機検証手順
1. chrome://extensions で 🔄 更新。
2. 記録 ON で配信視聴 → ちくらんの🔥応援ライブビューを開く。
3. ★上段3カードに加え、応援レーン(りんく/こん太/たぬ姉の顔つき段)・応援者ランキングが出る。
4. ★北極星レーン(貢献度/広告ランキング)が出る(ギフト履歴は passive では「本物popupで見てね」案内 or 畳む)。
5. ★重くない(プレビューを開いても watch タブの記録・診断が固まらない)。
6. 実機で 3〜5 を確認するまで「直った」と言わない。
