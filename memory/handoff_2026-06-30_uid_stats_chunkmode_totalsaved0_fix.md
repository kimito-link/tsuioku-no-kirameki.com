# チャンクモードで uid 集計が totalSaved:0 になる誤集計 根治 — v0.1.1011 (2026-06-30)

## 結論
master HEAD = **v0.1.1011 (9c099896)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1011。
大きい配信(チャンク化)で fastDiag の uid 集計母数が 0(totalSaved:0)になる誤集計を根治。他計器の信頼性回復。

## 真因(司令塔+Explore で裏取り)
- 実機 lv350854400(記録3223件)で savedCommentsUidStats.totalSaved:0・commentNoLess:null。
- content-entry.js:11550 `_lastSavedCommentsUidStats = aggregateSavedCommentsUidStats(next)`。
  **incrementalMode(チャンク)では next = incrementalAdded = そのフラッシュの新規行だけ**
  (content-entry.js:11461-11463「全件配列は作らない」)。新規0件のフラッシュで母数0=totalSaved:0。
- 非チャンク(next=全件)は正しい=**大きい配信(チャンク化)だけ壊れる**。
- v0.1.1001 の commentNoLess 計器(同じ stats に相乗り)の母数も壊していた。

## 修正(ホットパスは O(追加分)・全件 read を毎フラッシュ足さない)
- commentObservabilityDiag.js: **accumulateSavedCommentsUidStats(running, added)** 純関数新設。
  running に added 行(userId/commentNo を持つ=createCommentEntry 由来)を1-walk加算し % 再計算。
- content-entry.js: **_savedCommentsUidStatsRunning** を seedTailFromMain の if(main) で
  aggregateSavedCommentsUidStats(main.concat(persistedTail)) で**1回だけ seed**(全件 read は seed の
  既存1回に相乗り=新規 I/O ゼロ)。以後 incrementalMode は accumulate で added だけ加算。
  ★全件 read timeout 等で main が無いとき(else 枝)は running=null=従来の差分集計にフォールバック(壊さない)。
  非チャンクは従来どおり aggregateSavedCommentsUidStats(next=全件)。liveId 切替は seedTailFromMain 再実行で再 seed。

## verify
- verify:cc 緑(accumulate: seed+加算で母数全件 / 新規0件で totalSaved リセットされない / null フォールバック / added 空)。
  ※途中 typecheck で pct の n が implicit any→ @param {number} で解消( this file は @ts-nocheck でない)。
- 出荷バンドル probe: seed 3223→+2匿名で 3225(uid%99.9)→**+0件で 3225 維持(0にならない=根治の核心)**。

## 影響(他計器の母数が回復)
- 「userId 付き率(withUidPercent)」「記録>本家の内訳(commentNoLess%)」「完全性スコアのコメント記録」が
  大きい配信でも正しい母数で出る。今までチャンク配信ではこれらが信用できなかった。

## 残(別系統)
- 更新の重さ: 1回の refresh の重さ(summaries 905ms 等)自体は未着手。間引き(v1009/1010)で頻度は下げた。
  まだ重ければ書込側(timeline mirror 無変化skip→staging周期ずらし)を安全順に。
- 会場座席(venue-seats)完全性スコア不合格。backfill 律速そのものは v0.1.999 計器の実測待ち。

## 今セッション出荷(v0.1.998〜1011=14版・全 push 済み・同期0/0)

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
