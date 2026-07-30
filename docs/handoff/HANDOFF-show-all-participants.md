# 引き継ぎ: 応援レーン/会場を「全参加者表示」にする（ユーザー確定要望）

_作成: 2026-07-03 / 司令塔Claude(Opus 4.8) / Fable設計完了・実装待ち_

## ユーザー確定要望
応援レーン(popup)も会場も、参加した人を**全員表示したい**。今は popup が limit=48(INLINE)/24 で絞られていて不本意。この上限を撤廃し churn・重さを起こさず全員出す。

## ★Fableが実コードで証明した核心（直感の訂正）
1. 【48撤廃で計算は重くならない】候補組み立て(集約・候補化・sort)は limit と無関係に既に毎paint全件走査(popup-entry.js:5153-5235)。limit=48 が絞るのは最後の bucketStoryUserLanePicks(candidates, limit)(:5246)だけ。bucketStoryUserLanePicks は O(N)線形(storyUserLaneBuckets.js:10-22)。
2. 【48の根拠は不文律】git log -L でこの行の性能根拠コミット無し。ただし council/lane-show-all-active-SYNTHESIS.md(2026-06-22)で一度「popup 48+ほかM人・会場だけ全員」と決めていた=今回はこれを覆す。旧方針コメント(popup-entry.js:5289, laneDiag.js:5-7)の更新も実装範囲。
3. 【diff-skip は全員でも効く】storyLaneTierBodyKey(renderStoryUserLaneDom.js:113-126)は確定フィールドのみ連結・ソート(storyUserLaneSort.js:22-41)も決定的順序。参加者集合が動かない限り500件でもDOM無タッチ。churn≠全員表示。
4. 【会場が500タイルを実証済み】venueBar.js が seatsHost overflow-y 縦スクロールで数百席の実績=「500タイルDOMは成立する」。

## 唯一の実ボトルネック候補（計器で測ってから判断）
key が変わる契機3つ: (a)新規参加者の出現=backfill中は毎poll新顔→段全体replaceChildren (b)アバター解決でdisplaySrc/thumbScoreが変わり並び順が動く=1人の解決で段貼り替え (c)gift/ad picks 2回目描画(v1042で配信切替時のみリセット化済=安全)。→ (a)(b)がbackfill中に多発するか laneRepaintCounts の増分カーブで確認。

## 設計（Fable・段階リリース）
### Phase0: 計器先行(コード変更ほぼゼロ)
renderStoryUserLane の heavy paint 所要ms(performance.now差分)と candidates.length を publishLaneDiag スナップショットに追加(laneDiag.js 型 + popup-entry.js:5310 の既存3秒min-gap に相乗り=v1045地雷回避)。現状値(更新所要7ms・repaint りんく0/たぬ姉2)をベースライン記録。

### Phase1: limit を 48→200(一段階)+ INLINE スクロール枠 CSS
- popup-entry.js:5113 の1行 + popup.html の CSS 1ブロックのみ。ロジック・描画関数は不変。
- INLINE(映像圧力)は popup.html 885-888 の max-height:none を「縦スクロール枠(max-height:XXvh + overflow-y:auto)」へ(会場 seatsHost と同型)。描画データは3面同一・器の高さだけCSSで違える。
- 機械判定(実機で大きめ配信1本): laneRepaintCounts の毎分増分がbackfill完了後≈0へ収束(収束しない=key不安定=churn回帰・疑う先は消す側) / 更新所要が2桁ms台 / heavyRaceReturns増えない / laneDiag: laneShown==min(identified,limit)整合(嘘の件数出さない)。

### Phase2: limit = VENUE_FULLSCREEN_MAX_SEATS(=500・venueSeats.js:39 を popup も import 共有)
- 3面で同じ上限・同じ言葉。超過分は既存「ほかM人」フッター(storyUserLaneGuideHtml.js:81・totalCandidates経由・配線済)が吸収。文言「会場モードで全員見られます」→「うちN人を表示中」系に更新。
- Phase1計測で「backfill中の repaint 毎poll×paint 20ms超」が出た時【のみ】§2-b キー付き再利用を実装(出なければ過剰実装回避):
  - fillLaneTier(renderStoryUserLaneDom.js:216-245)で tileEl.dataset.nlKey=1件分フィールド連結を付与(personTileDom.js は不触=タイル正本バイト不変ガード遵守)。既存childrenをnlKeyでMap化→新items順に同key既存ノード再利用・無ければ新規→replaceChildren。既存ノード移動はimg破棄しない=v1039の核(img温存)が集合変化pollでも保たれる。
  - ★会場の wrapTileEl は「タイル→席移設」なので再利用時に再適用しない分岐が要る。キー付き再利用は popup(wrapTileEl無し)限定で入れ、wrapTileEl あり時は従来パスに落とす(最小ブラスト半径)。

### Phase3(任意): 鏡 cap 引き上げ
publishLaneMirror の cap:48(popup-entry.js:5734)を500へ。laneMirror.js:90-96 に512KB超過時cap半減の自衛あり。storage書込が百KB級になるので popup/会場の全員化を実測してから。

## 地雷マップ
- 応援レーンは「ちらつき7版(v1037-1042)」の超神経質領域。[[story-userlane-churn-filllanetier-v1039]]=churn見たらまず「消す/空にする側」を疑え。diff-skip機構(_laneTierLastKey WeakMap・renderStoryUserLaneDom.js:60/181-184/414-417)と shouldKeepStoryUserLaneTilesOnEmpty(96-105)は【一切触らない】。今回の変更に「消す側」の変更を含めない。
- 診断を重くしない[[status-extras-read-not-core-read]]: 計器は既存publish(3秒min-gap)に値を足すだけ・新規storage readをコアに足さない。
- content-visibility:auto は Phase2候補だが【会場(3D変形あり)には絶対当てない】(personTileDom.js:87-90=3D変形でlazy判定が崩れサムネ出ない実績)。popup限定・実機確認付き。
- 母集合の既知の差異(仕様として明記・無理に揃えない): popup は配信者ID未確定時に数値ID候補を落とす(popup-entry.js:5166)+contamination guard(5188-5196)。会場は落とさない(venueLaneBuckets.js:13-15)。数人ズレは意図的差としてlaneDiag/venueSeatsDiagの数字で説明可能に。
- gift/ad列の giftLimit=INLINE?24:16(popup-entry.js:6081)は今回スコープ外(別データ源)。据え置き明記。

## ロールバック
全Phaseが「上限値1つ+CSS」に局所化。回帰時は limit の数値を戻すだけで v1042 挙動に完全復帰。

## 実装役が最初に開く座標
- popup-entry.js:5113(limit本体)/5246/5291-5293/5310(laneDiag)/5734(鏡cap)/6081(giftLimit=対象外確認)/5166,5188-5196(数値ID/contamination guard)/5289(旧方針コメント)
- renderStoryUserLaneDom.js:216-245(fillLaneTier=キー付き再利用位置)/60/113-126
- popup.html 864-889(.nl-story-userlane CSS・html.nl-inline 上書き)
- venueSeats.js:39(VENUE_FULLSCREEN_MAX_SEATS 共有)/laneDiag.js:5-7(旧方針コメント)
- council/lane-show-all-active-SYNTHESIS.md(覆される旧決定)

## 未確定点(実機で測るまで断定しない)
1. 500タイル1段のreplaceChildren+flex-wrapレイアウト実コスト(机上10-30ms)→Phase0のpaint ms計器で確定。
2. backfill中のrepaint頻度(集合成長中はbodyKey毎poll変化)→laneRepaintCounts増分カーブ。
3. thumbScore/displaySrc解決による並び替え頻度→多発なら「解決済みかで並びを変えない」ソート変更検討(popup/会場共有ソートなので顔ぶれdrift注意)。
4. 実httpアバターのプローブburst実数(supportGrowthAvatarLoad.js上限なし)→問題化時のみ同時数キャップ。
5. INLINEスクロール枠UX(映像との高さ配分)→CSS値は実機で。
6. content-visibility の popup副作用(会場には当てない)。

## 関連
このタスクは [HANDOFF-venue-equals-lane.md] の「会場をレーン段組みに統一(3段・Codex実装・未コミット)」の続き。会場3段統一が土台。両方の完成形が「3表示とも全参加者を同じ段組みで表示」。
