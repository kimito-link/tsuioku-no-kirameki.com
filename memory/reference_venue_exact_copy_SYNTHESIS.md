# 設計正本: 会場=①POP「アイコン列・グリッド・診断」完全一致コピペ(ローディング全面禁止)

> 設計=Fable(claude-fable-5) / 素材=会議ハーネス6体+Explore実地調査 / 裏取り=司令塔Claude(実在確認済み) / 2026-07-11
> 3段構えワークフロー(会議→Fable設計→実装引き継ぎ)の手順2の産物。実装ハンドオフ=HANDOFF-venue-exact-copy-IMPL.md

## 裁定の要旨(最重要)

- **会議は全員E案(①hostをCSS全画面化=同一物)を推した**が、**却下**。前科(council/venue-lever-iframe-SYNTHESIS.md 2026-06-22・実機失敗)の3障壁が今も実在:
  (a) ①iframeは chrome-extension:// **別オリジン**=吹き出し/ギフト投げ/席演出が使う seatAnchorEl rect を親から取れない
  (b) 会場固有UI(参加者バー・フェーズメーター・コメビュ・群衆Canvas・ロビー)はiframe内に挿入不可=結局2層合成
  (c) ①POPはレーン以外も含む1枚のアプリ=全画面化にはpopup内に会場専用モード新設が要り変更面がむしろ大きい
- **「完全一致」の定義(本設計の憲法)**: ピクセル同一でもDOM同一でもなく、**「①がpaintに使った入力そのもの(鏡)を、①と同じ純関数に食わせ、キー列・件数・順序・文言が機械照合で等値」**。時間軸は「N秒前の①」であることを正直に表示。E案の利点(定義上の一致)を座標問題ゼロで得る。
- **重要発見(司令塔実読で確定)**: HANDOFF-venue-pop-copy-IMPL.md の「グリッドは鏡に無い=新storageキー要」は**取り違え**。src/lib/userThumbGrid.js はHTMLレポート/marketing専用で①実画面に存在しない。ユーザーが見ている「匿名166人のグリッド」=**たぬ姉段のタイル折返し+フッター**であり、鏡(KEY_LANE_MIRROR の tanu cap200 + pickedLength + totalCandidates)で**既に運ばれている**。足りないのはフッター文言と数字だけ。

## 設計本文(Fable出力・A〜G)

### A. 理想の体験フロー

1. ①POPは今まで通り5段レーン+匿名identiconグリッド(=たぬ姉段)+フッター「いま166件を表示中」+「詳しい状況(開発・切り分け用)」を描く。描いた瞬間の入力データが鏡バンドル(既存3秒flush)に載る。
2. 会場を開く。iframe/hostは一切動かない(P1のvisibility遮蔽のみ)。会場は開いた瞬間に手元の鏡(catch-up read 1回・venueBar.js:4706)から即paint。**ローディング幕・スピナー・空白はどの経路にも存在しない**。鏡未着なら前回描画かfallback即描画。
3. 会場に出るもの=①と同じ順序・件数・顔・フッター文言のレーン+グリッド、その下に「①の診断(N秒前の鏡)」として①の診断パネルが①と同一の純関数出力で出る。
4. 会場一致トークンは「✅ mirror 鏡3s前 全段等値 DOM一致 未説明0」。ズレは「🔴 tanu:DOM欠2 [キー2例]」と犯人名指し。「未説明」で終わる報告を物理的に不可能にする。

### B. 統合アーキ(全部既存の延長・新規コンポーネントゼロ)

```
[①書き手 popup-entry.js]
  publishLaneMirror(既存・cap200)──┐
  publishStoryDiagMirror(★新設)──┤→ [運び屋 mirrorBundleFlushScheduler.js(既存)]
                                   │   min-gap 3000ms・1回のstorage.local.set(同一tick)
                                   ↓
  KEY_LANE_MIRROR(既存) + KEY_STORY_DIAG_MIRROR(★新キー・~0.6KB)
                                   ↓ onChanged newValue直採用(既存handleStorageChange・追加readゼロ)
[③読み手 venueBar.js]
  レーン+グリッド: restoreLaneMirrorBuckets→composeVenueLaneBuckets→paintStoryUserLaneDomFilled(既存)
                   +フッター: snap.pickedLength/snap.totalCandidates で①と同数(★変更)
  診断: buildStoryAvatarDiagHtml/VerboseHtml(既存純関数)を会場パネルへ(★新設・約30行)
                                   ↓
[検察 venueLaneParity.js + venueDomCensus.js(既存)]
  3点一致(鏡=データ=実DOM)。★席detach素通し修正で「DOM欠」型未説明の構造源を閉じる
```

### C. 具体機構

**C-1. グリッドは鏡に既にある(新大容量キー不要)** — 上記「重要発見」参照。匿名の顔は restoreLaneMirrorBuckets が anonymousIdenticonDataUrl(uid,64) で再生成=P3/B-1で①とバイト一致実証済み。

**C-2. Patch A(MVP): ①診断パネルの構造化データ鏡**
- 新キー: `KEY_STORY_DIAG_MIRROR = 'nls_story_diag_mirror_v1'`(新設 src/lib/storyDiagMirrorKey.js)
- 中身: STORY_AVATAR_DIAG_STATE(popup-entry.js:6220・数値26個+短文字列2個)+liveId+capturedAt。~0.6KB。R-1完全遵守(数値のみ・HTMLは読み手が①と同じ純関数でローカル生成)。
- 書き手: popup-entry.js renderStoryAvatarDiag()(:7456)末尾に mergeAndScheduleFlush('storyDiag', {...}, liveId, now)。**書き込みイベント増=ゼロ**(既存バンドルflushの同一setに同乗)。INLINE_PASSIVE ガードは他publisherと同じ。
- 配線: src/lib/mirrorBundle.js のセクションキー+mirrorBundleFlushScheduler.js の SECTION_TO_LEGACY_KEY に追加(既存wiringテスト網に入る)。
- 読み手(会場): venueBar.js — 開時catch-up(:4706)の get を [KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR] に(read回数不変)/ handleStorageChange(:5003近傍)に newValue直採用1ブロック / 段stack下(ロビー上)に nlsb-story-diag div、paintは buildStoryAvatarDiagHtml(snap)+VerboseHtml(storyAvatarDiagLine.js の純関数=①と同一出力)。ヘッダ「①の診断(◯秒前)」を会場側で1行だけ足す。sig比較diff-skip(popupの storyAvatarDiagLastRenderSig :7462-7474 方式)でchurnゼロ。
- liveId不一致 or 未着: 非表示 or 前回保持+静的テキスト1行「①と同期待ち」。スピナー/アニメ禁止。
- 計器: venueSeatsDiag に storyDiagMirror:{present,ageSec} を2フィールド追加し、**statusFastDiagLite の passthrough に必ず通す**(地雷メモリ fastdiag-lite-is-the-printer-subset)+wiring断言。

**C-3. Patch B: グリッド+フッターの完全一致**
- venueBar.js:4235 の paintStoryUserLaneDomFilled 呼び出しで、mirrorモード時のみ recordedCommentRowsTotal/totalCandidates を seating.participantCount から **lanePaintSnap.pickedLength/.totalCandidates(=①の数)** へ差し替え。fallback時は従来値+guides:false のまま(①の数を騙らない)。
- guides を定数 `VENUE_LANE_GUIDES_EXACT_COPY = true`(mirrorモード時)で制御=①のキャラ案内帯・空段ノート・フッターが①とバイト同一HTMLで出る。
- **⚠ v0.1.1120(会場のガイド帯除去・ユーザー承認済み)を意図的に覆す**。フラグ1行でロールバック可。実機レビューで「案内帯は不要・フッターだけ」となったら renderStoryUserLaneDom.js:352 の showGuides を2変数に割る後送(opts.foot 新設)。
- guide要素CSSが LANE_CSS_SYNC 区間(venueBar.js:971〜)に同期済みか snapshot テストで確認。

**C-4. Patch C: 未説明の構造源を閉じる**
- mirrorモードでは painted=鏡の逐語コピー=プレフィックス不一致は構造上起き得ない。残る発生源は「実DOM census と painted の乖離」。
- **具体的な穴(司令塔実読で実在確認)**: venueBar.js:4194-4198 が visibleSeatIndexSet 外の席を removeChild で外し node.tile=null。その後の paint で wrapTileEl(:4248-4259)が鏡セルのタイルを **detach済みの席に入れる**と「paintedに居るがDOMに無い」=census DOM欠=未説明として計上。
- 修正: wrapTileEl 冒頭に `if (!node || !node.seat.isConnected) return tileEl;`(タイルは席ラップ無しで段に直接出る=①と同じ見え方・census一致)。1行+characterizationテスト。
- **検証先行**: 断定しない。Patch A/B 反映後の実配信で unexplained.sampleKeys と dom.strays/missing を1枚読み、DOM欠型ならこの修正、別型ならそのキー実物で追う。

**C-5. ローディング全面禁止の機構**
- host/iframe: Patch A〜C は host の style/class/位置に一切触れない=iframeリロード誘発ゼロは構造的保証。
- レーン: 開時catch-up→即paint(既存)。空の谷間は shouldKeepStoryUserLaneTilesOnEmpty+縮小ガード(renderStoryUserLaneDom.js:98-118)が前回描画を守る(不触)。
- 診断パネル: 未着=非表示 or 前回保持+静的1行。spinner/skeleton/opacityアニメを一切実装しない。
- 追加ガード: venueBar.js に loading|spinner|skeleton 文字列が増えていないことを断言する軽テストを Patch A に同梱。

### D. 偽陽性潰し

1. **2つの診断を混ぜない**: (i)「①の診断パネル」=①の数字の転写(会場は1文字も計算しない・ヘッダで出所と鮮度を常時明示) (ii)「会場一致トークン」=Tri-Parity(会場自身の検察)。(i)を(ii)の材料にする循環を禁止。
2. ✅条件は既存のまま(mirror ∧ 同一配信 ∧ 鏡新鮮 ∧ 全段完全等値 ∧ lobbyInMirror=0 ∧ census一致 ∧ 未説明0)。Patch C は条件を緩めず発生源を消す方向のみ。未説明が残る場合 sampleKeys 実物が必ず1行に出る。
3. フッター数字は「①が書いた pickedLength/totalCandidates をそのまま印字」=定義上一致。fallback では①の数字を名乗らない。
4. 診断パネルは liveId≠会場liveId なら非表示。age>180s(VENUE_LANE_MIRROR_SOFT_WINDOW_MS 同値)なら「①と同期待ち」併記。

### E. MVP = Patch A(診断パネル鏡)

レーン=達成済み・グリッド=実質達成済み(フッターのみ欠け)で、「会場に無いもの」は診断パネルだけ。純追加(書き込み頻度増ゼロ・read増ゼロ)=退行面ほぼゼロ・最速で可視成果。
- 変更: src/lib/storyDiagMirrorKey.js(新設)/ src/lib/mirrorBundle.js / src/lib/mirrorBundleFlushScheduler.js / src/extension/popup-entry.js(1行) / src/extension/venueBar.js(read+パネル~30行) / wiring・lite passthrough テスト。
- ロールバック: セクションとパネルdivを消すだけ(独立revert)。
- 続編: Patch B(フッター・1行+フラグ)→実機の状態速報1枚→Patch C(未説明根治)。

### F. 捨てた案と理由

1. **E案(CSS全画面化)**: 会議全員一致だが却下(冒頭の裁定)。「一致の定義」だけ採用し「実現手段」を却下。
2. 部分E案(レーンだけiframe): 吹き出し/ギフトの発射起点がタイル=別オリジン問題が再発。却下。
3. B案(cloneNode): iframe中身は複製不能。即死。
4. C案(二重iframe): passiveなら安全だが現行会場と等価+リロードリスクとメモリ増だけ。却下。
5. DOMシリアライズ/HTML同梱: R-1違反・既却下(web-mirror-parity)。再却下。
6. 診断案(b)(Tri-Parityを①の見た目に寄せる)=数字の出所が違う嘘の温床/(c)(等価計器で説明)=現状=不信の原因。案(a)構造化データ鏡一択。
7. グリッド用の新大容量鏡キー: 不要と判明(C-1)。輻輳教訓に照らしても作らないのが正。

### G. 地雷と回避策

| # | 地雷 | 回避 |
|---|---|---|
| 1 | 新計器がliteに出ない(v1124実踏) | venueSeatsDiag追加フィールドをstatusFastDiagLite passthrough+wiring断言をPatch Aに同梱 |
| 2 | mirrorBundleセクション配線忘れ | SECTION_TO_LEGACY_KEY/mirrorBundle.jsの既存wiringテスト網+verify:cc一本 |
| 3 | guides復活がv0.1.1120承認と衝突 | フラグ1つ・push報告に「意図的に覆す・レビュー乞う」明記・1行revert |
| 4 | 匿名>200と鏡cap | フッターはpickedLength/totalCandidates印字=①と同数。limit変更時は鏡capとセット(lane-limit-200) |
| 5 | 診断HTMLを鏡に載せる | R-1: 鏡は数値のみ。HTMLは読み手側で純関数生成 |
| 6 | パネルchurn(ちらつき7版の轍) | sig比較diff-skip転用。innerHTMLはsig変化時のみ |
| 7 | wrapTileEl修正でアンカー消失 | 素通しは「席detach済み=既に演出無効」のタイルのみ。characterization+実配信で吹き出し目視1回 |
| 8 | 書き込み輻輳再発 | 新規書き込みイベントゼロ(既存flush同乗・+0.6KB)。LIVEVIEW_PUBLISH系不触 |
| 9 | display:none/host移設(ちかちか) | host不触。遮蔽は既存P1(visibility)のまま。360ms tickと非干渉 |
| 10 | 検証エージェント並走中commit | reality-checker実行中はcommit禁止・直後にgit show HEADで核心確認 |

## 司令塔の裏取り記録(2026-07-11)

- userThumbGrid の使用箇所=report/marketing系のみ(5ファイル・popup実画面に無し) ✅
- STORY_AVATAR_DIAG_STATE popup-entry.js:6220 / renderStoryAvatarDiag :7456 / buildStoryAvatarDiagHtml import :768 ✅
- mirrorBundleFlushScheduler.js の SECTION_TO_LEGACY_KEY / mergeAndScheduleFlush(popup-entry使用) ✅
- laneMirror.js に pickedLength/totalCandidates(9箇所) ✅
- venueBar.js:4194-4198 の visibleSeatIndexSet外 removeChild+node.tile=null(C-4の穴) ✅
