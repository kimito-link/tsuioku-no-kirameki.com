# Codex 調査レポート: 複数タブでローディング点滅+取得低下(v0.1.612)

## エグゼクティブサマリー

- **真因として最も疑わしい(複合)**:
  1. ⭐ **`maybeAutoRetryBackfillFromProg` の多タブ N 重起動 + `triggerBackfillRetry` にクールダウン無し**(popup-entry.js:7987 / 7728)。バックフィルが 90 秒で rotation_yield する設計(content-entry.js:14981 `GLOBAL_BACKFILL_ROTATION_MS=90_000`)と組み合わさり、`KEY_BACKFILL_PROGRESS` の `done=1` 更新が全タブの popup で同時受信 → 全タブが `triggerBackfillRetry` を発火 → `KEY_BACKFILL_ENABLED` の **remove/set ストーム** を起こす。これが全タブの onChanged を再度叩き、`safeRefresh` → `clearWatchMetaCard` → `paintOfficialNicoStatsStrip(null)` の **数字消し** が点滅として観測される。
  2. ⭐ **コメント永続化(tail / chunk / main)が leader 制御外で per-tab に並列実行**(content-entry.js:10049 / 10090 / 10145・persistCoalescer 10424)。同一 liveId を N タブで開くと N 個の content script が同じ `nls_ctail_<lv>` / `nls_cchunk_index_<lv>` / `nls_comments_<lv>` を独立に read-merge-write し、各 write が onChanged を生んで全タブで `coalescedRefreshScheduler.schedule`(throttle 450ms) を叩く。throttle の trailing edge は必ず 1 度通るため、N タブで N 個の popup が 0.45 秒周期で同期して reflow する。
  3. ⭐ **rotation_yield 直後に「リーダー昇格中の空白」が生まれる**(content-entry.js:14973-14975 + 15206-15208)。前リーダー A が `_backfillProgress.done=1, stopReason='rotation_yield'` を publish → 次のリーダー B 昇格まで `runWhileGlobalLeader` の `ifAvailable: true` 経路で **次 tick(秒単位)を待つ** 必要があり、その間 backfill rows が伸びない。popup は `done=1` を「途中停止」と解釈してリトライ ENABLED を反射的に立て、しかし即座には backfill が再開しない → 「ローディング中」「数字」を遷移する見た目を作る。

- **即修正可能**: yes。ただし本レポートでは実装しない。最小修正は (a) `triggerBackfillRetry` に 5〜10 秒のタブ間共有クールダウン(session storage)を追加、(b) tail/chunk/main 書き込みを `runIfTabLeader('nls-persist-' + lid, ...)` で leader-only にする、の 2 段階。

- **修正の影響範囲**:
  - popup-entry.js: `triggerBackfillRetry` / `maybeAutoRetryBackfillFromProg`
  - content-entry.js: persistCoalescer 周辺(10424-)、`flushBatchViaTail`(10049-)、persistCommentRowsImpl(10762-)
  - 純関数: 新 `src/lib/multiTabBackfillRetryCooldown.js`(session storage helper)
  - 既存 leader 設計(tabLeaderLock.js + GLOBAL_BACKFILL_LOCK / per-lv 'nls-backfill-<lv>')と整合した実装が可能(ウルトラC の延長線)。
  - v0.1.592 baseline zip との互換性: 既存「**書き手は per-tab・leader は backfill/forward/scrape/extfetch のみ**」設計をそのまま保ったうえで、persist 経路に leader を 1 段足す形なので機能は同等のまま「N → 1 タブで write」へ削減できる。

ユーザー報告「同接 1,043・コメ 591 件で記録 79 件(13%)・backward_exhausted・残り 512 件」は「点滅で取得低下」というより、**点滅と取得低下が同じ真因の表裏**である可能性が高い: ① rotation_yield/transient retry のリーダー交代ループで実 fetch 時間が断続化 → ② 全タブの write 競合で persistCommentRowsImpl が `requeueOnReadFail`(10829)・`STORAGE_OP_TIMED_OUT`(10867) を踏みやすくなり、新着行が `requeue` 経路に追いやられて backfill 進捗が短時間で `rotation_yield` を迎える → ③ 「リトライ → 90 秒で休止 → リトライ」を繰り返すうちに、`shouldScheduleBackfillTransientRetry`(backfillTransientRetry.js:43) の `backward_exhausted` 再試行上限(NDGR_BACKFILL_TRANSIENT_RETRY_MAX) に達して**最後は 13% で終了**。

## 観察ポイント(司令塔がユーザーに依頼する観察項目)

- **(a) タブ数差の挙動**:
  1. 同一配信を 1 タブだけ開いた状態で 10 分計測 → 記録/公式比率と「点滅の有無」を記録
  2. 続けて同じ配信を 2 タブ目に開く → 同じ 10 分の比率と点滅頻度を記録
  3. 3 タブ目を追加し同様に計測
  4. 1 タブまで戻して点滅が止まるかを確認
  → タブ数 N に対して点滅頻度がほぼ線形に増えるなら容疑 β(全タブ再描画)、N=2 と N=3 でほぼ同じなら容疑 α / γ(leader 1 タブの retry ループ)を支持。

- **(b) SW DevTools(chrome-extension://...background) で確認**:
  - chrome.runtime のメッセージログに NLS_KOKEN_CONTRIB_FETCH や NICO_USER_PROFILE_FETCH_MESSAGE_TYPE の連発がないか(タブ数 × 30 秒間隔の koken / 12 秒間隔の event participation で何件届いているか)
  - service-worker.js 配下に **persistGuardTimeout** や **storage_op_timeout** のエラーが出ていないか(出ていれば容疑 γ・storage 競合確定)
  - chrome.alarms には autopatrol 関係しか登録されていないはずなので、未知の重い alarm が無いことを確認

- **(c) chrome.storage.local の write 頻度の測り方**:
  - watch ページのコンソールで以下を貼って 60 秒間モニタ(content script context):
    - let __counts は空オブジェクト。chrome.storage.onChanged.addListener で (changes, area) を受け、area !== "local" なら return。Object.keys(changes) を回し lv数字 を lv* に置換して counts を ++。
    - setTimeout で 60000ms 後に console.log(__counts)
  - 期待値(1 タブ 1 配信): nls_ctail_lv ≒ 20-40、nls_cchunk_index_lv ≒ 5-10、nls_backfill_progress ≒ 1-2
  - 多タブで nls_backfill_progress が 10 を超えるなら容疑 α(triggerBackfillRetry ストーム)の確証

- **(d) ローディング → 数字 遷移の DOM 観察**:
  - DevTools で #liveStatComments(記録カード) や #watchViewerDom(視聴者数) に MutationObserver を仕掛け、200ms 以下で 「—」 と 数値 の振動が観測されるなら容疑 β(全タブ再描画)。500ms 以上の間隔なら容疑 ε(snapshot fetch リトライ)。

## 容疑別の判定

### 容疑 α (各タブが独立に取得処理) : **部分該当**

- 根拠 grep:
  - content-entry.js:13234・13248・13264 で runExternalApiFetchesAsTabLeader / runIfTabLeader(nls-extfetch-evt-+lid) がかかっており、koken / nicoad / event participation / commenter follow / following list はリーダー 1 タブで集約済み。
  - content-entry.js:13211 で nls-domscrape-+lid も leader-locked。
  - content-entry.js:15402 / 15541 で backfill(GLOBAL_BACKFILL_LOCK) / forward crawl(GLOBAL_FORWARD_LOCK) もグローバル leader-locked。
  - **未集約な経路**:
    - **MAIN world WS 傍受**(page-intercept-entry.js)は全タブで稼働(content world の dedup 後に persist へ流れる)
    - **persistCommentRowsImpl / flushBatchViaTail / chunk append**(content-entry.js:9757 / 10090 / 10145・10762)は **per-tab で並列**
    - popup-entry.js:14000-14080 の maybeFetchCommenterFollowBatchOnce は extfetch leader 配下なので OK だが、forceRefetchAllCommenterFollowProfiles(14749) ボタンは明示操作のみ → 影響なし
  - content-entry.js:14951 if (_backfillTriedLiveId === liveId) return; の guard は per-tab variable。リーダー交代直後の昇格タブは fresh、resumeFromVpos の storage 経由でしか前リーダーの進捗を引き継げない(15028)。

- 計算量:
  - 外部 API(leader 1): tab 数 N でも 1×
  - DOM scrape(leader 1): N でも 1×
  - persistTail(per-tab): N × 受信レート
  - persistMain compaction(per-tab・persistCoalescer): N × baseInterval(MIN_PERSIST_INTERVAL_MS=2.5s)
  - WS 傍受デコード(per-tab): N ×(主に decodePackedSegment / lengthDelimitedStream)
- 既存防御策:
  - runExternalApiFetchesAsTabLeader + per-lv leader(tabLeaderLock.js)
  - runWhileGlobalLeader で backfill / forward を全タブで同時 1 本
  - persistThrottle / persistCoalescer の per-tab 内 throttle + visibilityState=hidden で間引き
  - _incrementalDedupEnabled=true(v0.1.513)で全チャンク再読み回避
- 残るリスク:
  - **コメント persist の per-tab 独立並列**: tail write、chunk index write、main compaction の 3 経路が **全タブで重複実行**。これが結果として全タブの popup の coalescedRefreshScheduler を叩き、N 倍の再描画を生む。
  - MAIN world WS 傍受は同一 origin の同じ live コンテンツを N タブが各自パースしている。runInterceptReconcile 撤去後(v0.1.606)も decode 自体は per-tab に残るが、これは hidden では実質止まる(stats_poll / 再描画ループが hidden で skip)ので**真因の中心ではない**。
- 判定: **persist 経路の per-tab 独立並列は容疑 γ と本質同一**。修正案 2 で leader-only persist にすれば α もまとめて解消。

### 容疑 β (storage.onChanged 全タブ再描画) : **該当**

- 根拠 grep:
  - popup-entry.js:8003・8146・8165・8183・8203 で popup 内 5 個の chrome.storage.onChanged.addListener が稼働。N タブで N×5=5N 個。
  - popup-entry.js:20048 onStorageChanged がさらに scheduleCoalescedStorageRefresh(changes, safeRefresh) を呼ぶ。
  - popup-entry.js:17198 scheduleCoalescedStorageRefresh 内で 17204 decideVisibilityAction({hidden, gateEnabled:true, initialDone}) を判定。**document.hidden===true ならスキップ**(v0.1.440 で実装済み)。
  - popup-entry.js:17210-17216 allHighFreq 判定 → coalescedRefreshScheduler.schedule(throttle 450ms・先行 + 末尾)。
  - popupStorageRefreshCoalesce.js:60-93: 末尾 trailing は **延長されない**ので、バースト中も 450ms 周期で再描画が必ず走る。
  - popup-entry.js:17175-17192 isHighFrequencyCommentRelatedStorageKey は nls_comments_・nls_csummary_・nls_panel_summary_・nls_cchunk_index_・nls_cdb_summary_・nls_ctail_・nls_gift_users_ を高頻度判定。それ以外の key 変更は **即時 refresh** になる(17198 の throttle 経路を通らない)。
- 計算量:
  - N タブ前面表示時: 各 write イベントごとに N 倍の reflow。coalescedRefreshScheduler は per-tab 内のスロットルなので**タブ間集約は無い**。
  - hidden タブはスキップ(v0.1.440)されるので、N タブのうち前面 1 タブだけが reflow すれば OK のはず。**ただし inline panel の場合、各 watch タブが「表示中(parent visible)」かつ iframe の document.visibilityState も visible なので、N タブ全部がアクティブと判定される**(各 watch タブを切り替えてもアクティブタブが切り替わるだけで、裏 watch タブの iframe は visibilityState=hidden になる)。
- 既存防御策:
  - decideVisibilityAction で hidden タブは skip(v0.1.440)
  - coalescedRefreshScheduler で 450ms throttle(先行 + 末尾)
  - INLINE_MODE での visibilitychange listener で 400ms 以内の連続復帰は無視(20217)
- 残るリスク:
  - **「タブを切り替えるたびに点滅が再発」**(ユーザー観察)はまさに visibilitychange の visible 復帰で safeRefresh() が走る挙動(popup-entry.js:20210-20224)と一致。POLL_INTERVAL_MS=3_000 以内の連続切替を無視するガード(20217)はあるが、毎回 3 秒以上空けて切り替えると毎回 refresh が走る。
  - **「すべてのタブで点滅」**は、各 watch タブの iframe popup が独立に initialRefreshDone を持つため、毎回タブ切替で**そのタブの popup だけが再描画**するから。複数タブで「全部点滅」は厳密には「タブを訪れた瞬間だけ点滅」が連続して見える可能性が高い。
  - 真の同時点滅源は容疑 α/γ の persist write ストームで nls_ctail_ / nls_cchunk_index_ の write が秒単位で叩かれ、各 watch タブの iframe popup が並行で trailing-edge refresh する。
- 判定: **該当**。ただし主役ではなく増幅役。修正は decideVisibilityAction の hidden 判定を **watch iframe 内 popup の親 watch タブ visibility** に拡張する手があるが、本来は容疑 α/γ の write 集約で根治。

### 容疑 γ (storage write 競合) : **強く該当**

- 根拠 grep:
  - content-entry.js:10049-10112 bufferRowsToTail → chrome.storage.local.set({ [tKey]: tailRowsBuffer, [sKey]: summaryPayload, ...}) を **per-tab** で実行。runIfTabLeader ガード無し。
  - content-entry.js:10120-10154 compactTailIntoMain → persistCommentRowsImpl → 11098 [chunkIndexKey(liveId)]: appendPlan.index を per-tab で write。
  - content-entry.js:10803 const key = commentsStorageKey(liveId); → chunkMode 以外では main 配列直書き(10882 existing = Array.isArray(bag[key]) ? bag[key] : [];)。
  - content-entry.js:10825-10828 readStorageBagWithRetryMeta は 4 試行 + バックオフ 280ms 上限。多タブで read が混雑すると succeeded=false で requeueOnReadFail(10829) 経路に落ちる。
  - content-entry.js:10867 if (err !== STORAGE_OP_TIMED_OUT) throw err; → タイムアウト時は requeue。**多タブの write 競合で read が遅延すると、新着 batch が requeue 経路に流れ、次フラッシュまで保存が遅れる**。
  - persistCoalescer は **per-tab で動く**(content-entry.js:10424)。createPersistCoalescer は src/lib/persistThrottle.js の純関数なので、複数タブで複数インスタンスが存在し、それぞれが独立にフラッシュ。

- 計算量:
  - 1 タブ: 約 2.5 秒に 1 回の tail set + 30〜60 秒に 1 回の chunk append
  - N タブ同一 lv: ストレージ層には N 倍の write イベントが届く(Chrome の storage.local は LevelDB バックエンド・IPC 経由・**シリアライズ**)
  - 観測効果: N タブの read-merge-write が連続して並ぶと、popup 側 await chrome.storage.local.get(...) の応答が遅延し、requestPanelMetricsFromWatchTab などのタイムアウトも近づく
- 既存防御策:
  - persistThrottle で **per-tab 内** のフラッシュ間隔は MIN_PERSIST_INTERVAL_MS=2.5s 〜 computeLivePersistIntervalMs で増分
  - readStorageBagWithRetryMeta(content-entry.js:10825)で read 失敗時 4 回バックオフ + requeue
  - liveChunkMigrated=true 時は **追記専用チャンク** なので write サイズは小さい(splitIntoChunks + planAppendRowsAsChunks)
  - incrementalDedupe(_incrementalDedupEnabled=true・v0.1.513)で全チャンク再読みを回避
- 残るリスク:
  - **タブ間集約が無い**: leader が persist 経路に効かない最大の落ち穴。複数タブで nls_ctail_<lv> を独立 write する経路に対策が一切無い。
  - persistGuardTimeout(content-entry.js:10437) は **4×persistWriteTimeoutMs** で発火するが、多タブで頻発するとサイレントに storage に error 記録され、ユーザーには見えない。
  - **読み混雑時の requeue 増加**: 多タブ環境では requeueOnReadFail がチェーンを伸ばし、結果として 1 つの新着 batch が複数回 read を再試行 → throughput が落ちる。これが「**取得低下**」の主因候補。
- 判定: **強く該当**。修正案 2 の leader-only persist が最短の根治。

### 容疑 δ (v0.1.606-612 退行) : **限定的に該当**

- 根拠 grep:
  - v0.1.606(PR #206・e66ce68): runInterceptReconcile から巨大配列 read/write 撤去。これは **負荷減**であり退行とは逆。
  - v0.1.607(PR #210・857e37b): COMMENTER_FOLLOW_TTL_MS 24h→6h、COMMENTER_FOLLOWING_LIST_TTL_MS 24h→12h(commenterFollowCache.js:27)。
  - v0.1.608(PR #211・27fc4cc): forceRefetchAllCommenterFollowProfiles ボタン追加(popup-entry.js:14749)。明示操作のみで通常 path 影響なし。
  - v0.1.609(PR #212・3afd72f): pure scoring module(supporterPowerScoring.js)。純関数追加のみ。
  - v0.1.610(PR #213・6dc3f29): attachCommenterFollowToReport(popup-entry.js:14876) で includeSupporterPower:true 接続。**マーケ HTML ダウンロード時のみ呼ばれる**経路。多タブ点滅と無関係。
  - v0.1.611/612(PR #214/215): マーケ HTML の表示 UI 追加。同じく **HTML 生成時のみ**。
- 計算量:
  - v0.1.607 の TTL 短縮は **書き手側**(content)では _commenterFollowFetchLastAt の MIN_GAP_MS=8000 / 1 tick あたり BATCH=8 で抑制。書き込みは 30 秒 ×8 件 で大量にはならない。
  - 配信を 1 日 1 回以上やる人なら 24h TTL は焼き付き 1- 根拠 grep:
  - v0.1.606(PR #206・e66ce68): runInterceptReconcile から巨大配列 read/write 撤去。これは **負荷減**であり退行とは逆。
  - v0.1.607(PR #210・857e37b): COMMENTER_FOLLOW_TTL_MS を 24h から 6h に、COMMENTER_FOLLOWING_LIST_TTL_MS を 24h から 12h に短縮(commenterFollowCache.js:27)。
  - v0.1.608(PR #211・27fc4cc): forceRefetchAllCommenterFollowProfiles ボタン追加(popup-entry.js:14749)。明示操作のみで通常 path 影響なし。
  - v0.1.609(PR #212・3afd72f): pure scoring module(supporterPowerScoring.js)。純関数追加のみ。
  - v0.1.610(PR #213・6dc3f29): attachCommenterFollowToReport(popup-entry.js:14876) で includeSupporterPower:true 接続。**マーケ HTML ダウンロード時のみ呼ばれる**経路。多タブ点滅と無関係。
  - v0.1.611/612(PR #214/215): マーケ HTML の表示 UI 追加。同じく **HTML 生成時のみ**。
- 計算量:
  - v0.1.607 の TTL 短縮は **書き手側**(content)では _commenterFollowFetchLastAt の MIN_GAP_MS=8000 / 1 tick あたり BATCH=8 で抑制。書き込みは 30 秒 ×8 件 で大量にはならない。
  - 配信を 1 日 1 回以上やる人なら 24h TTL は焼き付き 1- 計算量:
  - v0.1.607 の TTL 短縮は **書き手側**(content)では _commenterFollowFetchLastAt の MIN_GAP_MS=8000 / 1 tick あたり BATCH=8 で抑制。書き込みは 30 秒 ×8 件 で大量にはならない。
  - 配信を 1 日 1 回以上やる人なら 24h TTL は焼き付き 1 パーセント、6h で改善。**問題視されるのは長尺配信の途中で TTL 6h を跨いだ時のみ再取得**(複数タブだと extfetch leader 配下なので 1 タブだけが叩く)。
- 残るリスク:
  - v0.1.607 で配信中の再 fetch 頻度が増えたことは事実だが、leader gate(per-lv)が効くので **同一配信を複数タブ**では悪化しない。**異なる配信を別タブで開いた場合**は per-lv leader が別物になるため重複 fetch が増えるが、ユーザー報告は同一配信。
  - v0.1.610 以降の analytics 接続は HTML ダウンロード時のみ。多タブ点滅とは関係ない。
- 判定: **限定的に該当(主役ではない)**。v0.1.607 TTL 短縮は症状を**わずかに増幅**した可能性があるが、点滅の根本ではない。

### 容疑 ε (TTL 短縮の副作用) : **概ね不該当**

- 根拠 grep:
  - commenterFollowCache.js:27 COMMENTER_FOLLOW_TTL_MS = 6 * 60 * 60 * 1000(6h)、commenterFollowingListCache.js: COMMENTER_FOLLOWING_LIST_TTL_MS = 12h。
  - content-entry.js:13298 COMMENTER_FOLLOW_FETCH_MIN_GAP_MS = 8_000、13300 COMMENTER_FOLLOWING_LIST_FETCH_MIN_GAP_MS = 30_000、13296 NICO_PROFILE_RESOLVE_BATCH = 3、14027 limit: COMMENTER_FOLLOW_FETCH_BATCH=8。
  - SW background.js は nvapi profile fetch を fetchNicoUserProfilePageHtml(2223) で受ける。明示的なクールダウンは無いが上記 content 側 MIN_GAP で抑制される。
- 計算量:
  - 1 配信あたり: 8 名 / 8 秒 × 30 秒 tick = 約 30 名 / 30 秒。コメンター数 591 なら全員収集に 10 分以上。
  - 同一配信複数タブ: extfetch per-lv leader で 1 タブのみ。よって**TTL を短くしても同一配信の write が増えない**。
  - 異なる配信: タブ別 leader だが、いずれにせよ 8 秒 × 8 件 = 64 件/分 = 0.27 KB/書き込み程度。
- 既存防御策:
  - extfetch leader / MIN_GAP / BATCH / fail-soft(無効レスポンス drop)
- 残るリスク:
  - **KEY_COMMENTER_FOLLOW_CACHE は global map**(全配信の uid を 1 つの map に保存)。1 tick で 8 名 upsert として全タブの popup の onChanged で safeRefresh が走る経路は確かに存在。
  - ただしこの write は **高頻度キーではない**(isHighFrequencyCommentRelatedStorageKey false) として scheduleCoalescedStorageRefresh の 17210 で allHighFreq=false 判定 として即時 refresh。これが 30 秒に 1 回の頻度なので、点滅の中心源としては薄い。
- 判定: **概ね不該当**。容疑 γ と比較するとオーダーが 2 桁低い。

### 容疑 ζ (backfill global queue 枯渇) : **該当(中核)**

- 根拠 grep:
  - globalBackfillQueue.js:15 GLOBAL_BACKFILL_ROTATION_MS = 90_000(タブ間譲り合いの最大連続実行時間)。
  - content-entry.js:14973-14981 setTimeout で 90 秒経つと強制 abort + _backfillProgress.stopReason=rotation_yield。
  - content-entry.js:15206-15208 finally で stopReason が rotation_yield なら _backfillTriedLiveId を空に設定。自タブも次 tick で再起動可能。
  - content-entry.js:15209 _backfillProgress.done = 1; publishBackfillProgress(); として **全タブの popup の onChanged**(popup-entry.js:8003-8019) 経由で 8018 maybeAutoRetryBackfillFromProg(prog); 経由で 7987 markCaughtUpIfComplete(prog) が false なら 7991 triggerBackfillRetry();
  - popup-entry.js:7728-7747 triggerBackfillRetry は KEY_BACKFILL_ENABLED を remove(7730) として set(true)(7731) として KEY_BACKFILL_PROGRESS を remove(7732)。**クールダウン無し・全タブで同時に呼べる**。
  - content-entry.js:12740-12750 KEY_BACKFILL_ENABLED の OFF から ON 立ち上がり edge で runNdgrBackfillOnce() 直接呼び出し として内部で runWhileGlobalLeader(GLOBAL_BACKFILL_LOCK, ...) を通って 1 タブだけが実 backfill。
  - backfillTransientRetry.js:22 BACKFILL_TRANSIENT_STOP_REASONS = [backward_exhausted, no_entry, no_view_base, rate_limited, cap_elapsed]。**rotation_yield は含まれない** として transient retry の対象外(これは正しい設計だが、popup 側の maybeAutoRetryBackfillFromProg は **stopReason に関係なく** done=1 で caught_up でなければリトライを叩く問題が別途ある)。
  - shouldScheduleBackfillTransientRetry の maxRetries = NDGR_BACKFILL_TRANSIENT_RETRY_MAX は content 側で制限される。だが popup 側の triggerBackfillRetry は **storage 経由で間接的に runNdgrBackfillOnce を再起動するため、この回数 cap を回避してしまう**(content の _backfillTransientRetryByLiveId に乗らない)。

- 計算量:
  - 1 タブ + 長尺配信: backfill が 90 秒走って rotation_yield として popup が triggerBackfillRetry として 同じタブが再リーダー として 続きから再開。
  - N タブ + 同一配信: 90 秒で rotation_yield として 全 N タブの popup が **同時に** triggerBackfillRetry として KEY_BACKFILL_ENABLED の remove/set が N 回 として content の onChanged が N×justEnabled edge として 各タブで runNdgrBackfillOnce として 同時に Global lock 取りに行く として 1 タブ昇格、他は ifAvailable で空振り。**この 1 サイクルで KEY_BACKFILL_ENABLED write が 2N 回・onChanged event が 2N×N(全タブ受信)=2N^2 回**。
- 既存防御策:
  - popup-entry.js:8010 caught_up 確定済みなら無視。だが「途中停止」状態の reset には効かない。
  - content の Global lock(runWhileGlobalLeader)で実 backfill は 1 タブ。
- 残るリスク:
  - **rotation_yield の done=1, stopReason=rotation_yield を popup が「途中停止」と解釈してリトライ反射する**。これが多タブで増幅される。これは容疑 ζ の中核症状。
  - 591 件 として 79 件(13 パーセント) はこの「retry として 90 秒で休止 として retry」を繰り返したが、その間 transient retry の dedupe 機構が複雑に絡んでいる可能性。最終的に backward_exhausted で停止して shouldScheduleBackfillTransientRetry の上限に達すれば、UI に「残り約 512 件」と表示される。
- 判定: **強く該当(中核)**。容疑 α/γ と組み合わさって「点滅 + 取得低下」を構成する。

## 新規発見の真因候補

調査中に上記容疑のいずれにも含まれない次の問題を発見:

1. **maybeAutoRetryBackfillFromProg が popup-entry.js:7987 に存在し、prog.stopReason を**読まずに**「done=1 & 95 パーセント未満」だけでリトライを叩く**。stopReason=rotation_yield(タブ間譲渡)・aborted(visibilitychange による中断)・no_progress(decode が止まった) など、本来リトライ対象でない理由でも一律にリトライしてしまう。
   修正案 1 の最も簡単なシード。

2. **triggerBackfillRetry にクールダウンが無い**(popup-entry.js:7728)。全タブの popup が同じ onChanged を受けて同時に呼べる。タブ間ロックは無し。
   修正案 1 で session storage の cooldown を追加。

3. **コメント permanent storage(nls_comments_<lv> / nls_cchunk_* / nls_ctail_<lv>)が leader 対象外**(content-entry.js:10049 / 10090 / 10145・persistCoalescer 10424)。
   修正案 2 で leader-only persist に集約。

4. **content の KEY_BACKFILL_ENABLED onChanged listener が edge 判定後に _backfillTriedLiveId を空にしてガード解除 + 直接 runNdgrBackfillOnce() を呼ぶ**(content-entry.js:12745-12749)。これは「全タブの content script で justEnabled が同時に true になる」設計。runNdgrBackfillOnce 内部で Global lock が効くから実害は限定的だが、**_backfillTriedLiveId を空にする処理は per-tab variable なので、全タブで同時に「次の起動を試みる」状態になる**。次の maintenance tick で全タブが lock 取りに行く競合(ifAvailable は瞬間判定なので 1 タブだけが取れる)が起きる。

5. **document.hidden 判定が popup の inline iframe で必ずしも親タブの可視状態を反映しない**。chrome.tabs API では親 watch タブが背景でも document.visibilityState は iframe ごとに勝手に決まる。実機で多タブ並列時に「全タブの inline popup が visible 判定」になっている可能性がある(これは観察ポイント d で確認推奨)。

## 修正案(複数案・実装はしない)

### 案 1: popup 側で triggerBackfillRetry にタブ間共有クールダウンを入れる(**最小手・15-30分で実装**)

