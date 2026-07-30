# 引き継ぎ: 会場＝応援レーン＝別窓を「完全に同じ」にする（ユーザーの核心要望）

_作成: 2026-07-03 / 司令塔Claude(Opus 4.8) / 調査+会議+Fable設計 完了・実装待ち_

## ★★ 実装役へ: まず Phase0(コード変更なしの実機確認)から。設計は下記「Fable設計」節が正本。

## ★Fable設計(2026-07-03・実コード裏取り済み・会議の前提を3点覆した)
### 会議の前提を覆した発見
1. 【穴1は誤り】レーンのタイルは固定サイズのピル型(avatar 32/38px・flex-grow無し・popup.html:892-903,966-988)。全画面でも正方形は崩れない。会議が言った grid+aspect-ratio は逆効果(タイルが1frで伸びて popup と割れる)。→ 正解は「popup と同じ flex-wrap 維持・寸法だけCSSカスタムプロパティ化(--nl-lane-avatar-size 等)」。
2. 【穴3も原理的に安全】吹き出し(venueBar.js:2426 positionBubble)・ギフト投げ(:2269)は描画時に毎回 getBoundingClientRect で測る=レイアウト非依存。ひな壇→平坦でも .nlsb-seat ラッパーを維持する限り座標はずれない。
3. paintStoryUserLaneDomFilled は既に popup 非依存で status/live-view が再利用済み(3例目)。buildPersonTileEl は「1バイトも変えない」凍結=人物→DOM逆引きは .nlsb-seat ラッパー(dataset.seatIndex)が唯一の合法な足場。

### 採用案 = 「B改」(A も 素のB も不採用)
- A(既存DOMの3D CSSだけ消す)=ゴール未達(カテゴリ段/ガイド/空段ノートが無い)。素のB(丸ごと差し替え)=seatNodes/seatByKey が孤児化し吹き出し/ギフト/順位バッジ/発話光/streak が全滅。
- 【B改】共有レンダラ paintStoryUserLaneDomFilled を会場でも呼ぶ。ただし renderStoryUserLaneDom.js に後方互換の注入点 opts.wrapTileEl を1つだけ足す。会場は buildPersonTileEl タイルの外側に従来の .nlsb-seat ラッパー(seatNodesプール)を被せて描く→全演出と座標系がコード変更ほぼゼロで生存。
- gpt-oss の segmentLayout.js/renderLaneDom.js 新設は過剰分割で却下。新規lib は「会場用段分類 venueLaneBuckets.js」1個＋「ソート比較器 storyUserLaneSort.js 抽出(popup も差し替え=並び一致の機械保証)」だけ。
- src/lib/venueSeats.js(venueParticipantKey/rankVenueParticipants/assignVenueSeats/buildVenueSeating)は Phase1 で1バイトも触らない。

### renderStoryUserLaneDom.js への変更(2点・後方互換)
1. fillLaneTier(el,items,io) → (el,items,io,wrapTileEl?)。指定時 frag.appendChild(wrapTileEl(buildPersonTileEl(p,io),p,i))。paintStoryUserLaneDomFilled の opts に wrapTileEl 素通し。popup/status/live-view は未指定=不変(既存 characterization test がガード)。diff-skip の storyLaneTierBodyKey は item 由来のみなので影響なし。ただし key一致温存時はラッパーも残る→会場の演出クラス(speaking/streak/rank)は paint後の装飾パスで毎回上書き(現行 renderSeats と同型)。
2. laneNameOfEl(:71) を「el.id 正規表現→ダメなら dataset.laneName」に1行拡張(計器のみ・会場の段elにdata-lane-name付与)。

### renderSeats(venueBar.js:2676-2959)の書き換え範囲
- 残す(不変): 保険ガード:2680 / buildVenueSeating:2683 / renderTopBar:2694 / --nlsb-venue-max-h:2700 / 群衆Canvas:2776-2796 / ほかN人:2772 / 診断publish:2935-2958 / repositionAllBubbles:2916。
- 差し替え: :2812-2908 の「buildVenueTiers→tierNodes 3D注入→tier充填」を、(1)venueLaneBuckets で buckets作成 (2)各段に selectStableVisibleMembers を段単位適用 (3)paintStoryUserLaneDomFilled を1回呼ぶ、に置換。wrapTileEl=venueSeatWrap は uid→seating.seatByKey→seatNodes[seatIndex].seat にtile入れ、装飾(:2871-2906 vip/rank/streak/title)を上書き。
- CSS: VENUE_CSS から perspective/transform-style(:776-779)・.nlsb-tier transform(:785-801)・mode別gap(:805-818)を削除。popup.html:829-1067 のレーンCSSを /* LANE_CSS_SYNC_BEGIN/END */ マーカー付きで複製(§6 同期テストで drift 防衛)。

### 穴2(満員感)の代替
- 群衆Canvas は無改造維持(:2776-2796・visibleSeats独立)。z: crowdCanvas を段組みの背面 z:0、段組み z:1。
- タイル登場アニメ: 「静けさ重視・ピカピカなし(2026-07-01会議)」との線引き=【状態を持つ脈動は禁止・イベント1回きりの入場だけ許可】。新規keyのseatに nlsb-seat-enter(opacity0→1+translateY6px→0+scale0.96→1・220ms ease-out・1回・発光なし)、animationend で除去。prefers-reduced-motion で animation:none。diff-skip温存時はDOM不変=再発火しない=静けさを守る。

### visibleSeats の inline/別窓分岐(renderSeats の cap算出 :2709-2736 一箇所)
- isStandalone は mountVenueBarButton の閉包(:1430)に既存=参照するだけ(新フラグ不要)。
- inline: rowsBudget=映像圧力(35-72vh)内の段数+少しの余地。resolveVisibleArenaCount で visibleTotal算出→たぬ姉段から削る配分→段単位 selectStableVisibleMembers(直近発言者は必ず出す)。間引きは「ほかN人」へ。
- 別窓: visibleTotal=min(total,500)=間引き実質無効。--nlsb-venue-max-h を standalone専用値に、overflow-y スクロールで全員。selectStableVisibleMembers は cap≧total なら slice=無害でコードパス1本。

### 段階リリース
- Phase0(コード変更なし): watch で会場開き DevTools で `.nlsb-tier` の transform='none' + `.nlsb-seats` perspective='none' にして、吹き出しがアバター頭上に出るか・ギフト起点がアバター中心か・スクロール時・別窓でも、を目視。=穴3を実装前に実測クローズ。ずれたら修正点は positionBubble/giftThrowOriginForSpeaker のアンカー解決だけ。
- ✅ completed 2026-07-03: ユーザー手元の DevTools で `.nlsb-tier` / `.nlsb-seats` へ3D無効化が当たり `{ tiers: 8, seatsHosts: 1, seats: 500 }` を確認。Codex側Chrome制御は watch ページ安全ポリシーで直接目視不可のため、ユーザー承認で Phase1 へ進行。
- Phase1: 3D廃止+段組みDOM統一+inline/別窓分岐。着地=popup とスクショ比較で同一構成・3D消滅・吹き出し/ギフト正常・inline映像覆わない・別窓スクロールで全員・演出全生存・npm run verify緑。
- ✅ completed 2026-07-03: `renderStoryUserLaneDom` に後方互換 `wrapTileEl` 注入点を追加し、会場は `.nlsb-seat` ラッパーを維持したまま `paintStoryUserLaneDomFilled` で5段表示へ統一。`buildVenueTiers` / 3D CSS は venueBar から撤去。
- Phase2: ギフト/広告picks・ソート比較器の lib正本化=集合一致をテスト固定(同一fixtureで popup経路と venue経路の各段 userId集合と並びが一致)。
- Phase3: 登場アニメ+群衆Canvas再配置+密度チューニング。

### 未確定点(実機確認要・実装役への申し送り)
1. 座標系の実測(Phase0)=理論上安全だが必ず先に。
2. ★数値ID候補の扱い=要ユーザー確認: popup は配信者ID未確定時に数値ID候補を落とす(popup-entry.js:5165)が会場は全員着席が哲学。厳密一致を取ると会場が痩せる。推奨=会場は落とさない維持+差分を設計コメント明示。
3. ギフト段の viewer除外の極小差=Phase2で lib一本化。
4. crowdCanvas の DOM位置と z重なり(:1608周辺で確認)。
5. 全画面での1行の長さ・密度、standalone の --nlsb-venue-max-h 拡大値。
6. getStoryLaneRepaintCounts 計器が会場contextでも動くか確認。

### 実装役が最初に開く座標
- venueBar.js:2676(renderSeats)/2812-2908(差し替え対象)/1608-1636(seatsHost/tierNodes/seatNodesプール)/1399(seatAnchorEl)/2269,2426(座標)/3049-3060(broadcaster guard)/247,748-840(VENUE_CSS)
- renderStoryUserLaneDom.js:211(fillLaneTier=wrapTileEl注入)/249(paintStoryUserLaneDomFilled)
- popup-entry.js:5243-5262(ソート比較器・bucket)/5951(Phase2のギフトpicks)/6070-6114(ギフト/広告のstorageキーとlib部品)
- popup.html:829-1067(複製するレーンCSS正本)/11562-11677(会場で組むels骨格の見本)
- venueViewport.js:90,133(間引き純関数)/storyUserLaneBuckets.js:10/storyUserLaneRowModel.js:72/supportGridDisplayTier.js:117

---

## ユーザーの要望（そのまま）
「別窓の会場も、本来の（inline の）会場も、応援レーンも、**同じであるべき**。わざわざ説明させるな（＝3つが同じは当たり前）。会場は別窓化もできるので、それ前提で応援レーンと合わせればズレもない」。

= 新機能を作る話ではない。**同じであるべき3表示（①応援レーン=②会場inline=③会場別窓）がズレているならバグ。ズレを潰す**話。

## ★ユーザー確定（2026-07-03）: 「同じ」の意味 = 見た目もそっくり同じ（並び・レイアウトまで同じ）
- 会場のひな壇(SHOWROOM風の座席配置)ではなく、**応援レーンの段組み(りんく/ギフト/広告/こん太/たぬ姉が縦に並ぶ見た目)をそのまま会場でも出す**。
- データ・並び・レイアウトを1つに統一。3表示は完全に同じDOM構造の鏡。
- → 設計方針は【案C/Dのうち「会場のひな壇レイアウトを廃し、応援レーン段組みDOM(renderStoryUserLaneDom)を会場でも描く」】に確定。
  - 会場独自の visibleSeats 間引き・buildVenueTiers ひな壇・selectStableVisibleMembers は【廃止 or レーン側と共通化】する方向。
  - 会場が持っていた「背景群衆Canvas・吹き出し・読み上げ」等の演出をどうするか(レーン段組みの上に重ねるか/捨てるか)は会議で要検討(ユーザーは"見た目そっくり同じ"を望むので、まずレーン段組みに寄せ、演出は付加物として別途判断)。
- ★懸念(会議で潰す): 会場は全画面で大きい→レーン段組みをそのまま拡大すると間延び/密度不足の恐れ。逆にレーンは popup 幅前提のDOM。全画面でも破綻しない段組みの流用方法(幅・段数・スクロール)を設計する。

## 調査で判明した事実（実コードで裏取り）
- ★データ源は【既に同一】: 会場も応援レーンも `userLaneCandidatesFromStorage`(純関数)を入力にしている。venueBar.js:33-52 のコメントに「v0.1.789 レーンを鏡のように映すへ統一・popup と会場の顔ぶれは一致するのが正=鏡映設計」と明記。**ユーザーの案は過去のユーザー自身の指摘で採用済み**。
- ★ズレの真因は【会場だけが持つ表示間引き層(visibleSeats)】:
  - 会場は buildVenueSeating(venueSeats.js)で全論理席を作った後、
  - `resolveVisibleArenaCount`(画面幅×段数=perRow×8段で同時表示数を絞る・venueViewport.js)
  - `selectStableVisibleMembers`(表示メンバー選抜)
  - を通す。venueBar.js:2708-2727 付近。
  - 応援レーンはこの間引きをしない → だから見た目がズレる。状態速報の「応援レーン 表示48/素性58(他10は会場)」がこの間引きの実数。
- venueBar.js:52 自身が「popup と会場で誰を出すかがズレたら、それは描画/表示間引き(visibleSeats)層のバグ=ここ(データ源)ではない」と断言している。

## 設計の争点（次チャットで会議→Fable設計する）
「visibleSeats の間引きをどうするか」が核心。ただし間引きには理由がある(単純に外すと過去の地雷再発):
- 横スクロール根絶(ユーザー不満「位置ずれてスクロールバー出て見えない」)
- 映像セーフエリアを覆わない(上段 safe)
- 大規模配信(500人)で重くしない
- 席の安定(ちらつかない・selectStableVisibleMembers)

案の方向(未確定・会議で揉む):
- A: 別窓会場は画面が広い→間引きをほぼ無効化して全員出す(inline は映像があるので間引き維持)。ただし「3つが同じ」に反するので却下寄り。
- B: 応援レーン側にも会場と同じ間引きを入れて3表示を揃える(でもレーンは全員見せたい)。
- C: 間引きを「表示するかどうか」でなく「1画面に収める段組み/スクロール」で解決し、誰も間引かない(全員同じ集合を出す)。overflow-y スクロールで全員顔付き(既に venue-all-faces-500 で一部実装)。★本命候補。
- D: そもそも「同じ集合を出す」ことだけ保証し、レイアウト(ひな壇 vs 縦リスト)は各表示で変えてよい、とユーザーに確認。

## 地雷マップ
- 会場は神経質(2026-07-03 に「56年前」表示バグ修正 v1044・満席ロジック自体は正常)。
- 席割りの正本 venueSeats.js#venueParticipantKey(userId あれば匿名も着席)は触らない。
- visibleSeats を外す/緩めると横スクロール・映像はみ出し・重さの過去不満が再発しうる。会議で回帰を潰す。
- メモリ [[mirrors-written-per-key-per-tick-root-of-parity-lie]] [[parity-check-must-compare-values-not-just-ack]] = 3画面パリティの既知の穴。会場もこのパリティ思想に乗せる。

## 実装役が最初に読む座標
- src/extension/venueBar.js:33-52(鏡映設計の正本コメント)・2708-2727(visibleSeats 間引き)・1867-1868(lastRosterInput)
- src/lib/venueViewport.js(resolveVisibleArenaCount / selectStableVisibleMembers / seatsPerRow)
- src/lib/venueSeats.js(buildVenueSeating / venueParticipantKey / VENUE_FULLSCREEN_MAX_SEATS=500)
- src/lib/userLaneCandidatesFromStorage.js(3表示共通のデータ源)
- src/extension/venue-entry.js(別窓会場の entry)

## 進め方(backfill と同じ丁寧な流れ)
調査(済) → 会議(済) → Fable設計(次) → 実装(別モデル・別チャット)。

## ★会議結論(2026-07-03・qwen3-32b/gemma4/llama-3.3-70b/gpt-oss-120b・4体収束)
全員一致の核: 会場 renderSeats を renderStoryUserLaneDom(レーン段組み)に置き換え、ひな壇3D(buildVenueTiers)を廃止。inline/別窓が同じ venueBar.js を共用する利点で1箇所修正が両方に効く。データ源(userLaneCandidatesFromStorage)・タイル(buildPersonTileEl)は既に共通で無変更。

批判で出た【必ず潰す穴3つ】:
1. タイル比率崩壊(qwen3-32b): レーンDOMはpopup幅前提。全画面で flex のまま拡大すると正方形が崩れる→ grid + minmax(120px,1fr) + aspect-ratio でタイル固定。CSS カスタムプロパティ(--lane-width/--lane-columns/--lane-height)で幅・段数・サイズを動的化(gpt-oss 案)。
2. UX劣化=高揚感喪失(lead/gpt-oss/llama 全員): 3Dひな壇の満員感を失うと「ただの静的リスト」に→代替として背景群衆Canvas(満員感・z:0・既に残せる判定)＋タイル登場アニメ(フェードイン/軽スケールアップ=参加感)を早期(Phase1〜2)に入れる。
3. 座標系の再計算(lead/gpt-oss): 吹き出し・ギフト投げが seatAnchorEl(席位置)基準。ひな壇→平坦で「どの人の頭上か」の論理的再計算が要る→座標を検証してから演出を移植(Phase3)。

司令塔裁定(割れた点=visibleSeats を残すか廃止か):
- 【残すが inline/別窓で強度を変える】。inline=映像圧力(下端35vh制限)があるので間引き維持。別窓=overflow-yスクロールで全員(間引き実質無効・VENUE_FULLSCREEN_MAX_SEATS=500)。
- = 「3表示は同じ集合・同じレイアウト。収まり方(スクロールか間引きか)だけ画面に適応」が落とし所。ユーザーの"見た目そっくり同じ"は集合とレイアウトで満たし、収まりの差は画面制約として許容。

段階リリース(全員一致):
- Phase1: ひな壇3D除去→レーン段組みDOMに置換(3表示のDOM構造を平坦に統一)。まず「全員が平坦な段組みで並ぶ」を達成。
- Phase2: 満員感の代替(群衆Canvas密度＋タイル登場アニメ)。「静的リスト」批判を「演出が洗練された」に転換。
- Phase3: 演出(吹き出し・ギフト投げ)の座標を seatAnchorEl→段組みタイル位置ベースへ移植。

## 次(Fable設計)に渡す論点
- gpt-oss の共通lib化案(segmentLayout.js で --lane-* を生成 / renderLaneDom.js を3表示共用)の是非。過剰分割にならないか。
- Phase1 を「CSSだけで3D除去できるか(renderSeats のDOMは活かし transform を消すだけ)」vs「DOM生成を renderStoryUserLaneDom に丸ごと差し替え」のどちらが最小回帰か。
- inline の 35vh 制限下でレーン段組みが破綻しないか(段組みは縦に伸びる=映像を覆う危険)。inline だけ overflow-y スクロール枠に閉じ込める設計。
- 会議素材: council/venue-equals-lane-question.txt / -answers.json / -log.txt
