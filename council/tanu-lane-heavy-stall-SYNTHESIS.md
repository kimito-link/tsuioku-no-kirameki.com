# SYNTHESIS: 応援レーンの「たぬ姉4人固着」+「ちらちら」= refreshGen レース

会議 2026-07-01 / code / routed 4体(qwen3-32b 批判, qwen3.6-27b 発散, llama-3.3-70b 爆速, gpt-oss-120b 批判)。**4体一致**。司令塔が実コード裏取りの上で集約 + 実機状態速報2件で補強。

## 収束した結論(4体一致)
### 真因(Q1): (A) refreshGen レース
- heavy コメント読み(重い配信で5.2秒)が完了する前に、次の refresh が `++watchPopupRefreshGeneration`(popup-entry.js:13325)で世代を進める。
- heavy 完了コールバック(:14529)の手前 `if (refreshGen !== watchPopupRefreshGeneration) return`(:14532)で**早期 return** → `watchPopupHeavyCommentsSettled = true`(:14559)に到達しない。
- settled=false のまま → `selectLaneFeedCommentRows`(provisionalLaneCommentRows.js:57-61)が**暫定(直近N件≒10)**だけ返す → たぬ姉レーンに匿名が数人しか出ない。
- 増幅要因: `canReuseHeavyChunkRead`(:13957)が総数増加で false になりやすく毎 refresh で heavy 再読=永遠に間に合わない。
- ⭐ 実機裏取り: 重い配信(7,262件)= entriesLen:10 で固着 / 軽い配信(27件)= entriesLen:27 で正常。**重い時だけ再現**=レース仮説と完全一致。

### ⭐ 司令塔の追加発見(実機状態速報2件目): 「ちらちら」も同じ根
- northStarRenderProbe: `refreshAllStarted 8 / completed 2`(開始8・完了2)= refresh が**何度も追い越されて中断**。
- refresh が描いては中断・描いては中断 → 応援レーン/アイコン列が**ちらつく**。= たぬ姉固着と**同一真因(refreshGen レース)の別症状**。会場のちらつき(撤回済み)とは別物。

### 直し方(Q2): 14532 の refreshGen ガードを見直す(最小)
- ⭐ **核心(qwen 批判)**: 14530 が既に `watchMetaCache.key !== snapshotKey`(=同一配信/スナップショット)を守っている。14532 の `refreshGen !== watchPopupRefreshGeneration` は**正しさには冗長・生存性(liveness)には有害**。同じ配信の heavy 結果なら、新しい refresh が始まっていても**適用して settled にしてよい**。
- 最小案: **14532 を「同一 live なら通す」に緩める**(snapshotKey 一致を信頼)。または(A)「最後に成功した全件 arr」を保持し、追い越されても次で settled=true にできるようにする。
- 退化防止: snapshotKey 検証(14530)で別配信混入は防ぐ。settled を安易に true 固定しない(配信混入の穴)。

### ローディング overlay(Q3): settled と同根
- overlay 畳みは settled 依存(gpt-oss 指摘 `!settled || entriesLen===0` で表示)。settled が立てば overlay も畳む。別対処不要=同じ修正で直る。

### 検証(Q4): storyUserLaneRenderProbe に計器を足して観測
- 「settled が false→true になるか」「14530-14542 のどれで return したか」を probe に記録。重い配信で再現・軽い配信で正常を実機で確認(検証ファースト)。

## やってはいけない(批判役・全体一致)
1. heavy read を毎回 full 強制 → 重い配信を更に重く。
2. settled を安易に true 固定 → 別配信データ混入。
3. refresh を止める/throttle しすぎ → 他の描画(北極星/カード)を遅らせ・リアルタイム感を殺す。
4. provisional を全件化 → 0秒表示の軽さを殺す。
5. ⚠️ **会場(venueBar)に手を出す** → 別系統・今直したちらつき再発防止。今回の修正は popup-entry.js の heavy 完了経路のみ。

## 実装計画(最小・検証ファースト)
1. **計器先行**: storyUserLaneRenderProbe に「settled 遷移」「どの early-return(14530/31/32/42)で抜けたか」を記録。実機の重い配信で 14532 が支配的なことを確認。
2. **修正**: 14532 の refreshGen 等値ガードを緩和(同一 snapshotKey なら適用)。または最後の成功 arr を保持して次 refresh で settle。どちらか実機観測で決める。
3. **検証**: 重い配信で entriesLen が全件になり settled=true・overlay 畳み・ちらつき解消を状態速報で確認。会場は触らない。verify:cc 緑。

## 会議の限界(裏取り)
- 会議は実コードを読めない=14530-14542 の行・snapshotKey/refreshGen の意味は司令塔が実コードで確認済み(14530=snapshotKey 一致で別配信混入を既にガード=14532 緩和は安全という判断の根拠)。
- 「refreshGen が何を守るか」(=追い越された refresh の DOM 状態に古いデータを混ぜない?)は実装前にさらに精査する(緩和で別の退化=古いデータ適用が出ないか)。
