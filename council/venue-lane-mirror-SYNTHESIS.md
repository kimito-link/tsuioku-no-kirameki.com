# 会場の席を popup レーンと同じ顔ぶれ・順序にする — 司令塔の収束 (2026-06-22)

質問: `council/venue-lane-mirror-question.txt`
正本: reference_venue_is_popup_panel_clone.md(auto-memory・C:\Users\info\.claude\projects\...\memory 配下)
前提: 「会場の見せ方(席・3キャラ・吹き出し・VOICEVOX)は1mm 変えない」「並ぶ人の顔ぶれ・順序だけ popup レーンと一致」「bucket 順は popup と一緒・件数は会場を多く」(ユーザー確定)

## 会議(routed・design・成功2/4=gemma4 統括+deepseek 系。nvidia abort・groq 429)
3体一致の核心: **popup-entry.js:5238-5366 の candidates 生成手順を共有純関数に抽出し、popup と会場が両方呼ぶ。会場は抽出関数→bucket→flatten→venueRowsFromUserLaneCandidates に差し替える。venueRowsFromUserLaneCandidates の出力形は不変=見せ方は壊れない。**

## 司令塔が実コードで裏取りした決定的事実
- 真因確定: 会場(venueBar.js:2820/2832)は `userLaneCandidatesFromStorage` の候補を **bucket なし・整列なし・全員** venueRowsFromUserLaneCandidates に渡す。popup は同じ候補(を加工した candidates)を **bucketStoryUserLanePicks(_, 48)→flatten** で「りんく(t3)→こん太(t2)→たぬ姉(t1)」順に48件で絞る。これが顔ぶれ・順序の差。
- tier 決定の核心関数は **すべて src/lib の純関数に抽出済み**: buildStoryUserLaneCandidateRow(storyUserLaneRowModel.js)・explainSupportGridDisplayTier(supportGridDisplayTier.js)・shouldSkipStoryUserLaneCandidateByContamination(storyUserLaneContaminationGuard.js)・bucketStoryUserLanePicks/flatten(storyUserLaneBuckets.js)。
- 未抽出なのは「これらを呼んで candidates を組み立てる手順全体」(popup-entry.js:5238-5366 のループ=own-posted 判定・broadcaster guard・dedup・profileTier 付与・sort)だけ。これを1関数に抽出すれば会場も同じ顔ぶれ・順序を得る。
- ★リスク4(顔ぶれズレ)の回避見込み: 会場(venueBar.js:2787)は **broadcasterUid を storage から既に読んでいる**(_bcUidForExclude・LANE_OPTS.broadcasterUid)=broadcaster guard は会場でも効く。viewerUid/ownPostedUidSet/profileMap が会場で取れるかは PR1 で実機確認(取れなければ会場は『自分除外なし』で許容=会場に自コメ主が出ても実害小、過剰除外で他人を消すより安全)。

## 件数: 会議提案(min(48,cap))は不採用=ユーザー方針優先
会議は `limit=min(48, 会場席cap)` を提案したが、ユーザーは「件数は会場を多く」。よって **会場の limit は popup の48でなく会場の席 cap に合わせた大きい値**(VENUE_FULLSCREEN_MAX_SEATS=150 等)。bucket 振り分け順は popup と同一・件数枠だけ会場用に拡大。

## 収束した実装(最小ブラスト半径・各段で実機確認)

### PR1: candidates 生成手順を共有純関数に抽出(popup の挙動を1mm 変えない)
- 新 lib(例 `src/lib/storyUserLaneCandidates.js`)に `buildStoryUserLaneCandidates(input)` を抽出。入力=aggList/liveId/viewerUid/broadcasterUid/ownPostedUidSet/profileMap/storageCtx 等(popup-entry.js:5238-5366 が今使っている入力)。出力=sort 済み candidates(profileTier 付き)。
- popup-entry.js は抽出関数を呼ぶ薄い形に(characterization test=抽出前後で candidates が完全一致)。**この PR では会場は触らない**=popup の回帰だけ検証して push。
- ⚠popup 固有の前提(ownPostedUidSet・viewerUid 等)を引数化。グローバル/クロージャ依存を残さない(会場から呼べるように)。

### PR2: 会場の baseRows を bucket 済みに差し替え(見せ方は触らない)
- venueBar.js:2820/2832 の `venueRowsFromUserLaneCandidates(candidates)` を、`buildStoryUserLaneCandidates`→`bucketStoryUserLanePicks(_, VENUE_LIMIT)`→`flattenStoryUserLaneBuckets`→`venueRowsFromUserLaneCandidates` に差し替え。VENUE_LIMIT は会場席 cap(150 等)。
- 会場が渡せない popup 固有入力は既定値(viewerUid=''・ownPostedUidSet=空 等)。broadcasterUid は既存 _bcUidForExclude を渡す。
- ⚠会場の席数 cap 群(論理席/段数/visibleSeats)が bucket 後にさらに律速しないか実機確認。bucket(150)→cap(150)で整合するか。
- content.js/venue.js 二重バンドル。standalone は viewerUid 取れない=自分除外なしで許容。
- 実機確認: 「会場の席に並ぶ人が popup レーンと同じ顔ぶれ・同じ順(りんく→こん太→たぬ姉)になる・見せ方(席/吹き出し/3キャラ)は不変」。

## 壊してはいけない不変条件(実装中ずっと監視)
- 会場の見せ方(席・吹き出し・3キャラ・VOICEVOX)=venueRowsFromUserLaneCandidates の出力形を維持し入力だけ差し替える。
- popup の現挙動=PR1 は characterization test で1mm 不変を保証してから会場に触る。
- 席数 cap 群・content.js/venue.js 二重バンドル・standalone。

## ★前回(全画面てこ)の失敗を繰り返さない規律
- 各段で必ず実機確認してから次へ(全画面てこは実機未確認で push して却下=最大の失敗)。
- 推測でユーザーの言葉を補完しない。viewerUid 等が取れるかは実機/storage で確認。
- popup の本物を共有 lib で再利用(似せて自作=禁止・過去2回叱責)。

[[feedback_self_verifying_loop]] [[feedback_meeting_room_for_complex_tasks]] [[feedback_hoshinoromi_no_dead_links]]
