# 引継ぎ: 北極星レーン描画 大改修セッション(2026-06-04 未明・v0.1.616→619)

> 司令塔(Claude Code)が長時間の実機診断ループで北極星レーン(ランキング帯)の描画問題を
> 段階的に直したセッションの引継ぎ。**ブランチ `fix/koken-contrib-hidden-tab-stuck` に v0.1.616〜619 が
> 8コミット積まれている(未 merge)。** 次セッションは「残課題1」から着手すること。

## 0. いま最優先で直すべき残課題(これが未解決)

### 残課題1: データ無し配信で貢献度/ギフト/広告レーンが「畳まれない」(v0.1.619 で実装したのに効かない)
- **症状**: koken API が rows=0 を返す配信(例 なかにし lv350674854: `kokenLastRows:0`)で、貢献度ランキングレーンに
  「(取得待ち: 公式の一覧がまだ開いていません)」等の待機UIが**残り続ける**。ユーザー「だめですね」。
- **データがある配信では完璧**(あかねこ lv350674779: koken23件/nicoad10件 → 全レーン横カードで美しく表示・
  「とれることもある」)。改修A〜C は data-present では効いている。
- **実装したのに効かない真因が未特定。** v0.1.619 で:
  - `renderNorthStarLane`(popup-entry.js:8764付近) → 待機 state のとき `applyNorthStarLaneWaitingOrHide`
    (:8784付近)を呼ぶ。`NORTH_STAR_API_DIRECT_HIDE_WHEN_EMPTY_LANES`(contributionRanking/giftHistory/
    adRanking)なら `setNorthStarLaneHidden(laneId, true)` で hide するはず。
  - CSS `.nl-north-star-lane[hidden]{display:none!important}` は popup.html:3920 に**存在する**(確認済み)。
  - hide logic も committed dist に入っている(grep 1件)。**なのに hidden にならない。**
- **次に試すこと(推測実装せず実機で特定)**:
  1. Claude-in-Chrome でユーザーの watch タブ(無理なら新タブで同等配信)を開き、貢献度レーン
     `.nl-north-star-lane[data-lane="contributionRanking"]` の `hidden` 属性と `data-lane-state` を
     `javascript_tool` で直接読む。hidden が付いているか/CSS が効いているかを切り分け。
  2. 仮説候補: (a) `refreshNorthStarContributionRankingLaneAsync` の empty 分岐(:9602-9605)が
     実際は `renderNorthStarLane` でなく別経路(早期 paint?)を通っている。(b) hide した直後に
     `mountAllNorthStarLanesBundleLoadingUi`(:8676付近・liveId 変更時のみのはずだが要再確認)や
     ポーリングが待機UIを再 mount/再表示。(c) `paintTopSupportRankStyleIntoElement` の v0.1.619 un-hide
     (:9326-9332)が別レーンの paint で誤って contribution を un-hide。(d) diff-skip painter(v0.1.618)の
     副作用。
  3. `_northStarRenderProbe` 風に「hide を呼んだ回数 / その後 hidden 属性が実際に付いたか」を観測追加して
     次の診断で一意に。

### 残課題2(別系統・取り込み層): ユーザー別ランキングが少ない瞬間 / 記録が伸びない
- ユーザー指摘「2900件あるのにランキング1件」「記録が伸びない」。
- 真因候補: NDGR(userId が取れる主経路)の受信が間欠的(`ndgrLastReceivedAgo` が大きい・`chats` が少ない・
  `savedCommentsUidStats.withUid` が少ない瞬間がある)。コメント本体は DOM scrape で記録できるが userId 無し
  → ユーザー別集計に乗らない。**描画とは独立した取り込み層の問題。** 別 PR で。
- ただし配信により差が大きい(あかねこ配信は `withUid:966/979=98.7%` で良好)。NDGR が安定して受信できているかが鍵。

### 残課題3: 診断の `北極星レーン.state` が嘘(調査を何度も惑わせた・要修正)
- content-entry.js:5827 の `determineNorthStarLaneState(laneId,{bundle,snap})` が **content の bundle しか見ず
  koken/nicoad API storage を見ない**ため、koken 27件取れていても `iframe_unrendered` と誤報告する。
- これに何度も騙された。診断を信頼できるようにするため、content 側で `nls_koken_api_contrib_<lv>` /
  `nls_nicoad_api_ranking_<lv>` を読んで state 計算に渡すべき(実表示と一致させる)。

### 残課題4(記録のみ): コメント送信11.3秒の遅延 / iframe warmup(mountSuccess:false で死)撤去

## 1. このセッションで完成した修正(v0.1.616〜619・ブランチに commit 済み・全て npm run verify 全緑)

| ver | commit | 内容 | 実機評価 |
|---|---|---|---|
| 0.1.616 | f664922,c4b7cf4 | 裏タブ未取得時のみ fetch(hiddenTabExternalFetchGate.js)+ 取得層の観測(externalFetchProbe)+ nicoadFetchStatus never固定バグ修正 | ✅ |
| 0.1.617 | 417b3ca,5307f4e | イベント非参加レーン即畳み(hideNorthStarEventLanesIfNotParticipating)+ determineNorthStarLaneState に kokenApiRows/nicoadApiRows + 広告レーン async 化 nicoad 直読み + timeline/celebration 非ブロック化 + northStarRenderProbe | ✅ |
| 0.1.618 | 0f987c3 | **描画アトミック化**: paintTopSupportRankStyleIntoElement を innerHTML 全置換→ 差分スキップ(同一HTMLは触らない・WeakMap)+ `<template>`+replaceChildren | ✅✅ **「めちゃよくなった」白飛び/ちらつき根治・refreshAllStarted/Completed 241/241** |
| 0.1.619 | 1c33c89 | 「タブを開け」古い案内撤去(待機文言を「公式から問い合わせ中」へ・図解全廃)+ popup.html sublabel 書直し + データ無しレーン畳み(NORTH_STAR_API_DIRECT_HIDE_WHEN_EMPTY_LANES) | ⚠️ 文言/図解はOK・**畳みが効かない=残課題1** |

### v0.1.618 の改修A(最重要・効いた)の要点
- `paintTopSupportRankStyleIntoElement`(popup-entry.js:9270付近): 前回 HTML と同一なら DOM を一切触らずスキップ
  (`_topSupportRankLastHtmlByEl` WeakMap)。変化時のみ `<template>` でメモリ上に組んで `el.replaceChildren`
  でアトミック差し替え(「一瞬空=白」が出ない)。
- ディープリサーチ(web.dev/MDN/Chrome公式 + 自コード)の結論にもとづく。

## 2. 実機診断で確定した「揺るがない事実」(次セッションの前提)

- **取得層は完璧**: externalFetchProbe で koken/nicoad とも 200・leaderRan>0・rows 取れている(データある配信)。
  SW fetch も健全。**問題は常に描画層 or 取り込み層(NDGR)。**
- **描画は安定**: northStarRenderProbe の refreshAllStarted ≒ Completed(100%近い)。改修A で完走するようになった。
- **lastRunAgoMs が小さい(29ms 等)のは busy な配信の正常値**で暴走ではない(別配信で 24030ms=正常を確認)。
- **診断の `北極星レーン.state` は信頼するな**(残課題3・bundle 由来で API storage 未参照)。
  代わりに `externalFetchProbe.kokenLastRows` / `northStarRenderProbe.lastContribResolveRows` を信じる。

## 3. git / 環境状態
- ブランチ `fix/koken-contrib-hidden-tab-stuck`(origin/master = e77980a = v0.1.615 ベース)。
- HEAD = `1c33c89`(v0.1.619)。master との差 = **8コミット**。
- working tree: `extension/dist/popup.js` に build-id churn 1行のみ(無害・捨ててよい)。
- **PR #219 は OPEN だが title が v0.1.616 のまま**(中身は 619 まで進んでいる)。merge 時に PR 説明を更新するか、
  新規 PR を立て直すか判断。**まだ merge していない。**
- v0.1.592 baseline 絶対尊重(reference_baseline_v0192_zip)。

## 4. 関連 reference / docs(このセッションで作成)
- `memory/reference_north_star_lane_repaint_refactor_meeting_v0617.md`(会議依頼書・ディープリサーチ結論)
- `memory/reference_koken_api_lane_stuck_meeting_brief_v0616.md`(前会議)
- `docs/north-star-lane-repaint-refactor-v0617.md`(改修A 設計)
- `docs/codex-koken-api-lane-stuck-fix-v0616.md`(真因A/B/C)
- `docs/koken-contrib-hidden-tab-stuck-fix-v0616.md`(裏タブ)

## 5. 主要ソース地図(popup-entry.js)
- 全レーン共通 painter: `paintTopSupportRankStyleIntoElement`(:9270付近・v0.1.618 アトミック化)
- 待機/placeholder: `renderNorthStarLane`(:8764)→ `applyNorthStarLaneWaitingOrHide`(:8784・v0.1.619 畳み)
- 一括再描画: `refreshAllNorthStarMirrorLanes`(:10455付近・timeline/celebration 非ブロック化済)
- 貢献度: `refreshNorthStarContributionRankingLaneAsync`(:9534) / resolve: `resolveOfficialContributionRankingRows`(:8840付近)
- 広告: `refreshNorthStarAdRankingLane`(:9380・v0.1.619 async+nicoad直読み)
- イベント2レーン: refreshNorthStarEvent{Broadcasters,VotingSupporters}LaneAsync / `hideAndClearNorthStarEventLane`(:9908付近)
- hide 共通: `setNorthStarLaneHidden`(:9891) / CSS は popup.html:3920
- 観測: `_northStarRenderProbe`(popup) / `_externalFetchProbe`(content-entry.js)
- state 純関数: `src/lib/northStarLaneReason.js`(determineNorthStarLaneState・API rows 込み)
- 待機文言: `src/lib/northStarLaneWaitingUi.js`(v0.1.619 で「公式から問い合わせ中」へ統一・図解全廃)

## 6. 次セッションの推奨アクション
1. **残課題1 を Claude-in-Chrome 実機で一意特定**(hidden 属性が付くか/再表示されるか)→ 直す → v0.1.620。
2. data-less で畳めることを実機確認できたら、PR #219(または新PR)を整えて **squash merge**(改修A〜の大成果を確定)。
3. その後、残課題3(診断 state 正確化)→ 残課題2(NDGR 取り込み間欠)の順。
4. e2e の `event-broadcasters-lane.spec.js:19` は **documented flaky**(純master でも headless で落ちる・master baseline で実証済)。
   CI e2e fail はこの systemic flaky の可能性が高いので、unit verify 全緑 + 集合変動を確認して判断(過去 PR #216/#218 と同じ運用)。
