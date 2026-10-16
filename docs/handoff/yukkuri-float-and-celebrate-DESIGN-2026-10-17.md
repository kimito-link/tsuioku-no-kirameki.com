# 設計: ゆっくり3人の居場所・ふわふわ・応援コメント100件のお祝い(council-fable)

> 手順: 無料会議5体(論点の洗い出しのみ・主張は浅く、多くが未検証/誤り)→ 設計=Fable → 裏取り=司令塔(2026-10-17)。**実装は未着手**。
> ユーザー要望(2026-10-17 原文): 「このゆっくり3人を この辺りにふわふわ浮かぶように移動してほしい」(添付=ニコ生ページ上端のメニューの帯)/「いずれ、コメントが100件とかいったら、ゆっくり3人がくらっかーのようにはじけて画面をとびまわり『100件!』とかって、応援コメント突破のお祝いアクションをいれたい」。
>
> ## 司令塔の裏取り(実コードで確認済み)
> `resolveCharaFloat`(charaLiveState.js:114)/`CHARA_LIVE_SIZE_PX=116`(charaLiveStage.js:73)/`.nlcl-stage` は右下固定(charaLiveStage.js:121-123)/`COMMENT_MILESTONES`・`pickHighestCrossedMilestone`・`pickCommentMilestoneCelebration`(supportCelebration.js:24,42,205)/`.nlsb-stage` の `padding: clamp(52px,7vh,76px) …`(venueBar.js:657)/`panelSummarySnap` の購読(venueBar.js:3354,6262)/`NLS_PLAY_WATCH_CELEBRATION`(content-entry.js:10173)/`charaLiveFloatOnly.wiring.test.js:21` の `talk: false` 固定、はすべて実在。会議の「venueHeat が件数を持つ」「controller が reduced-motion を監視」は誤り(Fable が訂正)。
> 未確認(実装前に確認): 下の G の assumption list。

## A. 結論
居場所は「ニコ生ページ上端の帯(=`.nlsb-stage` が最初から空けている上の余白 52〜76px)に、3人を 64px に縮めて右寄せ横一列で浮かべる」を推奨し、座標は第三者DOMを測らず会場ステージ(fixed inset:0)相対の固定値で取る。100件のお祝いは**既に popup 側に存在する comment_milestone 演出(件数正本・節目一覧・音・一回性が全部ある)に乗る形で、会場の3人だけが「弾けて喜ぶ」部分を足す**(件数を数え直さない・音を足さない)。

## B. ユーザーに聞く最小の質問(実装前・選択肢つき)
1. 「この辺り」はどれですか? (a)ページ上端の帯(ロゴ・メニューの帯)の上に小さく(64px)浮かぶ ←推奨 (b)今の右下のまま PICK UP 枠より上(会場バーの屋根の上)に移す(385px幅だと3人で映像の下端を横一杯に覆うので非推奨) (c)上端の帯だが右寄せでなく中央/左寄せ
2. 大きさは 64px(今の約半分・顔は判別できる・以前の常駐レイヤーと同じ上限値)で良いですか? それとも今の 116px のまま(上端に置くと映像の上端に 40px ほどかかる)?
3. 100件のお祝いは、今すでに出ている「アプリ記録 100 件達成!」の降りものシャワー(①POP→視聴ページ中継)と**同時に出る**ことになります。会場を開いている間はシャワーを止めて3人の演出だけにしますか?(第2版で切替可能・まずは両方出して様子見でも可)

## C. 居場所の設計
**実コードで確認した構造**(venueBar.js / charaLiveStage.js):
- 会場ルート `.nlsb-root` = `position:fixed; inset:0; z-index:2147483000`、ページ body 直下。`.nlsb-stage` = `position:fixed; inset:0; padding: clamp(52px,7vh,76px) clamp(14px,3vw,44px) 64px; overflow:hidden; isolation:isolate`(venueBar.js:651-692)。開いている間 `pointer-events:auto`、中央 `.nlsb-safe-area` だけ `none`(:789-793)。
- キャラ層 `.nlcl-stage` は `startCharaLive({ mount: stage })`(venueBar.js:3170-3183)で stage の直下に append。`position:absolute; right:12px; bottom:12px; z-index:8`。`pointer-events:none`。`.nlsb-stage` が viewport 全面なので「stage の右下」=「画面の右下」。ひな壇 `.nlsb-seating` は画面下端 `max-height:48vh`(:821-852)で、header→pickup→topbar→seats の順(:2749)。右下固定の116pxはひな壇の上に必ず乗る=PICK UP と被るのは構造どおり。
- `.nlsb-stage` の `padding-top: clamp(52px,7vh,76px)` は会場レイアウトを上端から離す拡張自身の定数。**ここが「ヘッダー帯の周辺」に相当する拡張側の既存余白**。第三者DOMを測らずに済む根拠。
- 過去の常駐レイヤー `.nlsb-residents`(左右の縁・`clamp(40px,4.4vw,64px)`)と額縁 `.nlsb-charframe` は**フラグOFFで廃止済み**(`VENUE_RESIDENTS_ENABLED=false` :5003 / `VENUE_CHAR_FRAME_ENABLED=false` :5034)。作り直さない。64px は residents の上限値と同じ=既に実機で判別できていた大きさ。

**推奨配置**: `.nlcl-stage[data-placement="top"]` 修飾子を charaLiveStageCss に追加し `top:4px; right:12px; bottom:auto; align-items:flex-start`、`.nlcl-chara` を 64px(新定数 `CHARA_LIVE_COMPACT_SIZE_PX=64`。既存 `CHARA_LIVE_SIZE_PX=116` は残す)。3人+gap10px=212px → 385px幅でも右半分に収まる。吹き出し `.nlcl-chara__bubble`/`__think` は `bottom:calc(100%+6px)`(上に出る)なので top 配置では画面外に出る → 同じ修飾子で下向き(`top:calc(100%+6px); bottom:auto`、しっぽの向き反転)にしておく(今は `talk:false` で出ないが、戻したとき壊れないように同版で直す)。
- **座標の取り方=固定値(stage 相対)**。ニコ生の実ヘッダー要素は測らない(§3.6: 第三者DOMはクラス名も高さも予告なく変わる。測ると「無いとき」「高さ0のとき」「スクロールで消えたとき」の分岐が必要になり、壊れ方が増える)。会場バー上端相対も不採用(人数で48vhまで伸縮し、位置が動く)。
- **リスク**: (1) 上端の帯がスクロールで流れる構造なら、スクロール後は映像の上端に3人が乗る(stage は fixed)。CSS 上は padding-top が同じ場所に空いているので会場レイアウトとは干渉しない。(2) 会場を開いている間は `.nlsb-stage` が `pointer-events:auto` で viewport 全面を取るため、CSS 上は上端の帯のクリックは既に stage に奪われているように読める(未実測)。真なら3人を置いても操作性は悪化しない。偽でも `.nlcl-stage` は `pointer-events:none` なので素通し。(3) 配置切替は `CHARA_LIVE_PLACEMENT = 'top' | 'bottom-right'`(charaLiveStage.js の export 定数・`RESIZE_CURTAIN_ENABLED` と同じ流儀)で1行戻し。controller が `root.dataset.placement` に落とす。

## D. 動きの設計
**既存の浮遊はすでに決定論**: `resolveCharaFloat(timeMs, charaId, {heatLevel, reducedMotion})`(charaLiveState.js:114-144)。位相は index で等間隔(0,1/3,2/3)+ハッシュ微揺らぎ、周期 5200ms(heat で 3600ms まで短縮)、y=±(5+3heat)px、x=±(3+2heat)px を 0.63 倍周波で合成=すでに「8の字」寄り、傾き±1.6°、scale±1.2%。描画は `charaLiveController.tick` が rAF を 18fps に間引き、`applyCharaLiveFrame` が transform 1本を inline で書く(変化時のみ)。会場を閉じると `setVisible(false)` で rAF 停止(:206-214)。reducedMotion は venueBar の `crowdReducedMotion`(matchMedia を起動時に1回読む・:3160)を注入=「監視」はしていない。
- **MVP(第2版)=振れ幅の定数化だけ**: `resolveCharaFloat` 内の `5`/`3`/`1.6` を `FLOAT_AMP_Y_PX=8`/`FLOAT_AMP_X_PX=4`/`FLOAT_TILT_DEG=2` に出す(上端64pxでは5pxは「止まって見える」ので少し上げる)。**x の上限は 4px**(隣との gap 10px を、逆位相の2人が同時に内側へ寄っても 8px<10px で触れない)。縦は帯の中で±8px(64+8=72px → 映像上端に最大20pxかかる・2.6秒に1回)。位相ずらし・周回は既存のまま(作り直さない)。
- **CSS @keyframes 化は今はしない**(判断): 既存ループは 18fps・inline 書き込み3本で、会場を閉じれば止まる。CSS 化するとまばたき/表情(130ms分解能が要る)のために結局ループが残り、heat 連動も失う=コードが増えて得るものが測れていない。先に実測(既存 `__nls_chara_live_probe__` と CPU 計測)で tick が目に見える重さなら、後続版で「浮遊だけ CSS keyframes(`animation-delay: -phase×period` を `resolveCharaFloat` の位相式から1回だけ計算)、JS は表情差分の src だけ」に移す。
- reduced-motion: 既存どおり `reducedMotion:true` で float を 0 に(:115)。追加の判定を作らない。

## E. お祝い演出の設計
**何を 100 件と数えるか(実コードで特定)**: 表示正本は `nls_panel_summary_<lv>` の `recordedCount`(content-entry.js:830 `recordedCountForDisplay`=per-live 単調化、:11319 で publish、popup 非依存・min-gap 2秒)。会場は既に購読済み(venueBar.js:6651-6656 `panelSummarySnap` 更新、取り出しは `selectDisplayRecordedCount(panelSummary)`/storyDiagTotalSource.js)。`venueHeat.js` は rows からレベルを出す関数で件数は持たない(会議の主張は誤り)。
**既にある祝い(見落とすと二重実装になる)**: popup-entry.js `noteCommentMilestoneHighWater`(:2161)→`pickCommentMilestoneCelebration(prev,next)`(supportCelebration.js:205、節目 `COMMENT_MILESTONES=[10,25,50,100,200,500,1000,…]`、dedupeKey `comment_<m>` を `KEY_SUPPORT_CELEBRATION_STATE` に per-live で記録・起動時プライムで一斉発火防止 :2109)→ 効果音(`effectDirector.directHit` でティア昇格・`KEY_EFFECT_SOUND_ENABLED` でOFF可)+ 降りものシャワー(100件=85個・4.8秒・バナー「アプリ記録 100 件達成!」)を popup と視聴ページに中継(`NLS_PLAY_WATCH_CELEBRATION` → content-entry.js:10173 → `.nl-celebration-shower` fixed z:2147483646=会場より前面)。つまり「100件!」の告知と音は既に出ている。足りないのは**常駐の3人が反応すること**だけ。

**方針**: 会場側で `recordedCount` の節目通過を検出し、3人を「cheer」させる。検出は `pickHighestCrossedMilestone(prev, next, COMMENT_MILESTONES)` をそのまま再利用(新しい節目表を作らない)。popup の検出と同じ正本の同じ数字なので二重計上ではない(同じ瞬間に2つの演出が出るだけ・質問3)。
- 新純関数 `src/lib/charaLiveCheerTrigger.js`: `resolveCommentCheer(prev, next, {minMilestone=100, jumpGuard=300})` → `{ milestone } | null`。`prev==null`(開いて最初の観測)は baseline 採用のみで発火しない。`next-prev >= jumpGuard` は backfill/タイムシフト一括流入とみなし baseline 更新のみ。`minMilestone` で 10/25/50 を除外(ユーザー要望は100。popup 側の表は変えない)。
- 一回性・リセット: 会場ローカルの `prev` と `firedMilestones:Set` を `activeLiveId` ごとに持つ(配信切替で捨てる)。storage には書かない(件数が per-live 単調なので再通過しない)。
- 節目の一般化: `milestone` を `${n.toLocaleString('ja-JP')}件!` の文言に落とすだけ。強さのティアは後続。
- 衝突回避: 音=既存のみ。視覚=会場内では z8、ギフト投げ `.nlsb-gift-proj`(z7・1.5秒)と重なっても両方 transform のみ。cheer 実行中に次の cheer は捨てる。視聴ページのシャワーとの重なりは第5版で「会場 open 中は comment_milestone のシャワーを中継側(content-entry.js:10173)でスキップ」(`html.nlsb-venue-open` の既存文字列契約)。
- **MVP の見た目**: 3人同時に (1) 表情を smile+口パクに固定(`charaLiveState` に mode `'cheer'`。`untilMs=now+2400`・吹き出し無し。`talk:false` の影響を受けない別入口 `charaLive.cheer({milestone})`)、(2) `.nlcl-chara.is-cheering` に CSS keyframes `nlcl-cheer`(scale 1→1.3→1 + 小さく跳ねる・2.4秒・transform/opacity のみ。CSS animation は inline transform より優先されるので浮遊と競合しない。`fill-mode:none`)、(3) `.nlcl-cheer-badge` 1要素(`${n}件!`・pop→fade 2.2秒)。映像を覆うのは上端 150px 以内・2.4秒。
- **後続**: クラッカー=`.nlcl-confetti` を最大24個のプール(`.nlsb-gift-proj` と同じ流儀)で transform/opacity keyframes 1.5秒。飛び回る=各キャラに `--nlcl-dx/--nlcl-dy` を style に1回渡し keyframes で往復 2秒。合計上限 3秒。ティア(≥1000 で粒子 24 / ≥100 で 12)。
- reduced-motion: cheer は keyframes を `animation:none`、badge は opacity の fade だけ、表情 smile は出す。音は既存の設定に従う。

## F. 版の分割とテスト
| 版 | 変更 | フラグ/戻し | テスト |
|---|---|---|---|
| 1 | 配置 top(修飾子 CSS+64px+吹き出し下向き) | `CHARA_LIVE_PLACEMENT`(charaLiveStage.js) | charaLiveStageHiddenCss.test.js 流儀で CSS 文字列に `[data-placement="top"]` 規則があること/`buildCharaLiveStageDom` が dataset を付けること。charaLiveController.test.js:255 の `.nlcl-stage {` 宣言パースはベースブロックを変えないので壊さない |
| 2 | 浮遊の振れ幅定数化(y8/x4/tilt2) | 定数を旧値に戻す | 純関数: 全 t サンプルで |x|≤4、隣接2体の x 差が gap 未満、reducedMotion で全0(既存テスト維持) |
| 3 | mode `'cheer'` + `charaLive.cheer()` + keyframes + badge | `CHARA_CHEER_ENABLED`(新 lib) | 純関数: 3体とも smile・期限で idle に戻る・`talk:false` でも効く。stage: `is-cheering` 付与/除去・badge の textContent。controller: `cheer` が `needsImmediateDraw` を立てる |
| 4 | venueBar 配線(panelChange ブロックで `resolveCommentCheer` → `charaLive.cheer`)+ DevTools プローブ `__nls_chara_cheer_probe__(n)` | 同上フラグ | 純関数(prev null/jump/min/節目)。配線テストは charaLiveFloatOnly.wiring.test.js と同じ文字列契約で「`panelChange` の if ブロック内で `charaLive.cheer(` が呼ばれ、**戻り値が使われている**」まで固定 |
| 5(任意) | 会場 open 中は comment_milestone のシャワー中継を抑止 | content-entry 側1行+定数 | 配線テスト(`nlsb-venue-open` 契約) |
| 6(後続) | 紙吹雪プール+飛び回り | 粒子数定数 | プール上限・終了後 display:none |

**地雷(テスト側)**: `charaLiveFloatOnly.wiring.test.js:21` は `startCharaLive({` 呼び出しの最後の引数が `talk: false` である正規表現。新しい引数は `talk` より前に置くか、テストを同版で更新する。
**実機の確かめ方(最小)**: 第1版=ユーザーはサイドパネル併用幅で会場を開き「上端の帯に3人が居て PICK UP に被っていない」の yes/no だけ。第3〜4版=100件を待たず、司令塔が `__nls_chara_cheer_probe__(100)` を叩いて演出を出す(件数は触らない)。

## G. 捨てた案・地雷・未確認
**捨てた案**: ニコ生ヘッダー要素を測って配置(第三者DOM・§3.6)/ 1/3 縮小 38px(判別不能・residents の実績下限は 40px)/ 「8px 幅の透明ガイド領域」(意味が定まらず、385px 幅では余白自体が無い)/ 会場バー上端相対(48vh まで伸縮し位置が動く)/ 右下のまま PICK UP の上(385px で映像下端を横一杯に覆う)/ 件数の再集計や `venueHeat` からの取得(正本は recordedCount・§12.8)/ お祝い状態の storage 永続化(単調件数なので不要)/ 新しい効果音(既存が鳴る・OFF 設定も既存)/ content-entry から CustomEvent で会場へ通知する橋(popup が生きている前提になる)/ 浮遊の rAF→CSS 化の即時実施(測ってから)/ 却下済み(content-visibility/LOD/software canvas/静穏窓/get一括化)は再提案しない。
**地雷**: `.nlsb-stage` は `overflow:hidden`=飛び回りは viewport 端で切れる/ `.nlcl-stage` の z8 は stage 内 stacking context の値。視聴ページの `.nl-celebration-shower` は常に会場より前/ `hidden` 属性は `display:flex` に負ける(既存対策を badge/confetti にも必ず付ける・charaLiveStage.js:220-227)/ CSS animation が inline transform を上書きする性質を意図して使う(fill-mode を forwards にすると浮遊が止まったままになる)/ dist は CRLF・日本語エスケープ/ 会場 open 中は ①POP ホストが `visibility:hidden`(:2206)。
**未確認(assumption list)**: ①「この辺り」=上端の帯(画像からの解釈・質問1で確定)。②会場 open 中に上端の帯のクリックが `.nlsb-stage` に奪われているか(CSS の読みのみ・実機未測定)。③ニコ生の上端ヘッダーがスクロールで流れるか固定か。④385px 幅での実際の重なり幾何(ユーザーのスクショのみ・DevTools 未測)。⑤①POP が `visibility:hidden` の間も comment_milestone を発火・中継し続けるか。⑥popup の `countToShow=max(recordedCount, 配列長)` と会場の `recordedCount` が同一瞬間に 100 を跨ぐか(最大 2 秒程度ずれる想定)。⑦tick(18fps)の実 CPU 負荷(CSS 化の要否はこれ次第)。
