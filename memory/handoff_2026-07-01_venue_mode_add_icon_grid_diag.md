# 引き継ぎ: 「アイコン列・グリッド・診断を表示」を会場モードの人に加える

作成 2026-07-01(拡張 v0.1.1028 時点)。棚上げ作業の再開用。**このファイルだけ読めば新チャットが同じ轍を踏まず進められる**よう、
現状・接点・地雷・段階導入をまとめる。行番号は実装が動くとズレるので、必ず自分で grep して現物を確認すること
(下の関数名で grep すれば見つかる)。

## 0. やること(要件)
popup の応援コメント可視化ブロック「アイコン列・グリッド・診断を表示」の【グリッド】と【診断】を、そのまま
**会場モード(venue)の人表示にも加える**。会場の人(座席・来場者)に、popup と同じグリッド(参加者ランキング)と
診断(userId率・アバター解決率等)を出す。

## 1. 現状(実コードで裏取り済み・2026-07-01)
person-tile 統一(council/person-tile-unify-SYNTHESIS.md)は**完了済み**:
- 会場(src/extension/venueBar.js の renderSeats)は、popup と同じ人物タイル正本 `buildPersonTileEl`(src/lib/personTileDom.js)を使う。顔ぶれ・見た目は既に統一。
- **だが会場は `userThumbGrid`(グリッド)も `storyAvatarDiag`(診断)も使っていない**(venueBar.js を grep して0件で確認)。= グリッドと診断が会場に未実装 = これが棚上げされている作業そのもの。

「アイコン列・グリッド・診断」の実体(popup 側):
- **アイコン列(応援レーン)**: popup-entry.js `renderStoryUserLane` → story/renderStoryUserLaneDom.js `paintStoryUserLaneDomFilled`。※これは person-tile統一で会場に既にある(会場の席=アイコン列相当)。加えるのはグリッドと診断。
- **グリッド(参加者ランキング/カテゴリ)**: src/lib/userThumbGrid.js `categorizeUsersForThumbGrid` + personTileDom.js `buildPersonTileEl`。popup-entry.js `renderUserRooms` が呼ぶ。
- **診断ブロック**: src/lib/storyAvatarDiagLine.js `formatStoryAvatarDiagLine` / `buildStoryAvatarDiagHtml`。userId取得率・アバター解決数・アイコン種類等の技術診断。

会場の実体:
- 参加者集約の正本: src/lib/venueSeats.js `venueParticipantKey` / `collectVenueParticipants`。アクティブ=素性(userId)が観測できた人(匿名 a:xxx も数値IDも全員が主役)。最大500席・入れ替え制。
- 描画: venueBar.js `renderSeats`(→buildPersonTileEl)。データフロー: nls_cdb_summary(comeviewRows) → collectVenueParticipants → ひな壇DOM。
- **会場固有の診断ブロックは無い**(人物タイルだけ)。

共通の入口(グリッド/診断の入力に流用可):
- src/lib/userLaneCandidatesFromStorage.js: popup も会場も使える。rows+liveId+opts → userId単位で集約済みの候補配列。これをグリッド(categorizeUsersForThumbGrid)と診断(storyAvatarDiag)の入力に再利用できる=新規集約を書かない。

## 2. 加える接点(seam)の候補
会場の描画パイプライン(venueBar.js): buildVenueMountedBody → collectVenueParticipants → buildVenueSeating → renderSeats。
- **グリッド**: ひな壇の【上】に固定バーで「応援者ランキング」を出す(Option A・推奨)。データは userLaneCandidatesFromStorage、描画は buildPersonTileEl 再利用。上位10-20人 cap・高さ固定(下の席と競合しない)。※右サイド案(Option B)はマルチモニタ前提で優先度低。
- **診断**: 会場バー下部に折りたたみ「🩺 会場の状態」(席数/参加者総数/超過数、userId率、アバター解決率、読み上げ/吹き出し発動、ギフト履歴状態)。storyAvatarDiagLine の流儀を venue 版に翻訳(venueAvatarDiagLine.js 新規)。

## 3. 地雷マップ(踏むと危険・捨てるべき案)
1. **会場×グリッドの高さ振動**(最重要): 今日 v0.1.1026 で「広告列が出たり消えたりでアイコングリッドが揺れる」を
   root で直したばかり(popup-entry.js の adRanking 空畳み抑制)。同じパターンが会場×グリッドで再発しうる。
   グリッドが非同期でアイコン解決/データ遅延すると高さが 0↔本体で振動し下の席が揺れる。
   → **対策(必須)**: (a)一度データを描いたら一瞬の空では畳まない(v1026 と同じ戦略・実データ有無で判定)、
   (b)グリッドの高さを固定(css)、(c)sig ガードは capturedAt を入れない(v0.1.1022 の明滅根治の教訓=時刻で再描画しない)。
2. **会場 hot path の重さ**: renderSeats は毎フレーム走る。グリッド/診断を足すと DOM 走査/計算が増える。
   → 上位N人 cap、診断は1回計算→sig 照合で無変化 skip、増分更新(venueBar は mergeUserLaneAggregates を既に持つ)。
3. **passive/鏡化するなら①の描画opts を全部揃える**: 今日 v1024→1028 で②応援プレビューの応援者ランキングを鏡化した際、
   ①と同じ描画 opts(anonymousIdenticonResolver / defaultThumbSrc / anonymousFallbackThumbSrc)を渡し忘れ、匿名の顔が
   崩れた(blank.jpg)。会場でグリッドを描くなら、popup と同じ opts を全部渡すこと(resolver 漏れ=匿名の顔崩れ)。
   [[preview-passive-was-running-full-refresh]] [[parity-check-must-compare-values-not-just-ack]] 参照。
4. **来場者数(PV) vs 超過アクティブの取り違え**: 「来場 N人」は PV 的延べ(背景群衆で表現)。グリッドは「応援者ランキング」で
   PV ランキングではない。表記を明確に。
5. **drift(会場と popup の追従漏れ)**: グリッド/診断 lib は src/lib に集約し両者から read-only 参照(write は popup だけ)。
   会場に独自集計を書くと popup と食い違う(person-tile統一前の失敗の再来)。
6. **max-lines**: popup-entry.js は max-lines ラチェット上限ギリギリ(v1028 で 21629)。会場は venueBar.js だが、
   純関数は src/lib に切り出してテストする(popup-entry を太らせない・[[extension-reflected-only-after-copy-ext]])。

## 4. 段階導入(進捗)
- Phase 1: 現状把握(コード不変) — 完了。
- ⭐ **会議 2026-07-01(council/venue-grid-diag-SYNTHESIS.md)で Phase 2 を上書き**: 独立グリッドバー(Option A)は
  「席=既に全員が座っている」ので二重表示で冗長・高さ振動リスク増、と critic/fast が指摘。**まず席タイルに
  上位N人の強調を入れ、独立バーは"席で埋もれる"と実機で分かってから**(検証ファースト・過剰実装回避)に方針変更。
- Phase 2a(席の順位バッジ)— **完了 v0.1.1029(commit 3233c3cd, branch feat/venue-rank-badge)**。
  - ⭐ **非自明な発見**: 会場は既に貢献度スコア上位8人を金色オーラ(nlsb-seat-regular)で強調済みだった
    (venueSeats.js selectVenueVipRegularKeys=内部でスコア順ソート済みなのに Set で順序を捨てていた)。
    = 新規グリッド実装は不要で「順位の可視化」だけが欠けていた。venueUserThumbGrid.js は作らなかった。
  - やったこと: venueSeats.js に rankVenueContributors(順位の正本)を切り出し、光らせ判定と順位が同一スコア源を
    共有(drift 無)。selectVenueTopRankKeys + buildVenueSeating の seat.venueRank。venueBar は data-venue-rank →
    CSS ::after で🥇🥈🥉を席右上に絶対配置(高さ不変=v1026 振動を踏まない)。
  - ⭐ **ユーザー指示**: ピカピカ光る演出は不要 → 金色オーラ(nlsb-seat-regular glow)は廃止(vipRegular:false)。
    順位バッジのみで上位を示す。
- Phase 2b(独立グリッドバー)— **完了 v0.1.1031(commit e6759612)として実装**。実機868人で席の🥇🥈🥉が
  小さすぎて見えず「会場が変わってない」評価→ひな壇上部に「応援者トップN」固定高バー(顔を大きく並べる)で可視性回復。
  - ⭐ **重要な会議(council/venue-role-separation-SYNTHESIS.md・5体ほぼ完全一致)**: ユーザーが「popup のアイコン列・
    グリッド・診断をそのまま会場へ運ぶのは大丈夫か」「星野ロミ記事(作る人/見せる人を分ける)の思想は入っているか」を問うた。
    答え=(Q1)**そのまま運ばない(C案)**。popup=匿名除外・数値ID+サムネ揃いだけ上段/会場=匿名も全員主役 で思想衝突。
    (Q2)分離は**半分だけ**達成(診断の鏡 venueSeatsDiag と"レーン正本を映す"経路は分離済み・順位/アバター率は見せる側計算)。
    **完全分離は過剰**(会場はリアルタイム描画ループ)。目指すのは「計算1回→sig→貼る」の役割分担。可視性は分離と別問題。
  - やったこと: venueSeats.js buildVenueSeating が topSupporters(スコア降順・順位付き・匿名含む・rankVenueContributors
    共有=drift なし)を返す。venueBar に .nlsb-topbar(固定高72px・grid 行・上位3は🥇🥈🥉+金銀銅縁・静的)。sig 無変化 skip・
    一度出したら空で畳まない(高さ振動対策)。席タイル生成を buildVenuePersonTile 共通ヘルパに切り出し席とバーで同じ描画
    (匿名の顔崩れ=地雷#3 を構造的に防止)。テスト+3。
- フェーズ1(hot path 防御)— **完了 v0.1.1032(commit a220e310)**。renderSeats は commit/poll のたびに
  buildVenueSeating(集約+順位×3経路+席割り)を毎回走らせていた。venueSeatsInputSig(新・純関数)で入力
  (発言数/ギフト/サムネ+グロー段階+昇格数)の sig を作り、前回と同一なら renderSeats を丸ごと早期 return。
  リサイズは perRow 再計算が要るので onVenueResize で sig 無効化+席1回引き直す保険(スクロールは対象外)。
  - ⭐ **レビューで見つけた drift(修正済・重要)**: 会場 rows は count/isGift でなく **preCount/preHasGift/preGiftCount**
    を持つ(venueRowsFromUserLaneCandidates/rosterToVenueRows)。sig が実フィールドを見ないと発言増/ギフトで
    sig 不変=順位バッジ/トップNバーが**古いまま(stale)**。collectVenueParticipants が読む素(:140-142)に揃えた。
    テストも「count/isGift 直接注入」から「preCount/preHasGift 実データ形状」に修正=drift を隠さないように。
  - code-reviewer 独立レビュー: streak decay/spoken 入替(delete が無いので size 単調増加)/resize 保険/TDZ/
    時刻除外 は全て問題なし確認。gift drift の1点のみ指摘→修正。
  - ⭐ **次に重ければ**: 実機868人で計測(フェーズ0)して sig スキップの効きを確認。それでも重ければ SW 集計へ
    (ただし会議=完全分離は過剰・退化リスク。まず sig スキップで足りるか実機判断)。
- Phase 3(診断)— **完了 v0.1.1030(commit 7a77c862, branch feat/venue-rank-badge)**。
  - 会議 council/venue-diag-SYNTHESIS.md に収束: 席の【外】の overlay(既存 .nlsb-roster-panel 流用)・既定畳む・🩺ボタンで開く。
    sig は件数のみ(capturedAt 抜き)。storyAvatarDiagLine は popup 別 typedef で型不整合=流用不可→新規 venueAvatarDiagLine.js。
  - やったこと: src/lib/venueAvatarDiagLine.js(computeVenueParticipantAvatarCounts=サムネ判定は席描画と同じ
    participantHasEffectiveThumbnail で drift なし / venueDiagSig=件数のみ / buildVenueDiagHtml=PIIなし件数)。
    venueBar に🩺状態ボタン + overlay パネル。開いてる時だけ sig 無変化なら DOM 触らず(hot path 無汚染)。
    新 storage キー増やさず既存 KEY_VENUE_SEATS_DIAG 相乗り。テスト12件。
  - ⭐ **レビューで見つけた drift(修正済)**: lead は participantCount(全参加者・上限なし)、faceLine は total
    (=seats.length・上限 VENUE_FULLSCREEN_MAX_SEATS=500)で母集団が違う。500人超配信で「N人参加なのに応援は500人だけ?」と
    矛盾表示になる。→ faceLine を「席にご案内できた N 人のうち…」と席ベース明示に変更し母集団を分離。再発防止テスト追加。
- Phase 4(統合・退化確認)— **完了**: verify:cc 全緑・code-reviewer 独立レビュー済(高さ振動/hot path/drift/capturedAt/
  TDZ/リスナー対 すべて OK、drift 1件のみ指摘→修正)。残る実機確認は「500人超配信で🩺の lead と faceLine が
  矛盾して見えないか」だけ(静的には安全)。**Phase 2b(独立バー)のみ実機判断待ちで棚上げ**。

## 5. 参照資料(実在確認済み)
- council/person-tile-unify-SYNTHESIS.md: 人物タイル正本化・段階導入(第3コミットで venue 席組込み完了・グリッド/診断は未)。
- memory/reference_venue_mode_meeting.md: 会場設計正本(ひな壇/500席/入れ替え/吹き出し+読み上げ+ギフト。グリッド/診断の会場加装は未検討)。
- memory/handoff_2026-06-13_venue_polish.md: 会場 polish 引き継ぎ。
- v0.1.1026(広告列の揺れ根治・git log で 4962209e): 会場×グリッドの揺れ対策の先行事例。

## 6. 反映手順(新チャットへの注意)
拡張を直したら `npm run build` → **`npm run copy:ext`** → chrome://extensions で🔄 → watch F5。copy:ext 漏れは
「反映されない」の主因([[extension-reflected-only-after-copy-ext]])。検証は状態速報のコピペで完結させる
([[feedback-trust-status-report-over-browser-check]])。実機の目視確認をユーザーに頼む往復は避ける。
