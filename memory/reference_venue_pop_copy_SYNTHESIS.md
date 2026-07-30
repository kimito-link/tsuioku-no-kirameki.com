# 設計正本: 会場=①POP「アイコン列・グリッド・診断」丸写し

- 設計=Fable(claude-fable-5) / 裏取り=司令塔 / 2026-07-10
- 3段構えワークフロー(会議6体→Explore実コード裏取り→Fable設計)の手順2産物
- 実装ハンドオフ: [HANDOFF-venue-pop-copy-IMPL.md](../HANDOFF-venue-pop-copy-IMPL.md)
- 契機: 実配信(lv350927619)で会場が①と明らかに違って見える。ユーザーの問い「普通に①のソースコピーでいいのに、なぜこうなるのか」+確定ゴール「POPで出るアイコン列・グリッド・診断表示の丸写しを会場にコピーして反映」。
- 前提: v0.1.1113(Tri-Parity実DOM census)・v0.1.1114(額縁廃止)実装済み・ブランチ feat/venue-lane-mirror-parity。
- 司令塔裏取り済みの核心事実:
  - INLINE_POPup_HOST_ID='nls-inline-popup-host'(content-entry.js:2725)実在
  - buildStoryUserLaneCandidateRow(storyUserLaneRowModel.js:72)実在=①のdisplaySrc正本
  - supportGrowthAvatarLoad.getDiagnostics(:175)実装済みで venueBar 未配線(P2の配線先)
  - 白円の正体= blank.jpg(supportGrowthTileSrc.js:19)
  - Explore確定: 白円=venueLaneBuckets.js:53-55 の推測URL直入れ(fallback/ロビー/トップバーのみ・鏡経由セルは①のdisplaySrc逐語コピーで白くならない)/透け=意図的透明ステージ(venueBar.js:449-469)+①POPを隠すコード不在(setOpen:5014-5039)/見た目差=.nlsb-seat席ラップ+席装飾/トップバー/群衆Canvas/ロビーの上乗せ(venueBar.js:1219-1579)
- ⚠ブリーフ訂正(Fableが実読で発見): 「①はscore≥2しか採用しない」は不正確。userLaneHttpForTilePick は preferred が空でも primaryHttp を素通しし、①も数値IDに合成URLを導出する。①と会場の差は (1)匿名の identicon 化(①は tier<3 で http を剥がす) (2)avatar取り違えガードの有無 (3)deriveNicoUserIconUrl のdrift(\d{2,15}+bucket0許容 vs ①は\d{5,14}+bucket min1=短IDで必ず404のURLを生成) (4)入力データ差(①のentryはenrich済みscore2 URL持ち・会場fallbackは空が多い)。**404合成URLのtv-fallback表示は①も同じ=パリティ上「正」**(直ってないと誤読しない)。

---

(以下、Fable設計書全文)

# 設計書: 会場=①POP「アイコン列・グリッド・診断」丸写し (v0.1.1115〜)

## 先に裁定2件(黙って握らない)

**裁定1: スモーク禁止 vs ①バナー邪魔の両立。**
「スモークをかけない」対象は**配信映像と本家watch UI**(venueBar.js:449-469の設計コメントの原意)。①POP(インラインiframe `#nls-inline-popup-host`)は**拡張自身の冗長UI**であり、会場=①の鏡である以上、会場openの間だけ畳むのは方針違反ではない(同じ情報を二重表示しているだけ)。よって **会場open中=①POPホストを不可視化(復帰つき)・映像と本家UIは今後も素通し・全面暗幕は今後も導入しない**。ただし段(レーン帯)の背後だけは「①と同じカードsurface」を敷く=これは丸写しの一部(①のレーンには背景がある)でありスモークではない。中央映像は覆わない。

**裁定2: ブリーフの「①はscore≥2しか採用しない」は実コードと不一致(要修正認識)。**
`userLaneHttpForTilePick`(storyUserLaneDisplaySrc.js:22-32)は preferred(score≥2)が空でも **primaryHttp が http なら素通しで返す**。かつ①の `storyGrowthAvatarSrcCandidate`→`resolveStoryLaneAvatarSrc`→`resolveSupportGrowthTileSrc`(supportGrowthTileSrc.js:176-179)は数値IDに**合成CDN URLを導出する**。つまり①も「数値ID・個人サムネ未取得」の人は合成URL→プローブ404なら blank.jpg+tv-fallbackスタイルになる。①と会場の白円差の真犯人は「score≥2フィルタの有無」ではなく:
1. **匿名(a:)の扱い**: ①は tier<3 で http を剥がし identicon(pickStoryUserLaneCellDisplaySrc:49-50)。会場は捕獲httpを直入れ・匿名でavatarUrl無しはidenticon(ここだけ偶然一致)。
2. **avatar取り違えガード**(isAvatarUrlForUserId/broadcaster guard)を会場fallbackは通らない。
3. **導出式のdrift**: `deriveNicoUserIconUrl`(venueSeats.js:198-202)は`\d{2,15}`+bucket 0許容、①の`niconicoDefaultUserIconUrl`は`\d{5,14}`+bucket min1 = 短いIDで①と違う(必ず404の)URLを作る。
4. **最大要因=入力データ差**: ①のentryはコメントenrichで個人URL(score2)を持つが、会場participant.avatarは空のことが多く、v1110のenrich関所もprofileAvatarMapキャッシュミスは素通り。**鏡(laneMirrorPaintSnap)には①が解決済みのdisplaySrcが既に載っているのに、ロビー/トップバー/fallbackはそれを使っていない。**

よって白円根治=「①正本の導出チェーンへの委譲」+「鏡displaySrcを追加enrich源にする」の2段。「白円が全部identiconになる」とは約束しない(①も未解決数値IDはtv-fallback様式=それがパリティの正)。

## A. 理想の体験フロー(受け入れ基準)

1. 配信watchページで会場を開く → **①POPパネル(キャラ案内バナー含む)が消え、配信映像と本家UIだけが背景に残る**。会場を閉じる/別窓会場を閉じると①POPは元通り(受け入れ基準: open→close往復でstyle残骸ゼロ)。
2. 会場の5段は v1112 どおり鏡と厳密一致のまま、**段の帯に①と同じカード背景**が敷かれ、背後のコメント欄等が透けない。中央の映像は1pxも覆われない。
3. ロビー・トップバー・fallback時の全タイルの顔が**①と同じ規則**で出る: 匿名=identicon、個人サムネ既知=実サムネ、数値ID未解決=①と同一の合成URL(404時は①と同じtv-fallback様式)。**生の白円(素のblank.jpg)がidenticon対象者に出たら不合格**。
4. 5段のタイルからVIP金縁リング・streak発光が消え、①のレーンと並べて区別がつかない(順位バッジ🥇🥈🥉のみ残す=「ピカピカ光る演出は不要・バッジのみ」の既存ユーザー指示に整合)。
5. 吹き出し・ギフト投げは今までどおり席(タイル)から出る。会場一致✅(Tri-Parity)は緑のまま。
6. 上記が**状態速報/censusの数字だけで**判定できる(実機目視のお願い往復をしない)。

## B. 統合アーキテクチャ(コンポーネント4個)

```
[①POP popup-entry]
  buildStoryUserLaneCandidateRow (storyUserLaneRowModel.js) ←── displaySrc正本(唯一)
      │ paint + publishLaneMirror(KEY_LANE_MIRROR: displaySrc逐語)
      ▼
[鏡] laneMirror ──────────────┬────────────→ ③WEB app/live-view.js(前例: wrap無し丸写し)
                              │
[会場 venueBar.js(watchページ content script)]
  (K1) 遮蔽制御: setOpen ⇔ #nls-inline-popup-host 不可視化/復帰(class駆動)
  (K2) 変換層: venueLaneBuckets.venueSeatEntryToLaneItem
        → displaySrc導出を buildStoryUserLaneCandidateRow へ【委譲】(②本目の導出を削除)
        + commitDisplay関所の enrich源に「鏡displaySrcマップ」を追加(profileAvatarMapと併用)
  (K3) 描画: 5段=鏡paint(現状維持・席ラップ維持) / 見た目CSSのみ①化(VIP縁・streak停止+段surface)
  (K4) 計器: venueDomCensus に blank/blankAnon 計数 + venueAvatarLoadGuard.getDiagnostics を
        venueSeatsDiag へ露出(白円の機械判定)
```

配線の要点: K2は純lib(src/lib)内で完結し、venueBar からは pickCtx(資産URL・identicon)だけ注入。K1は venueBar→同一document の `documentElement` にクラス付与、content-entry 側は触らない(inline style書き換え合戦を避ける)。

## C. 具体機構(ファイル/関数/差分の要点)

### C-1. 透け対処(K1) — ①POPを畳む・映像は見せる

- `venueBar.js` VENUE_CSS 末尾に追加(再スコープ外・documentレベル):
  ```css
  html.nlsb-venue-open #nls-inline-popup-host { visibility: hidden !important; pointer-events: none !important; }
  ```
- `setOpen`(venueBar.js:5014-5039): open分岐で `document.documentElement.classList.add('nlsb-venue-open')`、close分岐+standaloneのpagehide経路で remove。**`display:none`は禁止**(iframeのレイアウト消滅→rAF/描画停止→popupのpaint・IntersectionObserver・鏡publishが痩せるリスク。`visibility:hidden`はレイアウト保持=リフロー無し・鏡は生き続ける)。
- ホストIDは content-entry.js:2725 の `INLINE_POPUP_HOST_ID = 'nls-inline-popup-host'` を文字列で参照。**存在しなければ何もしない**(standalone会場タブにはホストが無い=自然にno-op)。
- content-entry は `host.style.display` を自分の都合で切り替えるが `visibility` は触らない(grep裏取り済)=クラス方式なら衝突しない。
- 段の帯の不透過(丸写しの一部)は C-3 のCSS patchに含める: `.nlsb-venue-lane-stack { background: var(--nl-surface); border-radius/border= popup.html:829-1067 のカードと同値; }`+ロビー同様。中央映像領域には敷かない(stackは下部帯のみ)。

### C-2. 白円根治(K2) — 導出の正本一本化+鏡enrich

**patch A(導出委譲)** — `src/lib/venueLaneBuckets.js:43-88`:
- 現行の `httpAvatar = avatarUrl || deriveNicoUserIconUrl(uid)` 直入れを廃し、①正本へ委譲:
  ```js
  const row = buildStoryUserLaneCandidateRow(
    { userId: uid, nickname: rawName, avatarUrl },
    seatIndex,
    resolveStoryLaneAvatarSrc({ userId: uid, avatarUrl },
      { snapshot: null, isOwnPosted: false, rememberedAvatar: '' }),
    pickCtx  // opts.pickCtx: venueBar が注入
  );
  // displaySrc/thumbScore/profileTier は row からそのまま採用。row=null(uid無し)は
  // 従来どおり key ベース identicon の item を組む(会場は「全員着席」哲学=落とさない)。
  ```
- `pickCtx` は `venueSeatEntryToLaneItem(seatEntry, opts)` の opts 経由: `{ yukkuriSrc, tvSrc, anonymousIdenticonEnabled: true, anonymousIdenticonDataUrl }`。lib既定は identicon 有効・tvSrc=blank(=渡し忘れても①既定と同値=opts渡し忘れの顔崩れを構造防止)。
- **`_venueIsVip` は旧式のまま据え置き**(このpatchで金縁の顔ぶれを変えない=1変更1patch)。`deriveNicoUserIconUrl` はVIP判定・roster診断用に残置。
- `venueBar.js buildVenuePersonTile`(:368-383)=トップバーの第2導出を削除し、`venueSeatEntryToLaneItem` の戻りを `buildPersonTileEl` に渡す薄いラッパへ(正本1つ)。ロビーは items が既に venueSeatEntryToLaneItem 出力なので**patch Aだけで自動的に直る**。鏡経由セル(venueLaneMirrorSupply.js:141 逐語コピー)は触らない。

**patch B(鏡displaySrc enrich)** — 新規純関数 `src/lib/venueMirrorAvatarEnrich.js`:
- `laneMirrorPaintSnap`(renderSeats が既に手に持っている・新規readゼロ)から `uid → displaySrc` マップ(http(s)のみ・data:identicon除外)を作り、`commitDisplay` 関所(venueBar.js:3791-3801)で `enrichVenueRowsWithProfileAvatars` の**後段に**適用: participant.avatar が空 or score<2 のrowへ、鏡の score≥2 URLを注入(冪等・上書きは強い方のみ=`commentEnrichmentAvatarScore` 比較)。
- 効果: ①が解決済みの顔は、ロビー/トップバー/fallbackでも**①とバイト一致のURL**になる=「丸写し」の字義どおり。プローブも①で成功済みURLなので blank 期間もほぼ消える。

### C-3. 見た目①化(K3) — CSSのみ・DOM/座標系不変

- VENUE_CSS: 5段スコープ(`.nlsb-venue-lane-stack` 配下)の `.nlsb-seat-vip`金縁(:1356-1361)と `[data-streak]`発光(:1410-1417)を無効化。`[data-venue-rank]::after` 🥇🥈🥉(:1366-1381)は**残す**。`nlsb-seat-speaking` は残す(吹き出し連動の会場資産)。
- 段stack+ロビーに popup カードと同じ surface/border/radius。max-height+内側スクロールで映像を侵食しない。
- 席ラップ(`.nlsb-seat`)は**維持**。`.nlsb-seat` 自体は positioning shell(:1219-1227・見た目chromeは全部modifier)で、①との見た目差はmodifier CSSで消せる。JSの座標系(positionBubble:3649-3708 / giftThrowOriginForSpeaker:3301-3316)は `seatAnchorEl(node)`=タイルavatar要素のrect基準なのでCSS変更の影響を受けない。

### C-4. 計器(K4)

- `venueDomCensus.js countSection`: 可視タイルごとに `img.nl-story-userlane-avatar` の src を読み、`/\/usericon\/defaults\//` なら `blank+=1`、かつ userKey が `a:` 系なら `blankAnon+=1`(読むだけ・getComputedStyleゼロの掟維持・3秒期日内のみ)。
- venueSeatsDiag に `venueAvatarLoadGuard.getDiagnostics()`(supportGrowthAvatarLoad.js:175-195・実装済み未配線)の `{usericonSucceeded, usericonFailed}` を同乗(新storageキーゼロ)。
- census スキーマ変更なので wiringテスト同patchで更新。

## D. 偽陽性潰し

- **白円**: `blankAnon`(匿名なのにblank)は修正後**恒常0**が合格条件。`blank`(数値ID)は0にならない(①も同じ)ため単体で合否に使わない。「鏡enrich後は鏡が知っているuidの blank=0」をテストで固定。判定は img.src で行う(census.visibleEmptyでは白円は写らない=タイル有り・img白)。
- **透け**: 最怖の偽装退行=「①POPを隠したら鏡が死んで会場がfallback降格」。判定は既存計器で機械化: 会場open中に (i) laneParity=mirrorのまま✅ (ii) 鏡capturedAtが3秒周期で前進。open→10分放置→capturedAt停滞なら P1 revert。
- **座標**: 席ラップ不変なので座標退行は原理的に無い。CSS patch(C-3)で `.nlsb-seat` の display/overflow を変えないことを characterization テストで固定。dataset.userKey 逆引き(v1113)はこのシリーズでは計測用のみ。
- **enrich上書き事故**: 鏡enrichは score比較で強い方だけ上書き=captured個人URLを合成URLで潰さないテストを新lib に同梱。

## E. MVPとPhase分割(1patch=1bump・機械的完了判定つき)

MVP=P1+P2+P3(実機症状(a)(b)が消える)。各patchは独立revert可。

| patch | 版 | 内容 | 機械的完了判定 |
|---|---|---|---|
| **P1** | v0.1.1115 | ①POP遮蔽(C-1 クラス方式+setOpen配線) | 新規テスト: setOpenでhtmlクラスtoggle・standalone no-op。実配信: open中 laneParity=mirror✅維持+鏡capturedAt前進 |
| **P2** | v0.1.1116 | 白円計器(C-4: census blank/blankAnon+guard診断露出+wiringテスト) | verify:cc緑・状態速報に blank/blankAnon/usericonFailed が出る(ベースライン取得) |
| **P3** | v0.1.1117 | 導出委譲(C-2 patch A: venueLaneBuckets+buildVenuePersonTile) | 単体: 匿名a:→identicon・数値ID→①のniconicoDefaultUserIconUrlとバイト一致・4桁ID合成URL消滅・_venueIsVip不変。実配信: blankAnon=0 |
| **P4** | v0.1.1118 | 鏡displaySrc enrich(C-2 patch B: 新lib+commitDisplay関所1行) | 単体: score比較上書き・冪等。実配信: 鏡在籍uidのロビー/トップバーblank=0・blank総数がP2比減 |
| **P5** | v0.1.1119 | 見た目①化CSS(C-3: VIP縁/streak停止・段surface・🥇残し) | CSSのみ=snapshot+LANE_CSS_SYNC同期テスト緑・census数値がP4と不変 |
| 後続(別シリーズ) | — | トップバー/群衆Canvasの去就・席ラップ撤去(userKey逆引きアンカー移行とセット) | — |

**過剰設計の戒め**: P1〜P5 の新規ファイルは lib 1個(P4)のみ。Shadow DOM・popup.css注入・storage新キーはゼロ。

### 必答論点への対応表
1. 白円根治 → C-2/P3・P4(正本再利用=buildStoryUserLaneCandidateRow委譲、鏡経由は不触)
2. 透け → C-1/P1(①POPだけ畳む・visibility方式・close/standalone復帰・鏡生存を機械監視)
3. 丸写し度合い → **B改継続**。席ラップは positioning shell で犯人ではない(犯人はmodifier CSS)。userKey逆引きアンカー移行は「席ラップ撤去とセットの別シリーズ」へ。移行順序: 計器(dual-read比較)→吹き出し→ギフト→装飾→ラップ撤去+census bare許容化。
4. グリッド・診断の範囲 → **MVPはアイコン列(5段+ロビー+トップバー)の顔と見た目のみ**。診断=会場は venueAvatarDiagLine🩺+Tri-Parity で popup 版と等価以上(popupのstoryAvatarDiagはpopup内部state依存で丸写し不能)。グリッド=userThumbGridは鏡に無く新鏡キー(storage新キーゼロ違反)が要る→明示的に後送。
5. Tri-Parity整合 → P1〜P5 は census 走査対象を一切変えない=✅そのまま。censusスキーマを触るP2だけwiringテスト同梱。席ラップ撤去時は「bare=正常」への意味変更+テストを同patchで。
6. 検証 → D節+E表。白円は blankAnon=0(絶対条件)/鏡在籍uid blank=0(P4)/blank総数減(参考)で状態速報から機械判定。

## F. 捨てた案と理由

- ①POPホストの display:none / iframe除去 — iframeレンダリング停止で鏡publishが痩せる恐れ(会場は鏡で生きる=自殺になり得る)。visibility:hidden採用。
- 会場全面の不透過幕 — スモーク禁止方針に正面衝突。
- バナー要素だけiframe内でピンポイント非表示 — iframe越境+popup.html構造依存=drift地雷。ホストごと畳む方が単純。
- venueLaneBucketsに「score≥2フィルタ」自作 — ブリーフ誤読由来。①に無い第2ルール=正本2つ化。①の実挙動へ委譲が字義どおりの丸写し。
- 席ラップ即時撤去(③方式全振り)/display:contents化 — ③はbubble/gift/装飾/ロビーを持たないから丸写しで済んだ。会場は4系統がseatNodes依存・見た目はCSSで達成できる=リスクだけ買って見返り無し。
- Shadow DOM全面導入・popup.css注入 — 寸法は再スコープCSSで一致済(同期テストあり)。会議でも過剰設計判定。
- renderSeats全体のsigスキップ軽量化 — v1032で①ちらつき回帰の実績。触らない。
- グリッド鏡の新設 — storage新キーゼロ違反+高さ振動地雷(v1026同型)。後送。

## G. 地雷と回避策

1. visibility:hiddenでも鏡が痩せる環境 → P1完了判定に「open中の鏡capturedAt前進」必須。停滞したらP1単独revert。
2. _venueIsVipの意味流出 → P3で旧式据え置きをcharacterizationテストで固定。
3. pickCtx渡し忘れ=匿名の顔崩れ → lib既定を①既定と同値に(渡さなくても崩れない)+テスト。
4. LANE_CSS_SYNCマーカー → P5はマーカー区間(venueBar.js:971〜)の外に書く。
5. 鏡cap変更との連動(lane-limit-200の教訓) → P4の鏡enrichマップは鏡rowsサイズ比例。capを変えるときは同時に見る旨をlibヘッダに明記。
6. copy:ext漏れ+反映3手順 → 各patchのpush報告に3手順併記。実機判定は状態速報コピペで完結。
7. reality-checker並走中のcommit禁止 → 検証→commitを直列に。
8. heavyRace/backfill中の計測 → blank計測はbackfill中に膨らむ。ベースライン(P2)と合否判定は平常時で。
9. 404合成URLはパリティ上「正」 → P3後も数値ID未解決者のtv-fallback表示は残る=①と同じ。「直ってない」と誤読しない(P2のusericonFailed露出を読み方としてHANDOFFに明記)。
