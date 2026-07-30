# 実装ハンドオフ: 会場=①POP丸写し(白円根治+①POP遮蔽+見た目①化)(v0.1.1115〜1119)

> この1枚だけで着手できる。設計正本=[memory/reference_venue_pop_copy_SYNTHESIS.md](memory/reference_venue_pop_copy_SYNTHESIS.md)(Fable設計・司令塔裏取り済み・2026-07-10)。
> 前提=v0.1.1114(Tri-Parity census+額縁廃止)実装済み・ブランチ feat/venue-lane-mirror-parity の続き。

## 背景(1分)
- ユーザー確定ゴール:「POPで出るアイコン列・グリッド・診断表示の丸写しを会場にコピーして反映」。実機症状=(a)会場の背景に①POPバナーが透けて邪魔 (b)りんく段/ロビー/トップバーに白円(blank.jpg)多発 (c)①と見た目が違う。
- 確定真因(Explore+Fable実読): 白円=venueLaneBuckets.js:53-55 が①の正本導出を使わず推測URLを直入れ(鏡経由セルは白くならない)/透け=①POPを隠すコード不在(setOpen:5014-5039)/見た目差=席装飾modifier CSS(席ラップ自体は無罪=positioning shell)。
- 重要認識: ①も数値ID未解決者は合成URL→404でtv-fallback様式。**404合成URLはパリティ上「正」**=P3後も残るのは仕様(「直ってない」と誤読しない)。

## スコープ(5patch・1変更=1bump・各patch独立revert可・MVP=P1+P2+P3)

| patch | 版 | 内容(詳細は正本§C) | 完了判定(機械的) |
|---|---|---|---|
| P1 | v0.1.1115 | ①POP遮蔽: VENUE_CSS末尾に `html.nlsb-venue-open #nls-inline-popup-host { visibility:hidden!important; pointer-events:none!important; }`(**display:none禁止**=鏡publish死守)。setOpen(venueBar.js:5014-5039)で documentElement クラス toggle(close+standalone pagehideで remove)。ホスト無し=no-op | setOpenでクラスtoggle・standalone no-opのテスト。実配信: open中 laneParity=mirror✅維持+鏡capturedAt前進(停滞なら即revert) |
| P2 | v0.1.1116 | 白円計器: venueDomCensus countSection に `img.nl-story-userlane-avatar` src が `/\/usericon\/defaults\//` なら blank+1・userKeyが`a:`なら blankAnon+1。venueSeatsDiag に venueAvatarLoadGuard.getDiagnostics()(supportGrowthAvatarLoad.js:175・実装済み未配線)の {usericonSucceeded,usericonFailed} 同乗。wiringテスト更新 | verify:cc緑・状態速報に blank/blankAnon/usericonFailed(ベースライン取得) |
| P3 | v0.1.1117 | 導出委譲: venueLaneBuckets.venueSeatEntryToLaneItem の displaySrc 自作(=白円の病根:43-88)を廃し buildStoryUserLaneCandidateRow(storyUserLaneRowModel.js:72)+resolveStoryLaneAvatarSrc へ委譲(pickCtxはopts注入・lib既定=①既定と同値)。buildVenuePersonTile(venueBar.js:368-383)も同関数経由の薄ラッパ化。**_venueIsVipは旧式据え置き**・deriveNicoUserIconUrlはVIP/roster用に残置・鏡経由セル不触 | 単体: 匿名a:→identicon・数値ID→①のniconicoDefaultUserIconUrlとバイト一致・_venueIsVip不変characterization。実配信: **blankAnon=0** |
| P4 | v0.1.1118 | 鏡enrich: 新規 src/lib/venueMirrorAvatarEnrich.js(laneMirrorPaintSnap→uid→displaySrcマップ・http(s)のみ)を commitDisplay 関所(venueBar.js:3791-3801)の enrich 後段に適用(score比較で強い方のみ上書き・冪等・新規readゼロ) | 単体: 上書き規則・冪等。実配信: 鏡在籍uidのロビー/トップバー blank=0・blank総数P2比減 |
| P5 | v0.1.1119 | 見た目①化CSS: 段配下のVIP金縁(:1356-1361)/streak発光(:1410-1417)を無効化(🥇🥈🥉バッジ:1366-1381とspeakingは残す)。段stack+ロビーにpopupカードと同じsurface/border/radius(中央映像は覆わない)。**LANE_CSS_SYNCマーカー区間(:971〜)の外に書く** | snapshot+LANE_CSS_SYNC同期テスト緑・census数値がP4と不変(件数が動いたら退行) |

## 地雷(必読・正本§G全9件の要点)
- P1: display:none禁止(iframe描画停止→鏡が死ぬ=会場fallback降格が最怖の退行)。visibilityでも痩せる環境ならP1単独revert。content-entryはhost.style.displayを触るがvisibilityは触らない=クラス方式なら衝突しない(裏取り済)。
- P3: _venueIsVipの顔ぶれを変えない(金縁挙動の意味流出)。pickCtx渡し忘れでも崩れないlib既定。
- P4: 鏡enrichマップは鏡rowsサイズ比例=鏡cap変更時に同時に見る(lane-limit-200の教訓)旨をlibヘッダに明記。
- 計測: blank計測はbackfill中に膨らむ(暫定顔)→ベースラインと合否は平常時で。白円の判定はimg.src(census.visibleEmptyでは写らない)。
- 共通: personTileDom凍結・storage新キーゼロ・reality-checker並走中commit禁止・push報告に反映3手順併記・検証は `npm run verify:cc`。

## 後送(明示・今回やらない)
- グリッド(userThumbGrid)の会場コピー=鏡に無く新storageキーが要る(制約違反)→別お題。
- 診断パネルの丸写し=popup内部state依存で不能。会場はvenueAvatarDiagLine+Tri-Parityで等価以上(確認済)。
- 席ラップ撤去+dataset.userKey逆引きアンカー移行(吹き出し/ギフト起点)=別シリーズ(順序: dual-read計器→吹き出し→ギフト→装飾→ラップ撤去+census bare許容化)。

## 転記元(実在確認済みパス)
- venueLaneBuckets.js:43-88(白円の病根)/storyUserLaneRowModel.js:72(正本導出)/storyUserLaneDisplaySrc.js:22-58/supportGrowthTileSrc.js:19,176-241/supportGrowthAvatarLoad.js:62-145,175-195
- venueBar.js: buildVenuePersonTile:368-383/透明ステージ:449-469/LANE_CSS_SYNC:971/席装飾CSS:1219-1445/commitDisplay:3791-3801/positionBubble:3649-3712/giftThrowOrigin:3301-3316/paintVenueLobby:3917-3958/setOpen:5014-5039
- content-entry.js:2725(INLINE_POPUP_HOST_ID)/venueLaneMirrorSupply.js:33-49,141,155-163/app/live-view.js:34,311,328(③前例)/venueDomCensus.js(P2改修先)
- HANDOFF-venue-equals-lane.md(B改の経緯)/reference_pop_venue_exact_SYNTHESIS.md(v1112厳密一致)/reference_diag_truth_SYNTHESIS.md(census)
