# 設計正本: 会場の仕上げ3点(ガイド帯除去/白パネル根治/fallback匿名ロビー隔離)+タイムシフト裁定

- 設計=Fable(claude-fable-5) / 裏取り=司令塔 / 2026-07-10
- 3段構え(会議6体→Explore実読→Fable)の手順2産物。実装=v0.1.1120〜1122(同日実装)。
- 契機: v0.1.1119実機でユーザー「匿名がとんでもない数」「りんく こん太 たぬ姉が消えてない」「ローディングがつねに」「酷い状態」。
- 前段の成功(実弾確認済み): 会場一致 ✅鏡(2s前) DOM=データ 白円10(匿名0)=Tri-Parity本物・P3白円根治成功・会場openでも鏡前進(P1無罪)。

## 確定事実(Explore実読)
- (A)会場内のキャラ帯/空段説明/フッター(「ほかN人は会場モードで…」=自己言及)は**会場自身が共有rendererで描いている**(①の透けではない)。paintStoryUserLaneDomFilled(renderStoryUserLaneDom.js:314-440)が無条件に描く。空段ノート(:354-373)は lane el 直付け=guide要素null化では消えない。③live-viewもガイド込み=先例なし。
- (B)fallback(鏡不可)は lobbyItems=[] で bucketVenueLaneSeats が全員を段へ(venueBar.js:4200-4209)。匿名(tier1)は全部たぬ姉=壁。cap211=resolveVisibleArenaCount(participant/grid/hardCap500の最小)。
- (C)P5のstack全面surface(venueBar.js:1677-1682)は下端55vhバンド全体を白面化(gridは safe(1fr)/seating(auto・max55vh)で映像そのものは覆わないが画面下半分が白パネル)。
- (D)①タイムシフト未描画(started=0)の真因=lid解決3段全滅(popup-entry.js:21717-21729)+軽い源(csummary/tail/鏡)無し+heavy entries空、の合わせ技。**P1(visibility:hidden)は無罪**(トリガはtimer依存・document.hiddenはタブ可視性)。**幕には3重フェイルセーフ実在**(initPopup末尾の絶対12秒タイマー:19065-19071・5秒後dismissInlineShadeWhenDataReady 10s cap・CSS15秒)=「常時ローディング」は幕の永続でなく**再出現**の疑い=真因未確定。

## Fable裁定
- **(D)は本シリーズに含めない=別送お題 `timeshift-popup-paint`**。理由: ①paint経路を触ると白紙popupリスクを全①ユーザーが背負う+幕永続説はコードと矛盾=計器(D-0: 幕の生成回数/loadPhase/lid解決失敗段を状態速報1行)が先。D-1=lid第4候補 location.pathname の /watch/lvN(現行3段全滅時のみ)。D-2=供給0時は「タイムシフト中」プレースホルダを描いてから幕を畳む。
- 段が空のとき何も出さない(段ラベル1行案は棄却=ユーザーの言葉は「消えてない」=完全除去)。
- fallbackの段/ロビー境界は**ID種別のみ**(数値ID=段・匿名系a:/無uid=ロビー)。表示名は使わない(enrich後着で籍が揺れる=churn源)。
- surfaceは**①と同じ不透明**を段行単位で。半透明棄却(透け防止毀損+①と見た目差の再導入)。

## 実装(v0.1.1120〜1122・各patch=1bump)

> 実装時の意図的差異(reality-checker留保への回答・2026-07-10): guideLinesMidAd は hasAd=false のとき
> 旧実装が「代入スキップ=前値保持」だったのを「''へ能動クリア」に変更した(不可視領域・画面差ゼロ)。
> これは(A)の「非表示側は hidden+innerHTML='' を能動的に書く=残骸ゼロ」方針と整合する意図的挙動。

### v0.1.1120 (A) guides:false
- renderStoryUserLaneDom.js paintStoryUserLaneDomFilled: `const showGuides = !(opts && opts.guides === false);`(省略時true=①③status完全不変)。抑止4点=空段ノート(syncStoryUserLaneTierEmptyNote第2引数に showGuides &&)・hintLink・ガイド帯5本(hidden=!showGuides+innerHTML='' を能動的に)・フッター。
- venueBar.js paint opts に `guides: false` 1行。recordedCommentRowsTotal/totalCandidates は残置(inert・将来戻すとき用)。
- テスト: guides:false で全ガイド/ノート/hint/foot 非表示・opts省略で既存同一・wiringスキャン。

### v0.1.1121 (C) surface行単位化
- venueBar.js :1677-1682(stack全面background)削除→ `.nlsb-venue-lane-stack .nl-story-userlane { background: var(--nl-surface); border; radius 10px; padding 6px; }` + gift/ad wrap(金色surface既存)配下は除外。.nlsb-lobby 据置。LANE_CSS_SYNC区間外。
- wiringテスト: stackセレクタにbackground無し/行セレクタに有り。

### v0.1.1122 (B) fallback匿名ロビー隔離
- venueLaneBuckets.bucketVenueLaneSeats: opts.anonymousToLobby===true で candidates を isLobbyBound(uid空 or isAnonymousStyleNicoUserId)で分割・戻り値に lobby 追加(opt無し=lobby:[]完全互換)。maxTotalは段側のみ。
- venueLaneMirrorSupply.composeVenueLaneBuckets: 入力 fallbackLobby を TIERSループ後に合流(venueLaneParityKey で mirrorKeySet と dedupe 必須=忘れると「ロビー重複」🔴・_venueTail/_venueTransient 付与)。mirror時のlobby集合は従来と完全等値(順序のみ変化=sig1回変化は仕様)。
- venueBar: bucket呼びに anonymousToLobby:true・compose入力に fallbackLobby・lobbyItems = laneComposed ? laneComposed.lobby : fallbackLaneBuckets.lobby・paintVenueLobby(items, {mirror}) でラベルに fallback時「・①と同期待ち」(ラベル代入はsigスキップ前=モード追従)。
- venueLaneParity: fallback側 midStr を ` / ロビー${lobby.total} 暫定${n}` に拡張(verdict⚪不変・lineだけ)。テスト期待文字列を同patchで更新。

## 偽陽性潰し
- ✅の3点一致条件は不変(guides/surfaceはタイル・census対象外)。compose dedupe を単体テストで固定。「まだ参加者がいません」の合算判定(:4212)はそのまま真。fallbackロビーのラベルで実態を正直化。ロビーsigの1回変化は仕様(churn警報と誤認しない)。

## 捨てた案
CSS隠し(構造依存drift)/会場専用paint複製(正本1つ違反)/段ラベル1行・guides enum化(YAGNI)/匿名を描かない(全員見られる約束違反)/表示名で段ロビー判定(churn源)/半透明surface/stack背景の単純削除(透け復活)/D同梱(白紙popupリスク・真因未確定)。

## 地雷
L14(共有rendererに第6段禁止=guidesはopt・lobbyはvenueBar内完結)/LANE_CSS_SYNC区間外/display:none禁止(P1機構不触)/compose dedupe忘れ=🔴/空段ノートはlane直付け=必ずsync関数経由で消す/storyLaneTierBodyKey不触/parity line変更はテストと同patch/recordedCommentRowsTotal残置/反映3手順併記/reality-checker中commit禁止/storage新キーゼロ。
