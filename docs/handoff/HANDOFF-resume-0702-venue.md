# 引き継ぎ (2026-07-02) — ①POP ちらつき/数字ズレ 全根治 完了 → 次は「会場モードをちゃんとする」

> 新チャットへ。会話全文不要。正本ルール= ~/.claude/CLAUDE.md(§1 ツール文字列を本文に書かない・§8 Claude 同時1セッション) +
> プロジェクト CLAUDE.md→AGENTS.md。詳細は memory/(下記)と council/pop-foundation-then-parity-SYNTHESIS.md が正本。
> **このファイルだけ読めば同じ轍を踏まず会場モードに進める**よう、現在地・地雷・設計材料をまとめる。行番号はズレるので必ず grep で現物確認。

## 0. 現在地(一行)
- ブランチ **feat/mirror-bundle-phase1**・HEAD **v0.1.1042 (30add716)**・copy:ext 済み(C:\nicolive-ext)。作業ツリーは council スクリプトの未追跡のみ=クリーン。
- **まだ master へ merge していない**(このブランチに v1036〜1042 の7版が乗っている)。PR/merge はユーザー明示依頼後。

## 1. このセッションで完了したこと(①POP を固めた・全て実機確認済み or verify:cc 全緑)
ユーザー正本の3段「①POPをちゃんと→全機能→①②③同一」の【①POP堅牢化】をほぼ完遂:
- **v0.1.1036**: ①②③の数字ズレ根治。5鏡(lane/statCards/topSupporters/northStar/comment)を**同一tickで旧5キーを1回の atomic set**に統合(src/lib/mirrorBundleFlushScheduler.js 経由)。②③読み手は無変更。実機で整合チェック全✅一致・鏡 capturedAt 同値を確認。
- **v0.1.1037**: 重い配信(backfill低%)で応援レーンがちかちか(heavyRace)を in-flight ガードで根治(watchMetaCache.heavyReadActive・withTimeout フェイルセーフ)。
- **v0.1.1038**: 北極星ランキング列(広告/貢献度/ギフト/応援者)の中身churn=diff-skip キーに freshness 時刻が入り毎paint再描画→本体キーから freshness 分離+in-place 更新(paintTopSupportRankStyleIntoElement.js)。
- **v0.1.1039**: 応援レーン(アイコン列)の fillLaneTier に段単位 diff-skip(renderStoryUserLaneDom.js)。
- **v0.1.1040**: 段別 再描画回数の計器(laneRepaintCounts)を状態速報に追加。**これが「消す側の盲点」を暴いた決定打**。
- **v0.1.1041**: 応援レーン本体(りんく/こん太/たぬ姉)のタイル出入り=empty-guides/reset の無条件 innerHTML='' 全消し→「同一配信で実タイルがあれば畳まない」(shouldKeepStoryUserLaneTilesOnEmpty・v1026戦略)。実機で本体停止確認。
- **v0.1.1042**: ギフト列/広告列のタイル出入り=syncStorySourceEntries が毎poll gift/ad picks を [] リセット→**配信切替時のみ**に移動。実機で「揺れは止まりました」確認。

**★ちらつき7版の教訓(最重要・memory に詳細)**: 一貫した盲点=**「DOMを消す/空にする側(innerHTML=''/hidden/reset/空branch)」に計器も diff-skip も無かった**(描く側=replaceChild-only ばかり数えた)。計器で「repaint≈0 なのに出入り」の矛盾を可視化して初めて消す側に辿り着いた。**churn調査の鉄則: 最初にその要素を消す/空にする全経路を grep で洗う**。ユーザーに「どの列か」DOMソースで特定してもらうのが最速(北極星と応援レーンの取り違えが序盤3版の空回りの元)。

## 2. 次にやること = 「会場モードをちゃんとする」(ユーザー最優先)
ユーザー: 「次は会場モードをちゃんとしたい」。**具体要件は次チャットでユーザーに確認すること**(このセッションでは詳細未ヒアリング)。会場モードの現状と設計材料は下記。

### 会場モードの現状(実コードで確定・memory/handoff_2026-07-01_venue_mode_add_icon_grid_diag.md が詳細正本)
- 会場=src/extension/venueBar.js の `renderSeats`。人物タイルは popup と同じ正本 `buildPersonTileEl`(src/lib/personTileDom.js)を共有(person-tile統一 完了済み・顔ぶれ/見た目は統一済み)。
- 参加者集約: src/lib/venueSeats.js `collectVenueParticipants`/`buildVenueSeating`。最大500席・入れ替え制・匿名 a: も全員主役。
- 既に入っている(2026-07-01 完了): 席の順位バッジ🥇🥈🥉(v1029)・🩺状態パネル(v1030・venueAvatarDiagLine.js)・応援者トップNバー(v1031・.nlsb-topbar)。
- ⛔ **凍結済みの地雷**: renderSeats 全体に「入力sig同一なら丸ごと早期return」を足すと**別surface(embed_watch のアイコン列)がちらつく**回帰(v1032撤回・機序未特定)。会場の軽量化で盲目sig skip は禁止。
- 会場設計正本: memory/reference_venue_mode_meeting.md / council/venue-*.md(role-separation・grid-diag 等)。

### 会場で「ちゃんとしたい」の候補(ユーザーに要確認・推測で着手しない)
- 会場の座席完全性が完全性スコアで唯一の不合格(75%・「会場座席」1項目)。状態速報で毎回出ている。
- 星野ロミ「作る人/見せる人を分ける」思想は会場で半分達成(venue-role-separation-SYNTHESIS.md)。完全分離は過剰と会議結論。
- **必ず EnterPlanMode で Plan 先行**(AGENTS.md §12.1・会場は複数ファイル/状態/描画ループ)。

## 3. 地雷マップ(このセッションで踏んだ/確定・繰り返し禁止)
- **popup-entry.js は max-lines 上限 21642 ちょうど**(eslint.config.js:153)。**ネット非増が絶対制約**。新ロジックは src/lib へ。上限引き上げ禁止。
- **refresh()/paint の read path 不触**(v948 2回却下)。**盲目的 sig skip/早期return 禁止**(v1032 別surfaceちらつき)。**sig/HTML/diff-skipキーに時刻を入れない**(v1022 明滅・v1038 freshness churn)。
- **②INLINE_PASSIVE は "読むだけ"**(storage 書込/キャッシュ禁止・v1023 真っ白)。
- **鏡は別経路(_northStarMirrorLanes/mirrorBundleFlushScheduler)**。giftThrowerPicks/adThrowerPicks は renderStoryUserLane の buckets/sig でのみ read(mirror publish には流れない)。
- **churn/ちらつき**: 描く側だけ見ると外す。消す/空にする全経路(innerHTML=''/hidden/reset/fillLaneTier 空branch/empty-guides)を最初に洗う。
- **サブエージェント(Explore/Plan)は根拠を外すことがある**(このセッションでも私の displaySrc 仮説を Plan agent が正しく反証・逆に私の empty-guides 仮説を trace agent が裏取り)。**結論は必ず実コードで裏取り**。ただし Plan agent の観点別検証は有効だった。
- **実機確認が要る症状は状態速報のコピペで完結させる**([[feedback-trust-status-report-over-browser-check]])。目視依頼の往復を避ける。計器が足りなければ「計器を足す」方向で直す(v1040 が好例)。

## 4. 残課題(会場と別・優先度低・やるなら別patch)
- **記録>本家コメ 104%(時系列 記録Δ≫本家Δ)**: 状態速報で 🟡要確認 が出ている(lv350875839: 記録1808/本家1745)。時系列計器が「記録の過剰増(二重計上)寄り」と言っている。**匿名主体(userId率99%だが a: 主体)配信で二重計上が起きているか要調査**。ちらつきと別系統。commentCountProvenance.js / content-entry.js の dedup(buildDedupeKey)を疑う。★ただし過去に「正常を🔴/🟡にする診断バグ」が頻発したので、まず実コードで因果を裏取り(AGENTS.md §12.7)。
- **ゆっくり顔(記名広告 uid='' がゆっくり顔で固定)**: adLanePicksFromRooms(uid 無しは yukkuriFace)+upgradeAnonymousAvatarImage(uid='' で発火しない)。別バグ・スコープ外。
- **②③同一化の仕上げ(patch B/C)**: council/pop-foundation-then-parity-SYNTHESIS.md 参照。patch A(v1036)で数字ズレは実機で消えた。B(読み手をバンドル優先+gen ガード)/C(parity 値突合)は refinement。今は不要なら後回し。

## 5. 開発フロー(AGENTS.md §12.5)
1変更=1patch。version 三者同期(package.json/extension/manifest.json/src/lib/changelog.js・summary 35字以内)= verify:bump が verify:cc に内包。
実装→`npm run verify:cc`(ハング回避・失敗時 .artifacts/verify-cc.log を Read)→ 新 export 足したら `npm run tree-map`(feature-map/site-health も)再生成→ 明示パス stage→commit(末尾 Co-Authored-By: Claude Opus 4.8)→ **push はユーザー明示依頼後**→`npm run copy:ext`(C:\nicolive-ext へ・反映3手順の要)。
ユーザー反映= pull(司令塔代行) → 拡張🔄リロード → watch F5。

## 6. このセッションの memory(正本・必要な行だけ読む)
- mirrors-written-per-key-per-tick-root-of-parity-lie.md (v1036・数字ズレ真因と鏡バンドル統合)
- embed-watch-heavyrace-inflight-guard-v1037.md (v1037)
- rank-lane-freshness-churn-v1038.md (v1038・北極星列)
- story-userlane-churn-filllanetier-v1039.md (v1039〜1042・応援レーンちらつき7版の総括+教訓。**次に churn を見たらまずこれ**)
- parity-verdict-checks-rowcounts-not-statcard-values.md (parity 検証の残穴・patch C 向け)
- MEMORY.md (索引)
