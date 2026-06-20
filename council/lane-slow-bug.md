# 調査メモ: 貢献度/広告ランキングレーンが「すぐ出ない」(2026-06-20)

> 実機 lv350792340(裏タブ)。ユーザー長年の課題「公式値レーンがすぐ出ない/出ない」。

## 実データ
- 北極星レーン: 番組pt=ok(NDGR・値200・すぐ出る) / 貢献度ランキング=state:ok だが count:0 / 広告ランキング=state:ok だが count:0 / ギフト履歴=no_program_gift(対象外) / Eスコア・E順位=no_event(対象外)
- rankingDiag.autoOpen: attemptCount:0 / lastFailureReason:"never_attempted"
- externalFetchProbe: kokenLastRows:2 / kokenLastOk:true / nicoadLastRows:4 / nicoadLastOk:true(API は取れている)
- giftSubAppDiag.failureReason: "cross_origin_iframe_only"

## 実コードで確定した構造
- 北極星の `count`(content-entry.js:5462) = DOM bundle の contributionRanking.length。**DOM 由来**。autoOpen 未発火/cross-origin だと DOM は空=count:0。これは想定内。
- 実際の表示は popup の resolveOfficialContributionRankingRows(popup-entry.js:9047) が **Koken API storage** を読んで描く(優先度 Koken API→DOM bundle→iframe)。
- autoOpen は opt-in flag(ランキングレーン有効化)が OFF だと一度も発火しない(never_attempted の理由)。だが Koken/Nicoad API は opt-in 無関係に自動取得(裏タブでも)。

## 🔴 確実なバグ(対称性の崩れ)
popup-entry.js:9774 貢献度ランキングの state 判定が **kokenApiRows を渡していない**:
- 広告ランキング(正): determineNorthStarLaneState('adRanking', { bundle, snap, nicoadApiRows })
- 貢献度(バグ): determineNorthStarLaneState('contributionRanking', { bundle, snap }) ← kokenApiRows 欠落
northStarLaneReason.js は contributionRanking で kokenApiRows を見て ok 判定する設計なのに渡されない
=ranking が取れなかった時の state が不正確(DOM bundle だけで判定)。

## 真因の確度
- 確実: 上記の対称性バグ(state 診断が不正確)。修正は安全(広告と同じく kokenApiRows を渡す)。
- 不確実(要実機 runtime): kokenLastRows:2 なのに表示されない=Koken の2行が resolveOfficialContributionRankingRows で
  落ちている可能性。落ちる候補=pickKokenStorageRows(resolver:61)の liveId 不一致 or rows が空 or 2行が
  貢献者でなく別物。これは storage の実値を runtime で見ないと断定できない(静的に決められない)。

## 修正方針(安全な範囲)
1. 対称化(確実): 貢献度も kokenApiRows を取得して determineNorthStarLaneState に渡す(広告と対称)。
   storage key = kokenContribStorageKey(lid)。state が正確になる。
2. opt-in(別途検討): autoOpen が never なのは opt-in OFF。だが Koken API は opt-in 無関係に動くので、
   貢献度は autoOpen 不要(API で取れるはず)。autoOpen は DOM scrape 経路の補助。opt-in を既定ONにするかは UX 判断。
3. 不確実な #2(Koken 2行が落ちる)は、対称化後に実機で「state が iframe_unrendered/ok どちらになるか」「Koken storage の実 rows」を
   確認してから(憶測で resolver を触らない)。

## 制約(星野ロミ式)
記録本体不可侵・対称化は安全(広告と同じ)・不確実な resolver 改変は実機 runtime 確認後・憶測で直さない。

---

## 🔬 2026-06-20 実機 runtime 確認(lv350792705・前面タブ・状態速報2回)で確定したこと

### content 側は完全に健全(誤報なし)
- `externalFetchProbe.kokenLastRows:13`(kokenSent:7/leaderRan:7・ok・200)=Koken API は13行を**安定して**取得。
- `nicoadLastRows:10`(ok・200)=広告も10行取得。
- 書込ガード(content-entry.js:13889 `rows.length>0`・13894 `curLid===lid`)を通過 → `nls_koken_api_contrib_lv350792705` に13行が `{rows, capturedAt, liveId:'lv350792705'}` で書かれている(liveIdAlignedWithUrl:true)。
- **`北極星レーン.1_貢献度ランキング.state:"ok"` は正しい**。content-entry.js:6074-6085 が **v0.1.621 で既に `kokenApiRows`(=_externalFetchProbe.kokenLastRowsArr)を `determineNorthStarLaneState` に渡している**ので、state:ok は「Koken に13行ある」を正しく反映している。`count:0` は `len(b.contributionRanking)`=DOM bundle 長(別フィールド・常にDOM由来・autoOpen未発火で0=想定内)。**→ "確実なバグ(対称性の崩れ)" として上で書いた『貢献度の state 判定に kokenApiRows を渡し忘れ』は誤り。content 側は両方(koken+nicoad)渡している。handoff の「no-op だった」も同じ結論。この行は撤回。**

### 真因は popup 側の描画にあるが、popup probe が取れていない
- 状態速報の top 行 "貢献度:空"(statusFormat.js:227)= content の `北極星レーン.1_貢献度ランキング` を見て `state==='ok' && count===0` → "空"。**この "空" は『DOM bundle が0』を意味するだけで、Koken の13行がレーンに描かれているかは語っていない**(statusFormat は count=DOM長しか見ない=Koken storage を見ていない)。→ **"空" 表記自体が誤誘導**(state:ok の意味=Koken取得済 を反映していない)。
- 健全度パネル(healthCells.js:141)は `northStarLevel(lane.state)` で `state:"ok"→緑OK`。**∴ 健全度パネルの貢献度セルは "OK" 緑で出ているはず**(top 行 "空" と健全度パネル "OK" が食い違う=表示の二枚舌)。
- **popup の `northStarRenderProbe` が runtime で取れていない**: 状態速報2回とも `exportedAt:10:42:09` の同一スナップ(`refreshAllStarted:0 / contribResolveCalls:0 / lastContribResolveRows:-1` 全部初期値)。これは popup を開いた直後の埋め込みコピーで、**描画連鎖が走る前**の可能性が高い(=バグの証拠にならない)。popup を開いて数秒待った fresh コピーが要る。

### 次の一手(確度を上げる)
1. **popup を開いて5〜10秒後**の `northStarRenderProbe` を取る(または MCP で拡張 popup ページを直接 eval)。見るのは:
   - `refreshAllStarted`>0 か(描画連鎖が起動するか)
   - `lastReachedLane`(`done` まで到達するか・途中 `after_gift_sync`/`after_contrib` で止まるか)
   - `lastContribResolveRows`(13 になるか・0 か)→ 13 なら resolver は読めている=描画の下流の問題 / 0 なら storage 読みで断線。
   - `lastError`(throw しているか)
2. **表示の二枚舌の是正**(安全・別件)= statusFormat の "空" 判定が Koken の有無を反映しない件。`count` が DOM長しか見ないので、Koken取得済(state:ok)なのに "空" と出る。健全度パネル(OK)と食い違う。ただしこれは「レーンが本当に出ているか」とは別問題=popup probe を取ってから優先度判断。
3. **憶測で resolver/トリガーを触らない。** popup probe が「描画が走っていない(A)」か「走るが空(B)」か「走って13読めている(C)=実は出ている?」を割ってから。
