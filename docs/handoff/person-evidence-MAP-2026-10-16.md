# 地図(wayfinder): 「人×発言×段」を嘘なく出す — 会場ホバーカードの「発言1・たった今」なのにセリフが無い人

> 作成=司令塔(Claude)・2026-10-16。コードは変更していない。事実は `[file:行]` 付き。**【確認】=司令塔が実コードを読んで確認 / 【報告】=調査エージェントの報告(司令塔の裏取りは未了=仕様化前に確認すること) / 【推測】【未確認】**。
> 手順の正本: web-ios-android/docs/ai-workflows/WAYFINDER-TO-SPEC-HOWTO.md。お題の制約: 起動静穏窓・storage get 一括化・content-visibility・LOD・software canvas は再提案しない(実測で却下済み)/記録経路は触らない/一度出た人は消えない/本文を第三者へ自動配信しない(公衆送信権・/live/脈拍レーン却下済み=[[live-comment-body-display-rejected-2026-09-30]])/1版1変更・フラグ。

## 0. 先に結論(地図の読み筋)
キリン(広告 4,200pt の広告主)のカードが「発言 1(たった今)・いま喋っている・ここで1回」と出てセリフが無いのは、**セリフの取りこぼしではなく、そもそも発言が無いのに「発言1」と【捏造】されている**可能性が最も高い(実機の確証は【未確認】だが、コードの経路は【確認】済み。本人が書いたかも【未確認】=ユーザーも「分からない」)。
捏造の部品は3つ:
1. 件数の下駄: `preCount = Math.max(1, …|| 1)` が3か所 — [venueLaneMirrorSupply.js:154 付近](../../src/lib/venueLaneMirrorSupply.js) 【確認】, [venueSeats.js:879 付近](../../src/lib/venueSeats.js) 【確認】, venueLiveRoster.js hydrate(:232 付近)【報告】。「0 を 1 にする」。
2. 時刻の下駄: 鏡セルで storage 候補が無い uid は `capturedAt = _laneSortAt || fallbackAt`(=鏡の発行時刻)— [venueLaneMirrorSupply.js:150-151](../../src/lib/venueLaneMirrorSupply.js) 【確認】。鏡が新しい限り「たった今」になる。
3. 守りが【段名の例外処理】だけ: [venueHoverCard.js:171-186](../../src/lib/venueHoverCard.js) 【確認】は `tier==='ad'|'gift'` のときだけ「発言N」を出さず「広告(…)」「ギフト(…)」にする(2026-07-31 のユーザー指摘への対処。コメントに「count は最低1仕様で発言0でも1になる」と明記)。**2026-10-14 の v1620(私の変更)が広告/ギフトの支援者を「りんく(tier link)」へ昇格させた**ため([laneLinkTier.js:67-103](../../src/lib/laneLinkTier.js) 【報告】)、この例外が効かなくなり、同じ人が「発言1」と出る。セリフは `isThrowTier` でも `recentTexts: []`(支援者候補は commentCount:0・recentTexts:[] [laneLinkTier.js:90-100])で空。
→ 症状は「例外処理(段名)に頼って、人物モデルに【発言の証拠が有るか】を持たせていない」構造から出ている。段が変わるたび(v1620)に同じ嘘が再発する。


## 0b. 2つ目の原因(司令塔が実コードで確認・調査B報告と一致): 【実際に発言した人】のセリフが落ちる経路
キリンが実際に本文のコメントを書いていた場合でも、カードは空になりうる。経路は2つとも【確認】済み:
- **チャンク差分集計が本文を持ち回さない**: [venueIncrementalAggregate.js:66-100](../../src/lib/venueIncrementalAggregate.js) の `mergeUserLaneAggregates` は新規 uid の行を作るとき userId/nickname/avatarUrl/avatarObserved/liveId/commentCount/giftCount/_laneSortAt しか載せない(**recentTexts を落とす**)。会場のチャンク経路ではこれが `aggregatedCandidates`(venueBar.js:6090 付近【報告】)になるので、fallback 行(`venueRowsFromUserLaneCandidates`)と hydrate の入力に本文が最初から無い。
- **hydrate が候補の本文を読まない**: [venueLiveRoster.js:215-236](../../src/lib/venueLiveRoster.js) の `hydrateRosterFromCandidates` は `lastText:''`・`recentTexts:[]` 固定で、コメント(:227-228)は「候補は本文を持たないので空」と書くが、実際は userLaneCandidatesFromStorage.js:196-206 が recentTexts(最大5件)を持っている(古い前提がコメントに残っている)。
- 結果: 会場を開く前/開いた後でも storage 経由で来た発言は、count≥1(hydrate は max(1,…))なのに本文は空。ライブの touchRoster で新しい発言が1回来て初めて本文が入る。→ 「発言1・たった今(storage の _laneSortAt が新しいとき)・セリフ無し」が【実際に発言した人】にも出る。
つまり症状「発言1・たった今なのにセリフが無い」には【原因が2つ】あり得る: (A) 発言していない支援者(捏造・0b冒頭の経路)/(B) 発言した人の本文が経路で落ちる(本節)。どちらかは実機の診断(段・名簿・storage の本文)でしか区別できない。**設計は両方を同時に塞ぐ**(人物モデルに「発言の証拠」を持たせ、経路で落とさない)。

## 3b. 人物・件数・本文を作る系統(調査Bの表・司令塔が主要点を確認)
| # | 系統 | 正本 | 本文 | 件数 |
|---|---|---|---|---|
| A | storage集計→候補 | userLaneCandidatesFromStorage.js:92 | 5件(新しい順) | commentCount=行数・giftCount |
| B | ①popup描画(候補→名簿キーパー→件数順→段) | popup-entry.js:6303 / laneRosterKeeper / laneCountOrder / laneLinkTier | 候補行から(復活行は古い値・支援者だけの行は[]) | 候補の commentCount・💬は別途 stats.c |
| C | 鏡 | laneMirror.js | **先頭3件に切る**(:37,136) | top-level の count 無し・stats{c,g,a} のみ |
| D | 会場の鏡由来の行と段 | venueLaneMirrorSupply.js:128,176 | 鏡セルから | 席の preCount=会場自前の候補由来 max(1)・タイルは stats.c |
| E | 会場の在席名簿 | venueLiveRoster.js | ライブ発言の最大5件(hydrate は []) | commentCount(hydrate max(1)・以後ライブ+1) |
| F | 会場のチャンク差分集計 | venueIncrementalAggregate.js:66 | **持ち回さない(落ちる)** | commentCount/giftCount は加算 |
| G | 会場 fallback の段 | venueLaneBuckets.js:180 | 載せない | participant 由来 |
| H | 受動ビュー②の鏡描画 | popup-entry.js:6746 | 鏡セルから | 鏡 stats |
会場の基礎行は【鏡由来】【名簿由来】【storage集計由来】の3つの書き手が並立し、最後に書いた者が勝つ(venueBar.js:5909-5944, 6293, 6089-6112【報告】)。席ありの経路は resolveVenueHoverFacts を通らない(venueHoverFacts.js:6 のヘッダ「3経路すべて通る」は実コードと食い違う)【報告】。

## 1. 入口になる画面
- ①POP(サイドパネルの応援レーン・グリッド)=popup-entry.js / ②会場(視聴ページ上の会場バー)=venueBar.js のホバーカード / ③別窓 / ④純Web(app/live-view)/ ⑤/live/(src/extension/live-ranking-entry.js・サーバ集計)。今回の症状は②会場のホバーカード。

## 2. 関係する主要ファイルと責務
| ファイル | 責務 | 備考 |
|---|---|---|
| src/lib/userLaneCandidatesFromStorage.js | 保存行→人物候補(commentCount=行数 :182/giftCount/recentTexts/_laneSortAt) | requireText:true なら本文空の行は除外 [:100-105]【報告】。会場 LANE_OPTS(venueBar.js:6064-6067)・popup(popup-entry.js:5703,7844)は true【報告】 |
| src/lib/laneLinkTier.js | 支援者(gift/ad ピック)の uid 集合・tier 降格・**mergeSupporterLinkCandidates**(commentCount:0 の候補を tier3 で追加) | v1620 で追加(私の変更) |
| src/lib/laneMirror.js / venueLaneMirrorSupply.js | 鏡の書き出し/復元・`venueRowsFromLaneMirror`(鏡セル→席の行。preCount/capturedAt の下駄) | 鏡は①→②③④の供給 |
| src/lib/venueSeats.js | `venueRowsFromUserLaneCandidates`(:879 下駄)・`collectVenueParticipants`(count 加算・lastAt) | |
| src/lib/venueLiveRoster.js | 在席名簿: touchRoster(本文必須・commentCount+1)/hydrateRosterFromCandidates(commentCount を max(1,…)・lastSeen=_laneSortAt)/rosterToVenueRows | 席なし経路の事実の出所 |
| src/lib/venueHoverFacts.js | ホバーの数字の出所を1本に決める(null を 0 と言わない設計) | 「registered があれば early return」等の毒テスト付き |
| src/lib/venueHoverCard.js | カード文言(buildVenueHoverCardModel)。tier 出し分け(:171-186)・isThrowTier で本文を出さない | |
| src/lib/venuePresenceNote.js | 「いま喋っている」(lastAt<60s)・「ここで1回」 | :119-133 付近【報告】 |
| src/lib/venueSpeechCensus.js | カードに本文が出たかの観測(🔴の根拠) | 観測のみ |
| src/lib/liveCommentTally.js / liveLaneBuckets.js / liveRankingView.js | **/live/ の集計(配信者除外・userId空は捨てる・commentNo で重複排除・件数降順・段=link/konta/gift/tanu)。本文は持たない** [:9-11]【報告】 | 拡張は laneImportShadow.js 経由で【影運用のみ】使用(表示には使わない)[popup-entry.js:5502,7209]【報告】 |
| api/live-recent-comments.js | /live/ のホバー本文: 対象 uid(rankers≤10+要求 uid)を NDGR 遡り(`crawlNdgrBackward`)で直近5件 [:92-166]【報告】。保存しない・60秒メモリのみ・POST・ロック | 拡張にこの経路は無い |
| src/lib/ndgrChatRows.js | NDGR chat→行。**本文空・ギフトお知らせ文(parseGiftCommentText)・採用条件を満たさない行は捨てる** [:37-49]【報告】 | 記録経路(content-entry:482, page-intercept:11, backfill-sw:9)と /live/ が同じ関数 |
| src/lib/recentTextRing.js | `formatRecentTexts`/`pushRecentText`/RECENT_TEXT_KEEP(=5) | 拡張・/live/ 共通の部品 |

## 3. データが流れる順番(症状の経路)
(1) 広告/ギフトのピック(nls_nicoad_api_ranking_* / nls_koken_api_contrib_* / nls_gift_users_*)→ STORY_SOURCE_STATE.adThrowerPicks / giftThrowerPicks [popup-entry.js:7721-7745]【報告】
(2) popup が `mergeSupporterLinkCandidates` で、実サムネのある支援者を tier3(りんく)候補として追加([popup-entry.js:6520]【報告】・commentCount:0/recentTexts:[])
(3) 鏡へ書き出し(laneMirror: セルは userId/title/recentTexts/stats)
(4) 会場は鏡を優先 → `venueRowsFromLaneMirror`: storage 候補(byUid)に居なければ cand=null → **preCount=1・capturedAt=鏡の発行時刻** 【確認】
(5) `collectVenueParticipants` → participant{count:1, lastAt:鏡の時刻} [venueSeats.js:139-172]【報告】
(6) venueBar.js:5533 付近でホバーデータ化(count=participant.count・lastAt・tier=laneTierByUid.get(uid)・recentTexts=participant.recentTexts か鏡セルのもの)【確認】
(7) カード: tier が link なので「発言 1(たった今)」+「いま喋っている・ここで1回」。本文は空。
※席なし(広告/ギフト段のタイル)経路は resolveSeatlessHoverData → liveRoster.get(uid) → resolveVenueHoverFacts [venueBar.js:2850]【確認】。名簿に居なければ count=null=「会場に居る」と言うだけ(嘘は出ない)。

## 4. 既存の設計判断と根拠(壊してはいけない境界)
- 「null を 0 と言わない」: venueHoverFacts.js 冒頭の設計(2026-08-29)。「知らない」と「0 回」を区別する。今回の下駄(max(1,…))はこの原則の【逆】= 0 を 1 と言っている。
- 「応援者は主役・ID だけ名前だけの中途半端な表示は原則違反」(AGENTS.md §3.5)— 広告/ギフトの人は隠さない(表彰)。だが「発言」と偽らない。
- 「ギフト/広告段で件数を出すと『発言1』の嘘になる」(venueHoverCard.js:178-180 のコメント)= 過去に同じ嘘をユーザーに指摘され、段名の例外で塞いだ。→ 今回は段が変わって再発。
- 本文の自動配信は不可(公衆送信権): [[live-comment-body-display-rejected-2026-09-30]]。ホバーは個別・能動操作が起点だから /live/ でも許容されている(1人分・サーバメモリ60秒)。拡張は【自分の端末の記録】だけを自分に見せる=別の性質。
- 一度出た人は消えない(縮小ガード・名簿キーパー)/記録経路は触らない。
- 「集計器を1本にする計画(I2→I3)」: laneImportShadow は影運用(表示不変)[improvementHistory.js:2025]【報告】。[[live-to-extension-absorb-designed-2026-10-06]] / 計画ファイルの P2〜P4。

## 5. 変更すると壊れうる箇所
- venueHoverCard.js の tier 出し分けに依存するテスト・venueHoverFacts の毒テスト・venueSpeechCensus(🔴判定)・3経路パリティ(laneTilePresentation.parity.test.js)・鏡の契約(laneMirrorContract.js・個別列挙3か所=[[cross-repo...]]のメモ)。
- `preCount` の最低1は **VIP 常連光らせ**のスコア・席の並びの前提になっている可能性 [venueSeats.js:879 コメント「集約済みの実数(VIP常連光らせのスコア用)」]【確認】。0 に戻すと光り方/並びが変わる【推測】。
- mergeSupporterLinkCandidates(私の v1620)の候補は `entry.userId` 形で、storage 候補(`c.userId`)と形が違う [venueLiveRoster.js:219]【報告】。

## 6. 未確認の前提・追加調査が必要な点
- 【未確認】キリンが実際に本文のコメントを書いたか(ユーザー「分からない」)。書いていたなら、本文が storage 行に有るのに `byUid` に載らない別の欠陥(候補集計の cap・requireText・uid 形式の差)を疑う必要がある。→ 次の速報で出る診断(段・名簿の本文有無)が1回で切り分ける(下の質問)。
- 【未確認】実機で支援者セルの tier が本当に link として会場に渡っているか(venueBar の laneTierByUid の中身)。
- 【報告】popup-entry.js:6520 付近の merge 呼び出しと、会場が鏡由来のとき tier を鏡のセルから引くのか別経路か。
- 【未確認】ndgrChatRows は広告お知らせ文(parseNicoadCommentText)を除外していない(import が parseGiftCommentText のみ・ndgrChatRows.js:7)【報告】。広告お知らせ文が「発言」として記録されている可能性。実データで有無を確認していない。
- 【未確認】スタンプ/運営コメントの扱い(専用判別コードが見つからない)。
- 【未確認】userRooms.aggregateCommentsByUser など requireText 未指定の集計が text 空を数える経路が、他の画面に残っているか。
- 【報告】personProfiles.js:127 は gift 以外の行を text 空でも commentCount+1(ギフト行の判定が userLane と同基準かは要確認)。

## 7. 実装前に決める必要がある質問(Fable に答えさせる)
Q1. 「人物モデルが発言の証拠を持つ」設計: `evidence = { comments: number|null(実行数。不明は null), lastCommentAt: number|null, lastTexts: string[], gifts, ads }` のような 1 つの型を正本にし、UI は `comments===null||0` のとき「発言」を一切出さない(段名の例外処理を廃止)。この型の置き場所(L0 の新規 lib か、既存 venueHoverFacts の拡張か)と、roster / mirror / candidate の3系統すべてがこれを通る方法(1か所に関所)。
Q2. 下駄 `Math.max(1,…)` 3か所の扱い: 0 を許す(null/0 を伝える)ように直すと VIP 常連光らせ・席の並びがどう変わるか。互換のため「表示用の count」と「並び/VIP 用のスコア」を分離すべきか。
Q3. 時刻の下駄(鏡の fallbackAt)の扱い: 実コメントの時刻が無い人の `lastAt` を null にして「たった今/いま喋っている」を出さない設計と、鏡の発行時刻を何に使うか(「在席」の根拠だけ)。
Q4. 広告/ギフトの支援者のカードに何を出すか(広告 4,200pt・広告でひとこと=advertiserName 原文・ギフト額)— /live/ のタイルが持つ `pts/point/hover` と揃えるか。これは「/live/ の完全移植」の入口として妥当か。
Q5. 本文(セリフ)の取得元を増やすか: (A) 拡張の記録だけ(今のまま・無い人は無いと言う)/(B) 本文が空で count>0(実発言あり)のときだけ、/live/ と同じ NDGR 遡り(`ndgrBackfillCrawl`・拡張側に既にある)を使う。B の場合の法的な整理(自分の端末の記録を自分に見せる=可/第三者への配信なし)と、費用・遅延・失敗時の表示。
Q6. 3画面パリティ: ①POP のグリッド/レーン、③別窓、④純Web にも同じ嘘(発言1)が出ていないか。直す場所は1か所(人物モデル)にできるか。
Q7. 移行: 旧鏡(下駄込みの count を持つ)との互換・フラグ・段階導入・ロールバック。`laneImportShadow`(影運用)との関係(I3 の表示切替の前提になるか)。
Q8. 検証: 実機での確認方法(状態速報に何を出して「発言の嘘が 0 件」を機械判定するか)。venueSpeechCensus の 🔴 条件の見直し(「発言ありなのに空」を「発言の証拠ありなのに空」に)。

## 8. 先に決めておく追加メモ
- 診断(次の状態速報用・小さい): 空カードの detail に「段」と「名簿の本文有無」を足す案(破棄済み・必要なら再作成)。設計が固まる前に実機の切り分けが要るなら先に出す。
