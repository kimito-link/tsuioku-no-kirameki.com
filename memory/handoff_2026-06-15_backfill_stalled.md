# 引き継ぎ: backfill が「入口で0行固着→stallループ」で半分しか取れない根治(2026-06-15)

> ✅ **解決済み(2026-06-15・v0.1.750・commit 11a865be・master push済)**。以下は当時の調査記録(後追い用に保全)。
> 修正の要点: ①backfillTransientRetry.js で `stalled` かつ rows===0 を一過性入口失敗として上限7+指数backoff+jitter の transient リトライに乗せた(aborted+rows=0 と同型)。②content-entry.js ウォッチドッグの stalledEmpty(rows=0)では guard を即解除せず保持し、finally の backoff リトライに再入を一任(=同じ場所へ即再入する tight 60秒ループを断つ)。stalledMidRun(rows>0)は従来どおり即解除。
> 切り分け結論: **スロット飢餓ではない**。stalledEmpty は `_backfillAbort!=null` を要求し、`_backfillAbort` は `runInBackfillSlot` の内側で走る `runNdgrBackfillOnce` でのみ立つ=固着時は既にスロットを確保済み。真因は「cold-seek が遅い NDGR で COLD 予算を回し切る前に60秒を超え、clean な backward_exhausted を立てる前に watchdog に abort される入口失敗(=一過性)」。
> 検証: ユニット+5(全29緑)/実ビルドを Node で end-to-end(再入が厳密7回で打ち切り=無限ループ解消)/ndgrBackfillCrawl 71・gap-rearm 31 緑/verify:cc 緑/実機 live lv350704297 で healthy path(21,925行一挙取得・exhausted→新鮮re-seed 周回・stalled 誤発火なし)。残: 「47%停滞」の実再現確認はユーザー目視待ち(slow-network 依存で on-demand 再現困難)。
> 詳細は MEMORY.md の v0.1.750 エントリ参照。

---

> （以下・当時の調査記録）次セッションは**調査不要ですぐ実装**に入れる。真因・直し方・危険境界を全部ここに残す。
> ⚠️ 着手前に **Chrome を一度再起動**(dev Chrome は今セッションで SW が9個に増殖して詰まっている=storage_op_timeout の温床)。新しいクリーンなチャットで挑むこと(心臓部 content-entry.js は最も慎重に)。

## ユーザーの北極星(最重要)
「過去ログを**一挙に取る**(4万件でも一気に取れていた)」「ローディングなし・一挙取得が根底」。配信者(ユーザー)が状態速報JSON(fastDiag)で「根底が崩れている」と繰り返し指摘。

## 事実(git履歴+コードで確定・調査済み)
- **「4万件一気取り」は本当**。git `17f02d33`(v0.1.696)で crawl 42,078行 reached_start・保存36%→約100%(42,451行) の実証あり。**能力は今もエンジン(crawlNdgrBackward)にある**。
- **だが「backfill撤廃して一括APIで取る」は技術的に不可能**。ニコ生 NDGR は1リクエストで全件返すAPIが無く、`next.uri` で「次の1区画」を辿る構造(src/lib/ndgrDecode.js:879-963)。「一括取得」は名前だけで実体は最初から区画を高速で辿る方式(初出 v0.1.404 `39f92bbc`/`36d9ffcc`)。**区画辿りは本質的に必要=撤廃できない**。ユーザーの「一括で取れるはず」はこの点だけ誤解(が、体感「一気に」は区画高速辿りで実現できていた=正しい)。
- deepHarvest/endedBulkHarvest は **DOM仮想スクロール走査**(content-entry.js:11929 runDeepHarvest / commentHarvest.js:227)で数百行しか拾えない=4万件は担えない。過去ログ全件は **backfill(crawlNdgrBackward)が唯一の担当**。

## 真因(今回の症状=前回と別物)
- 前回(あやりん) = `backward_exhausted`(諦める)→ **v0.1.749 で COLD_RETRY_MAX 12→40 で根治済み**(別件・完了)。
- **今回(かなた・公式24,331件が47%=11,523で停滞) = `stopReason:"stalled" rows:0 seg:0 triedLiveId:""`**。
  = backfill が**入口(backwardURI)で1区画も取れず0行のまま固まり**、ウォッチドッグが 60秒ごとに abort→リセットを繰り返すループ。
- **設定箇所 content-entry.js:15824-15840**:
  - `stalledEmpty`(:15824) = 巡回起動済みなのに `seg===0 && rows===0` で60秒経過+公式ギャップ大。
  - `stalledMidRun`(:15831) = rows>0 だが150秒進捗なし。
  - どちらかで `_backfillProgress.stopReason='stalled'`・`_backfillTriedLiveId=''`(意図的に空=次tickで再入できるように)・`_backfillAbort.abort()`。
- **構造的欠陥(真因の核)**: `'stalled'` が `backfillTransientRetry.js:22-42` の `BACKFILL_TRANSIENT_STOP_REASONS` にも `BACKFILL_GAP_RETRY_STOP_REASONS` にも**入っていない**。だから `shouldScheduleBackfillTransientRetry` が stalled では false → **「新鮮な ?at=now から仕切り直す」transient リトライが走らない**。再入は `_backfillTriedLiveId=''` による素の maybeAutoStartBackfill だけ → **同じ入口探索をやり直して同じ stall に陥る無限ループ**。

## 直す方針(会議はまだ・次セッションで会議→TDD)
**核心 = stalled を「新鮮なseedで仕切り直す」経路に乗せる**。入口で固まったら、同じ場所を再試行せず `?at=now` から fresh re-seed する。候補:
1. `backfillTransientRetry.js` の STOP_REASONS 集合に `'stalled'` を追加 → fresh seed 仕切り直しが効くようにする(最小の一手の第一候補)。ただし「固着の真因(なぜ入口で0行か)」も要調査=view base 観測失敗? 複数配信並列でスロット食われ? を切り分ける。
2. 入口探索(seekBackwardUri・ndgrBackfillCrawl.js:586)が0行で固まる条件の特定。`ndgrViewBaseObserved:true` は出ているので view base は取れている=入口URI探索 or backward fetch が失敗?
3. 会議で残課題だった**視聴中タブ優先スロット確保**(chooseSlot 純関数・複数配信並列で巨大配信にスロット食われ stalled)も関連の可能性=今回かなたは巨大配信(24,331件)1本で、別タブ(lv350656495)もあった。スロット飽和で入口取得が飢餓→stall かも。

⚠️**推測で直さない**。次セッションは「stalled で triedLiveId 空になる瞬間の前後」を実機(複数配信並列)で計測し、入口失敗が「ネットワーク飢餓(スロット競合)」か「view/入口探索ロジック」かを切り分けてから直す。

## TDD の指針(心臓部=必須)
- 純関数で切り出してテスト: `shouldScheduleBackfillTransientRetry`(backfillTransientRetry.js)に stalled を足すなら、そのテストを先に(red→green)。stall 判定(stalledEmpty/stalledMidRun)も純関数化できればテスト。
- 既存テスト(ndgrBackfillCrawl.test.js 71件)を壊さない。
- 実機検証: **複数配信並列**で「公式と同数まで一挙取得される(47%→~100%)・stalled ループが消える」を fastDiag(romiDebug.backfill.rows/seg/stopReason)で確認。**verify緑≠動く**。

## 危険境界(触り方)
- content-entry.js / background.js(素SW) / persist / NDGR = 最も慎重。hot path に I/O 混入禁止。グローバルロック1本は多タブで破綻=細粒度。
- cap/リトライ上限は**実測で**決める(fixture test 必須)。stopReason を捨てない(嘘の完了宣言禁止)。
- 関連 reference: [[reference_backfill_cold_retry_meeting_2026-06-15]](v0.1.749 COLD修正) [[reference_backfill_sw_migration_pr1b]](過去のSW移行)。

## このセッションで完了済み(全push済・master)
v0.1.745 吹き出し音声切離し / v0.1.746 前状態保持(会場空っぽ根治) / v0.1.747 3キャラ常駐 /
v0.1.748 3キャラを配信画面のまわりへ+コメントpoll 0.8秒 / **v0.1.749 backfill COLD 12→40(backward_exhausted 根治)**。
会場モードの根治は完了。**残るはこの「stalled で半分しか取れない」=次セッションの本丸**。
無料LLM会議基盤=scripts/meeting.mjs(クラウド4系統+ローカル・正本 reference-free-cloud-llm-apis.md)。
