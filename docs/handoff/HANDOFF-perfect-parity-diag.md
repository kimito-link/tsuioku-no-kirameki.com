# 引き継ぎ: 完璧な診断シート(4面パリティ・トークン)設計 — Fable設計完了・実装待ち

_作成: 2026-07-03 / 司令塔Claude(Opus 4.8) / 調査+会議+Fable設計 完了 / 実装は別モデル・別チャット_

## ユーザー要望
状態速報を「①応援レーン(popup)=②応援プレビュー=③WEB公開=④会場 の【4面が完全一致か】が3秒で分かる・嘘をつかない診断シート」に。今日 POP56 vs 会場187 のズレを状態速報が✅と誤表示した/0件バグ/重さ(7.7秒)を見逃したのが不満の根。

## ★Fableが実コードで確定した重大事実
1. 会場突合は【新規readゼロ】で足せる: venueSeatsDiag も laneDiag も既に buildAiShareFullText の引数に渡っている(aiShareFullText.js:69)。buildParityVerdict(:146-153)に渡し込んでいないだけ。
2. ★致命の穴: venueSeatsDiag に liveId が無い(venueSeatsDiag.js:8-21・venueBar.js:3064-3082 の obs)。前配信の残骸を現配信と突合すると嘘の🔴。会場は activeLiveId を持つ(venueBar.js:3120)ので publish に1フィールド足す(write側のみ・read増ゼロ)。
3. ★「±2秒窓」は却下: 各writer 3秒min-gap + status extras 12秒キャッシュ。±2秒だと全ペア永遠🟡=偽陽性製造機。→ W_hard=20秒(厳密突合)/W_soft=180秒(欠落だけmismatch・件数差はpending)/W超=pending。数式=3s+12s+上流更新の半分。
4. ★重い7.7秒の真因: summaries1777/backfill1764/lives1482 が一様に~1.5秒。backfillは1キー小get・livesはstorage読まないtabs.queryなのに各1.5秒=payloadでも集計でもなく【storage往復1回あたりの輻輳遅延】(backfill走行中の書き込みと競合)。paint11ms・churn無しが傍証。診断集計(parity roll-up)は純関数でコアを1msも重くしない。
5. ①vs③突合は liveviewPublishSelfDiag.consistency(:243-307)に既存。「意図差(cap/鮮度)はnormal/cappedでmismatchにしない」3段階判定の前例あり=会場突合もこの流儀を踏襲(judgeNorthStarConsistency の cap10クランプ等)。
6. parityVerdict.js:26-135 は最初の1件だけ返す early-return 決定木。mismatches[]列挙構造は無い=pairs構造に組み替える。

## 設計(Phase別)

### Phase1: トークン+会場突合(新規readゼロ) ← まずこれ
- parityVerdict.js の戻りを拡張(★既存4フィールド verdict/reason/nextAction/code は意味も値も不変=②バッジ buildParityBadge・jsonBlob相乗りが無改修で生存):
  `{ verdict, reason, nextAction, code, pairs:[{pair,label,state:'match'|'mismatch'|'pending'|'explained',diffType,details:{left,right,tsGapSec,reason}}], counts:{match,mismatch,pending,explained} }`
- overall導出(嘘をつかない核): mismatch≥1→'mismatch' / mismatchゼロでpending>0→'pending' / 全match/explained→'ok'。★explained>0時は reason に意図差を必ず明記(例「✅一致(意図差1: ①POPは上限48で切出し・④会場は全員187人)」)。**✅でも件数が違う事実を1行に載せる=嘘をつかない実装定義**。
- 突合ペア(全て既存値のroll-up・新規readゼロ):
  - pop_web_lane/northstar×2/comment = 既存 consistency を pairs に写像。
  - pop_preview_lane/supporters = previewAck.laneTiles/supporterRows と突合(ack古い/未開は pending)。
  - ★pop_venue_population(新設) = laneDiag.identified(①cap前母数) vs venueSeatsDiag.participantCount。差が許容幅(絶対5人 or 相対5%の大)以内→explained(diffType:population・popup側の数値ID落とし/汚染ガードによる既知差)。それ超→mismatch。
  - ★pop_venue_visible(新設) = 各面の自己整合突合。①laneShown==min(identified,limit) と ④seatsShown==min(participantCount,perRow×rows,hardCap)。両成立→表示差はcap意図差=explained(intentional_cap)。どちらか崩れ→mismatch(描画欠落=本物)。
- ★真値基準の明示(会議批判(b)): 外部真値は無い。基準=「①identified/④participantCount(どちらもcap前論理人数)」と宣言。laneShown(48) vs seatsShown を直接比べない(capの比較で内容でない)。details に基準を必ず書く=都合の良い緑を構造的に不可能に。
- ★liveIdガード: venueSeatsDiag に liveId 追加(venueBar.js:3064 の obs に liveId:activeLiveId・venueSeatsDiag.js typedef/snapshotに1フィールド)。liveId空(旧snapshot)/不一致は venue2ペアを pending(unobserved)=mismatchにしない。会場未起動も pending。★pending の venue ペアは overall を pending に引きずらない(venueはオプション面・「④未観測」と1行出すだけ・overallは①②③で決める)=会議批判(c)。
- 全員表示(Step C)後: limit=500 で laneShown==identified→intentional_cap自然消滅→plain match。★parityVerdict に「全員表示前提」分岐を書かない(limit実値で判定=タスク間結合を作らない)。

### Phase2: 許容窓+②実値突合
- W_hard=20s/W_soft=180s(既存FRESH_MS同値)/W超=pending の窓判定を pairs に。各pair details に tsGapSec 必須(「この2値は何秒ズレた観測か」=窓妥当性をユーザーが検証可)。窓外pending表示=「🟡保留(観測が58秒ズレ: ①12:00:05/④12:01:03)」。
- previewAck に statCards ダイジェスト(実値3個 or ハッシュ)追加(write側1フィールド)して pop_preview_stat 新設=[[parity-verdict-checks-rowcounts-not-statcard-values]]解消。

### Phase3: 重さ
- 自己説明: formatRefreshPerfLine(aiShareFullText.js:50-62)拡張。judgeRefreshHeaviness(stepMs) 純関数=「各read一様~1.5s=storage輻輳(取得走行中は正常・paint11ms=描画軽い)。次の一手: コア4readの1バッチ化」。既存stepMsのroll-up・新規計測ゼロ。
- 分離: コア4read(summaries/fastDiagLite/popupDiag/backfillProgress)を1回の chrome.storage.local.get([...全キー])に統合(直列4往復→1往復)。★v0.1.868「並行readはstall」はPromise.allの話・1getに複数キーは単一往復=別物(loadAllSummariesが1get複数キーの前例・status-entry.js:645)。期待7.7s→2-3s。backfill走行中は間引き2→4秒へ動的緩和。
- 診断集計は分離不要(純関数μs)。分離すべきはreadでextras機構が正解。新設は何もextrasの外に置かない。

### Phase4(任意): 情報階層化
buildAiShareFullText 出力順を3層に: 最上層(トークン1行→内訳最大4行→完全性スコア「取得達成率」注記→更新所要⏱+自己診断→🔴対処のみ)→中層(概要/配信ごと)→下層(折りたたみ<details>: 純Web自己診断/コメント本文/数字の出どころ/fastDiag/popup診断)。★AIコピー本文からは何も削らない(AI向けは網羅が価値)・畳むのは status ページDOM側だけ(renderAll)・本文バイト不変=②③とdrift出ない。

## 地雷マップ
- 診断集計をコアread(毎2秒直列)に足すと大配信で固まる([[status-extras-read-not-core-read]]・v1045)。突合は既存値roll-up=新規readゼロで。★Phase1のacceptanceに「refresh内で新規storage.local.getを呼ばない」をgrep/testで担保。
- self-verifying=嘘で緑にしない。ack(ready/ts)でなく実描画値/件数を突合([[parity-check-must-compare-values-not-just-ack]])。
- 完全性スコアの%は別物・維持(取得達成率・パリティと意味違う=1語注記)。
- 会場は popup未起動で自立(mirror読まない)。片方未観測をmismatchと誤判定しない(pending)。
- jsonBlob.parityVerdict の既存4フィールド後方互換を壊さない。

## 未確定点(実機で測る)
1. ~1.5秒/往復の真因(輻輳仮説は状況証拠)=backfill停止状態でstepMs再取得し「走行中のみ遅い」確認までPhase3断定しない。
2. POP56 の56が laneShown か identified か=実機laneDiagスナップショット値で確認(venue閾値の妥当性に直結)。
3. 母集合差の実幅(数値ID落とし+汚染ガードで何人ズレるか)=許容幅5人/5%は初期値・実機2-3配信で較正。
4. venueSeatsDiag liveId追加後の旧snapshot残存期間(pending期間)。
5. status DOM の<details>化がコピー本文(バイト一致要件)に影響しないこと=renderAllのDOMとコピー本文が別経路の実装確認。

## 実装役が最初に開く座標
- parityVerdict.js:26-135(決定木→pairs構造化の本丸)
- aiShareFullText.js:69,141-170(venueSeatsDiag/laneDiag渡し込み+トークン行+階層再編)
- venueSeatsDiag.js:8-21,75-113(liveId追加)/venueBar.js:3064-3113(obsにliveId・publishはそのまま)
- status-entry.js:335-438(計器とextras・Phase3の1バッチ化位置)/645(loadAllSummaries=1get複数キーの前例)
- 踏襲元: liveviewPublishSelfDiag.js:79-159(意図差をmismatchにしない3段階判定)

## 素材
council/perfect-parity-diag-question.txt / -answers.json / -log.txt
関連メモリ: mirrors-written-per-key-per-tick-root-of-parity-lie / parity-verdict-checks-rowcounts-not-statcard-values / parity-check-must-compare-values-not-just-ack / status-extras-read-not-core-read
