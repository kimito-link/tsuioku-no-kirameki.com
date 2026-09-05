# 応援レーン「描画🔴」匿名主体での誤報 根治 — v0.1.1006 (2026-06-30)

## 結論
master HEAD = **v0.1.1006 (bcd0666e)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1006。
匿名(184)主体の配信で「応援レーン描画🔴(供給N件→画面0件)」が出ていた誤検知を根治。診断だけ修正。

## 真因(実コードで確定・Explore は5回目の外し)
- 実機 lv350860018(ねぎちゃん): withUidPercent=2.6%=ほぼ全部匿名。storyUserLaneRenderProbe
  entriesLen=2・domTilesPainted=0・lastReachedStep=done。
- 応援レーンの顔タイルは **userId(識別子)を持つ人しか乗らない**(popup-entry.js:5148 `if(!uidRaw) continue` /
  :5156 numeric uid で配信者未確定なら continue)。匿名184は DOM にも識別子が無く userId 解決不能=仕様。
  → 匿名主体の配信は「コメントは供給されても乗れる人が居ない」=0タイルが**正常**。
- だが診断 buildStoryUserLaneRenderDiag は entries>0 && dom===0 を一律 source_but_no_dom(🔴)に。
  = v0.1.1004(読み上げ stale)・v0.1.1000(貢献度cap)と**同型の「正常を🔴にする診断バグ」**。
- ★Explore は「複数配信の lid 取り違えで別配信汚染→contamination guard で全除外」と結論したが**不採用**:
  最新スクショは mirrorCells=-1(エージェントは古いスクショの55を使用)・withUidPercent=2.6% で
  匿名主体という単一説明で足りる。lid汚染の根拠は実コードに無い。→ 今セッション5回目の外し=必ず実コード裏取り。

## 修正(記録/描画=STORY_SOURCE_STATE #1地雷には触らず診断だけ)
- storyUserLaneRenderProbe.js: buildStoryUserLaneRenderDiag(probe, ctx) に ctx.withUidPercent。
  heavy 経路 entries>0 && dom===0 でも **withUidPercent <= LANE_ANON_DOMINATED_MAX_PCT(10%)** なら
  verdict=**empty_source_anonymous**(正常・✅)。source_but_no_dom(🔴カード)に昇格しない。
  userId付きが一定数ある配信の本物の0タイルは従来どおり🔴。
- aiShareFullText.js: fastDiag.content.giftDiagnostics.commentObservability.savedCommentsUidStats.withUidPercent を渡す(新規readゼロ)。

## verify
- verify:cc 緑(匿名2.6%→empty_source_anonymous・🔴カード無し・✅行 / userId100%で0タイル→source_but_no_dom / 未指定→後方互換)。
- 出荷バンドル probe: 匿名2.6%→✅カード無し・userId100%→🔴カード有り を確認。

## 教訓
- 「供給あるのに0描画」は必ずしも描画停止でない。応援レーンは **userId 必須**=匿名主体では0が正常。
  診断は「供給=描けるはず」を前提にしない。withUidPercent で母数を見る。
- エージェントの「lid 汚染」系の結論は派手だが、最新の実データ(mirrorCells/withUidPercent)と必ず照合。

## 残(本物・別系統・未着手)
- ②北極星鏡の取りこぼし: 実機 拡張2→鏡0・拡張10→鏡7。**cap(10)に当たらない件数で落ちる**=v0.1.1000 の
  cap クランプでは説明できない本物のコピー漏れの疑い。北極星鏡 publish 経路(publishNorthStarMirror/
  refreshNorthStar*LaneAsync)で件数が落ちる箇所を要調査。
- ③記録101%(欠落0%・本家新鮮): v0.1.1003 の鮮度クロックでも救えない=本物の軽微な二重 or 母数差の核心。
  officialCommentHistory(記録が伸びる間 本家平らか)の見える化が次の切り分け候補。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
