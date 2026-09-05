# 引き継ぎ: 過去ログ一括取得が 2% で止まる回帰(最優先)+ 会場満員感の書きかけ(2026-06-16)

> ⚠️ 着手前に **Chrome を一度再起動**(dev で SW 増殖・storage_op_timeout の温床)。新しいクリーンなチャットで。
> ⚠️ 最危険境界 = content-entry.js の backfill。**推測で直さない・実機(romiDebug/fastDiag)で切り分けてから TDD**。

---

## 0. いまの git 状態(次セッションが最初に見る)
- HEAD=`a3cb1c2c`(v0.1.757)・branch=master・origin と同期。
- **未コミットの書きかけ = v0.1.758「会場の満員感」**(下記§3)。3ファイル変更:
  - `src/extension/venueBar.js`(cumulativeParticipantIds Set 追加・import・state まで。**配線途中=未完**)
  - `src/lib/venueLiveRoster.js`(`resolveVenueCrowdCount` 純関数 追加・**完了・テスト緑**)
  - `src/lib/venueLiveRoster.test.js`(`resolveVenueCrowdCount` テスト +5・緑)
  - → この書きかけは §3 を完成させてから bump/commit するか、最優先(§1)を先にやるなら一旦 stash 推奨。

## 1. 🔴最優先 = 過去ログ一括取得が 2% で固着(ユーザー「コメント一括取得の前提がまたおかしくなってる」)
### 実機症状(2026-06-16 スクショ・ビルド v0.1.757 反映済)
- 先生.18 配信(2h12m)で **記録 47件 / 公式 1,794件 = 約2%**。「最終取り込み 1秒前・取り込み中」(動いてはいるが激遅)。
- 単一タブ視聴(裏に大型配信は無さそう)なのに 2% = backfill がほぼ走っていない。

### 真因の最有力仮説(調査途中・git diff で確定すべき)
- **今日 v0.1.751「視聴中タブ優先スロット」(d73b43b8)で content-entry.js に追加した `shouldYieldBackfillToWatchedTab(lid)` が、視聴中タブ自身の backfill を不当に defer/yield させている疑いが濃厚**。
  - 該当箇所(content-entry.js): `maybeAutoStartBackfill` のスロット取得 IIFE 冒頭
    ```js
    if (await shouldYieldBackfillToWatchedTab(lid)) { void registerBackfillWaiter(lid); return; } // ←これが視聴中タブで true になってると永久に起動見送り=2%
    ```
  - 純関数は `shouldYieldBackfillSlotToPriority`(src/lib/backfillRotationGate.js)。条件②=`self===priority なら false(自分には譲らない)`。**理屈では視聴中タブは priority lv 本人なので yield しないはず**。
  - **だが 2% という実機事実は「視聴中タブが yield している」を示唆**。考えられる破綻:
    1. **`setBackfillPriorityLiveId` が呼ばれていない/古い別 lv が priority に居座る** → self≠priority になり視聴中タブが「別の優先 lv のために」譲り続ける。`onTabVisibleForCommentHarvest`(content-entry.js ~11871)で visible 時に setBackfillPriorityLiveId(liveId) を呼ぶが、**タブが既に visible のまま開きっぱなし(visibilitychange が発火しない)だと priority が設定されない**可能性。
    2. storage.session の priority lv が前の配信のまま(120秒で expire するが、別タブが居ると更新され続ける等)。
    3. `listBackfillWaitingLiveIds` に自分が waiter 登録され続け、`shouldYieldBackfillSlotToPriority` の③(slotsFull/priorityWaiting)が誤発火。
- **別の可能性**(併せて切り分け): v0.1.756 で `handleStorageChange` を「tail newValue を直接 processSpeechRows」に変えた(会場側)。これは content-entry でなく venueBar 側なので backfill に直接は効かないはずだが、storage 競合・SW 負荷の観点で一応疑う。

### 切り分け手順(推測で直さない)
1. **fastDiag / romiDebug.backfill を実機で読む**: `stopReason / rows / seg / triedLiveId / running / autoEnabled`。
   - 「視聴中タブ優先 yield が原因」なら **backfill が起動すらしていない**(running:false が続く・stopReason 空 or 直近で register されたまま)。`commentIngestBySource.backfill:0` も裏付け。
2. **storage.session の priority lv を確認**: `chrome.storage.session.get(['nls_backfill_priority_lv_v1','nls_backfill_priority_at_v1','nls_backfill_waiting_lvs_v1'])`。視聴中の lv と一致しているか? 別 lv が居座っていないか?
3. content-entry.js の該当 yield 分岐に診断ログ(`_backfillProgress` 経由 or data 属性)を一時的に出し、視聴中タブで `shouldYieldBackfillToWatchedTab` が true を返していないか確認。
4. **最小の検証**: v0.1.751 の yield 分岐を一時 no-op(常に false)にして 2% が解消するか実機確認 → すれば v0.1.751 が原因確定。

### 直す方針(切り分け後)
- v0.1.751 の yield は「**別の新鮮な優先 lv が居て、かつ自分がそれでない**」時だけ。**単一視聴タブ(他に待機が居ない/自分が見ているタブ)では絶対に yield しない**ことを保証する。
  - 候補A: 視聴中タブは `onTabVisibleForCommentHarvest` だけでなく **maybeAutoStartBackfill の毎 tick でも setBackfillPriorityLiveId(自分)** を呼び、自分を priority に保つ(visibilitychange に依存しない)。
  - 候補B: `shouldYieldBackfillSlotToPriority` に「**自分が現在 visible なら yield しない**」を強条件で足す(amIVisible は既に引数にある=今は条件②で間接的にしか効いていない。視聴中タブを明示除外)。
  - 候補C: v0.1.751 自体が「34%飢餓」の別症状対策だった。今回 2% を悪化させたなら **v0.1.751 を revert して別アプローチ**(視聴中タブ優先は priority set 側だけで担保し、yield(開始見送り)は入れない)も選択肢。
- TDD: backfillRotationGate.test.js に「単一視聴タブ(waiting 自分のみ/priority=自分)は yield しない」を red→green。実機(romiDebug.backfill.running が true で seg/rows が伸びる)で 2%→回復を確認。

### 関連コード(実コードで再確認すること)
- content-entry.js: `shouldYieldBackfillToWatchedTab`(新規・今日追加)/ `maybeAutoStartBackfill` のスロット取得 IIFE / `onTabVisibleForCommentHarvest`(setBackfillPriorityLiveId) / `runNdgrBackfillOnce`。
- src/lib/backfillRotationGate.js: `shouldYieldBackfillSlotToPriority`(条件①〜③)。
- src/lib/globalBackfillQueue.js: `setBackfillPriorityLiveId/readBackfillPriorityLiveId/registerBackfillWaiter/listBackfillWaitingLiveIds`(120秒 expire)。
- 過去の同種: v0.1.749 COLD=40 / v0.1.750 stalled 無限ループ(backfillTransientRetry に stalled+rows=0 追加)。これらは別件で完了済(壊さない)。

## 2. ⚠️ ユーザー反映の前提(毎回必須)
- ユーザー拡張は**デベロッパーモード(フォルダ読込)**。主リポ `.../tsuioku-no-kirameki.com/extension` を読んでいる想定だが**未確認**(C:\tmp\* 等の古い worktree でない確認が要る)。
- push しただけでは届かない: **git pull → chrome://extensions リロード → watch タブ F5**(AGENTS.md §12.5)。ユーザーは「会場パネルの『ビルド vX.X.X』表示」と「最終行(最新コメント)が会場に出るか」で答え合わせする。
- v0.1.757 までは反映確認済(スクショに `ビルド v0.1.757`)。

## 3. 🟡書きかけ = 会場の満員感(v0.1.758・未完)
### 背景(ユーザー指摘「満席演出がうまくいってない・配信部分でいっぱいにならなきゃ」)
- 真因: **v0.1.754 で在席を窓(通常4分)+LRU に絞った副作用で、背景の群衆シルエット(満員感担当・totalAnonymous)も窓内の人数(38人等)だけで数えてスカスカ**になった。大規模配信(来場5,931)でも38人ぶんしか群衆が出ない。
- ユーザーの設計判断(採用): 「満員=来場者数=**コメント+ギフト+広告した人を1回1席の累計ユニーク**」(東京ドーム/武道館の来場者の比喩)。
  - 席アバター=直近発言者(窓・v0.1.754 維持)。背景群衆=**累計ユニーク参加者(来場者)**で描く。
### 済んだ部分(緑)
- `src/lib/venueLiveRoster.js`: 純関数 `resolveVenueCrowdCount({cumulativeUnique, seatedCount, windowedAnonymous})` = `max(cumulativeUnique - seatedCount, windowedAnonymous)`・0下限。テスト+5緑。
- `venueBar.js`: `cumulativeParticipantIds`(Set)state 追加・`resolveVenueCrowdCount` import まで。
### 未完(次でやる)
1. `cumulativeParticipantIds` を **配信切替で clear**(liveRoster.clear() の2箇所: venueBar.js の resetSpeechTracking ~1773 と aggregateParticipants 切替 ~2138 の隣に追加)。
2. **成長させる**: `onLiveComments` の touchRoster ループで `if(speech.userId) cumulativeParticipantIds.add(uid)`。hydrate(`hydrateRosterFromCandidates` 呼ぶ所)で aggregatedCandidates の userId も add。
3. **群衆描画に使う**: renderSeats(~1945)の `collectAudienceFaceUserIds` の戻り `totalAnonymous` を、`resolveVenueCrowdCount({cumulativeUnique: cumulativeParticipantIds.size, seatedCount: seating.seats.length, windowedAnonymous: totalAnonymous})` で**上書き**して crowdAnimCount/drawCrowdOnCanvas に渡す。title の「ほか観客 N人」もこの数に。faceUserIds(顔出す匿名)は今のまま(rows 由来=直近)。
4. ギフト/広告送信者の累計合流は**次段階**(W杯でもコメント参加者が母数の大半なので、まずコメント参加者で満員感は出る)。会場は今ギフト/広告データを持っていない(要・別経路)。
5. TDD 緑 → version bump(v0.1.758)→ verify:cc → commit/push → 実機で「大規模配信で群衆が満員に見える」確認。
- ⚠️ crowdRasterizer(drawCrowdOnCanvas)は人数が数千でも描けるか(resolveCrowdRenderPlan で退避するはず・v0.1.733)を確認。数千シルエットで重くならないか実機で。

## 4. 今日完了済み(全 master push・反映には F5 要)
v0.1.750 stalled無限ループ根治 / 751 視聴中タブ優先スロット(←§1 で 2% 回帰の疑い) / 752 会場リアルタイム化(onLiveComments in-memory tap) / 753 context invalidated 再読込案内 / 754 ストリーム駆動在席(3時間安定) / 755 鮮度/速度/流速可変寿命の調律 / 756 コメビュ並み速い経路(tail newValue 直接) / 757 吹き出し非対称根治(発言即着席+席無しフォールバック crowdBubbleAnchor)。
- 会議ハーネス: scripts/meeting.mjs(無料LLM クラウド4+OpenRouter+ローカル7=最大12体・MEETING_LOCAL_MODELS で上書き・PowerShell で User scope env を Set-Item してから node)。正本 [[reference-free-cloud-llm-apis]]。
- 残(別件・未着手): 本家コメ表示が実際の公式数と食い違う / backfill 初期速度(若い配信×3並列 seg:0)。

## 5. 教訓(今日)
- 視覚要素(吹き出し/群衆)を「席の有無/窓」に依存させると非対称・縮小バグ(v0.1.745/757/758 同型)。
- backfill(content-entry.js)は最危険。**優先スロット/yield 系の変更は単一視聴タブを絶対に飢餓させない**ことを必ず検証(今回 2% 回帰の疑い)。
- ユーザーは「最終行が会場に出るか」「記録%」で常に答え合わせ=実機の事実が最強の手がかり。推測で直さず romiDebug/fastDiag を読む。
