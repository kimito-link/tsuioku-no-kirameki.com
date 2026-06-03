# Codex 調査レポート: watch ページ「応答しません」現象（v0.1.605 時点）

## エグゼクティブサマリー

- 真因として最も疑わしい: `runInterceptReconcile` が `nls_comments_<lv>` の巨大配列を直接 read -> 全件 map -> set する経路 / storage tail・chunk の初回 seed と compaction が 12000 件級で一発の巨大 structured clone になる経路
- 即修正可能: yes。ただし本レポートでは実装しない。最小修正は `runInterceptReconcile` からコメント配列本体の全件 write を外し、profile cache のみ更新する案。
- 修正の影響範囲: `src/extension/content-entry.js` の intercept reconcile と保存パイプライン、`src/lib/commentChunkStore.js` の全件 read、popup 側の読み出し時 profile 適用。NDGR decode 自体より storage・enrich 反映側が本命。

今回の症状は「6時間41分57秒、約12000コメント、毎回ではない、watch ページ本体で Chrome の応答なしダイアログ」という条件なので、単なる遅延ではなく 5 秒級のメインスレッド占有を探した。現行の通常コメント保存 hot path は tail/chunk/incremental dedupe でかなり対策済みだが、保護を通らない横道が残っている。

最有力の新規候補は `NLS_INTERCEPT_USERID` から入る `runInterceptReconcile`。MAIN world 側は 150ms 単位で userId/nickname/avatar を post し、content 側は 320ms でまとめる。その後 `chrome.storage.local.get([commentsKey, profileCache])` で旧 main 配列を読み、`mergeStoredCommentsWithIntercept` と `applyUserCommentProfileMapToEntries` が全件 `map` し、変更があれば `chrome.storage.local.set({ [commentsKey]: next })` を実行する。これは chunk/tail/incremental dedupe の「新規分だけ追記」設計を迂回しており、12k 件の stale main が残っている環境では応答なしの条件に合う。

## 容疑別の判定

### 容疑 α (deep harvest): 条件付き

- 根拠 grep:
  - `src/lib/commentHarvest.js:276-335` の `runVirtualScrollSweep` は scroll host の `scrollTop` を段階的に動かし、各 step で `raf` と `delay(waitMs)` を挟む。
  - `src/extension/content-entry.js:11854-11882` でユーザースクロール直後は defer し、heavy live では `twoPass: false` になる。
  - `src/lib/commentHarvest.js:270`, `277`, `313`, `320`, `327` で abort 判定が複数回入る。
- 計算量: scroll step 数を S、可視 DOM 数を V とすると概ね O(S * V)。仮想化が効いていれば V は 12000 ではなく可視行数寄り。実測なしだが、コード上は各 step で yield するため単発 5 秒ブロックの本命ではない。
- 既存の防御策: v0.1.598 系の「スクロール中は開始しない・継続しない」設計は `DEEP_HARVEST_USER_SCROLL_DEFER_MS = 1500` と `shouldAbort` で入っている。長時間配信かつ heavy live では two-pass も抑制される。
- 残るリスク: `findCommentListScrollHost` の fallback や `scrollHeight/clientHeight` 参照で layout flush が起きる可能性はある。official gap recovery が重なると体感 stall は作れるが、5秒以上の完全ブロック候補としては storage より弱い。

### 容疑 β (DOM 全件スキャン): 条件付き

- 根拠 grep:
  - `src/lib/commentHarvest.js:121-149` の `findLargestVerticalScrollHost` は subtree を再帰的に歩き、`scrollHeight` / `clientHeight` を読む。
  - `src/lib/commentHarvest.js:158-171` は `.body[role="rowgroup"]` などを試し、見つからない場合に panel 全体の fallback へ進む。
  - `src/lib/commentHarvest.js:319-325` は scroll step ごとに `mergeInto(extractCommentsFromNode(root))` を実行する。
- 計算量: host 探索は O(DOM nodes)、仮想スクロール sweep は O(S * V)。12000 コメント全件が DOM に解放される設計ではないため、通常は O(12000) にならない。
- 既存の防御策: deep harvest 側と同じく `raf`/`delay`/abort がある。heavy live では pass 数も減る。
- 残るリスク: ニコ生側 DOM が変化して rowgroup が見つからず、fallback が大きい subtree に当たる場合は layout 計算が重くなる。これは「条件付き」だが、毎回ではない症状とは整合する。

### 容疑 γ (NDGR backfill): 条件付きで該当

- 根拠 grep:
  - `src/extension/content-entry.js:14751-14757` で backfill auto は既定 ON。
  - `src/lib/backfillFlushThreshold.js:35-54` は stored count に応じて flush 閾値を伸ばす。12000 件では `floor(12000 * 0.5) = 6000` 行が閾値になる。
  - `src/extension/content-entry.js:15058-15071` の `flushPendingBackfillRows` は pending rows をまとめて `persistCommentRows` に渡す。
  - `src/extension/content-entry.js:15180-15196` は閾値到達時の flush と 6 segments ごとの yield。
  - `src/lib/ndgrBackfillCrawl.js:781-818` は segment fetch/decode 後に chats を yield する。
- 計算量: backfill crawl は segment 数を B、segment 内 chats を C とすると O(B + 総 chats)。yield はあるため decode loop 単体で 5 秒を作る可能性は限定的。ただし 6000 行級 batch を保存側に渡す瞬間は storage/tail/compaction の負荷を増幅する。
- 既存の防御策: visible 時のみ、global queue による 90 秒 rotation、fetch/decode 間の yield、segment 上限・byte 上限がある。
- 残るリスク: `pendingBackfillRows.push(...rows)` と capturedAt 付与は単一巨大 segment では同期 loop になる。また大きい batch が `bufferRowsToTail` の tail set と compaction を誘発し、真因 ε と合流する。backfill 自体より downstream storage が危険。

### 容疑 δ (refresh 積み重ね): 概ね不該当

- 根拠 grep:
  - `src/extension/popup-entry.js:6891-6900` の `refreshOfficialEventDomBundle` は storage bundle refresh と ad celebration prime が中心。
  - `src/extension/popup-entry.js:10175-10188` の `refreshAllNorthStarMirrorLanes` は 11 個の refresh を sequential await するが popup 側処理。
  - `src/extension/popup-entry.js:10603-10634` の `requestInterceptCacheFromOpenTab` は明示的に `NLS_EXPORT_INTERCEPT_CACHE` を watch tab に送る別経路。
  - `src/extension/content-entry.js:9076-9107` の `NLS_EXPORT_INTERCEPT_CACHE` は deep option 時に `harvestVirtualCommentList` を走らせる。
- 計算量: 通常 refresh は popup UI/storage 側で、watch ページ main thread に 12000 件級処理を直接載せない。`NLS_EXPORT_INTERCEPT_CACHE` deep は O(S * V) だが、通常 refreshAll の一部ではない。
- 既存の防御策: popup の通常表示 refresh は watch tab の DOM sweep を呼ばない。thumb stats/screenshot も限定的。
- 残るリスク: ユーザーが popup のレポート生成や cache export を同時に走らせていた場合、watch 側の deep harvest と競合し得る。この条件がなければ本命ではない。

### 容疑 ε (storage 膨張): 該当

- 根拠 grep:
  - `src/lib/commentTailBuffer.js:1-13` と `src/lib/commentChunkStore.js:1-23` は、旧設計の巨大配列 full read/write が応答なしの主因だったことを明記している。
  - `src/extension/content-entry.js:9631-9647` で incremental dedupe は既定 ON になり、通常 flush の全チャンク read + O(N) merge は回避される。
  - `src/extension/content-entry.js:9649-9657` で IDB/offscreen 経路は強制無効。したがって現行も `chrome.storage.local` が一次保存先。
  - `src/extension/content-entry.js:9716-9752` の `ensureLiveDedupeStateSeeded` は初回または cross-tab total 不一致で全チャンク read + dedupe state build を行う。
  - `src/extension/content-entry.js:9760-9842` の `seedTailFromMain` は初回に tail と main/chunks を読み、未移行なら chunk migration を一括 set する。
  - `src/lib/commentChunkStore.js:273-289` の `readChunkedComments` は全 chunk を読み、`rows = rows.concat(part)` で連結する。
  - `src/lib/commentTailBuffer.js:177-195` は 5000 件以上では tail 1500 件まで compaction を遅らせるが、閾値到達時の compaction 自体は重い。
  - `src/extension/content-entry.js:11107-11127` は chunk mode なら新規 chunks だけを書くが、非 chunk mode は `{ [key]: next }` で巨大配列を書く。
  - 新規強候補: `src/extension/content-entry.js:1498-1545` の `runInterceptReconcile` は chunk/tail を使わず、`commentsStorageKey(lv)` の配列を直接 read -> patch -> set する。
- 計算量: 通常 hot path は incremental mode なら O(追加分)。ただし seed/reseed/migration/reconcile は O(N)、N=12000 で数 MB 級の structured clone を伴う。実測なしだが Chrome の storage get/set clone が renderer main thread を巻き込むため、環境次第で 5 秒超候補。
- 既存の防御策: tail buffer、append-only chunk、incremental dedupe、storage timeout、coalescer yield がある。`flushCommentTailNow` は 5000 件以上で pagehide 強制 compaction を skip する。
- 残るリスク: `runInterceptReconcile` はこれらの防御策を通らない。特に chunk migration 後も旧 main key はバックアップとして残る設計なので、stale でも 12000 件級配列が残っていれば毎回 full clone 対象になる。

### 容疑 ζ (WS hot path): 条件付き、直接原因としては弱い

- 根拠 grep:
  - `src/extension/page-intercept-entry.js:237-272` は intercept userId を 150ms timer でまとめて post する。
  - `src/extension/page-intercept-entry.js:597-651` は NDGR chats を dedupe したうえで chat rows post を schedule する。
  - `src/extension/content-entry.js:1564-1628` は NDGR rows を batch dedupe し、`persistCommentRows` に渡す。
  - `src/extension/content-entry.js:1633-1658` は `NDGR_PENDING_FLUSH_THRESHOLD = 240`、`NDGR_PENDING_MAX = 1200`、150ms flush で pending を抑える。
  - `src/lib/timingConstants.js:14` は `interceptReconcileMs: 320`。
- 計算量: WS 受信から rows post までは chunk/batch 化されており、1 コメントごとの storage write ではない。直接の hot path は O(batch)。
- 既存の防御策: MAIN world 側の post chunk、content 側の pending cap、dedupe、coalescer がある。
- 残るリスク: WS 由来の `NLS_INTERCEPT_USERID` が `runInterceptReconcile` を高頻度に起動し、真因 ε の full-array reconcile を誘発する。つまり WS hot path そのものではなく、userId reconcile の storage side effect が問題。

## 新規発見の真因候補

- `runInterceptReconcile` の legacy main-array full write
  - MAIN world: `enqueue` / `learnUser` が 150ms で `NLS_INTERCEPT_USERID` を post する (`src/extension/page-intercept-entry.js:280-315`, `317-335`)。
  - content: `queueInterceptReconcile` が 320ms でまとめる (`src/extension/content-entry.js:1443-1455`)。
  - reconcile: `chrome.storage.local.get([key, KEY_USER_COMMENT_PROFILE_CACHE])` で旧 main 配列を読み (`src/extension/content-entry.js:1498-1502`)、`mergeStoredCommentsWithIntercept` が全件 `entries.map` (`src/lib/mergeStoredCommentsWithIntercept.js:33-78`)、`applyUserCommentProfileMapToEntries` も全件 `entries.map` (`src/lib/userCommentProfileCache.js:226-296`)、最後に `chrome.storage.local.set(saveBag)` で comments key を丸ごと書く (`src/extension/content-entry.js:1540-1545`)。
  - 通常 persist path では `src/extension/content-entry.js:11091-11094` に「過去行への patch は永続化せず popup 側で read-time enrich」と明記されているが、reconcile はそれと逆に過去行 patch を保存してしまう。設計方針の不一致がある。
- chunk seed / reseed の全件連結
  - `readChunkedComments` は全 chunk を一括 get したあと `concat` で新配列を作る。初回 seed や cross-tab total mismatch 時だけとはいえ、12k 件以上では clone + concat + dedupe state build が同じ turn に寄る。
- popup export deep 経路
  - 通常 refresh ではないが、`NLS_EXPORT_INTERCEPT_CACHE` deep は watch tab で `harvestVirtualCommentList` を走らせる。ユーザー操作タイミングによって deep harvest と保存 flush が重なると stall を増幅し得る。

## 修正案（複数案・実装はしない）

### 案 1: `runInterceptReconcile` からコメント配列本体の full write を外す

- 内容: `runInterceptReconcile` は `KEY_USER_COMMENT_PROFILE_CACHE` の更新だけに限定し、`commentsStorageKey(lv)` の read/set と `mergeStoredCommentsWithIntercept` / `applyUserCommentProfileMapToEntries(next, profileMap)` を hot path から外す。過去コメントへの nickname/avatar 反映は、既存方針どおり popup/read-time enrich に寄せる。
- 影響範囲: `src/extension/content-entry.js` の intercept reconcile、popup の表示時 profile 適用確認、既存テスト `userCommentProfileCache` / `mergeStoredCommentsWithIntercept` の期待整理。
- リスク: 保存済みコメント行そのものには userId/avatar patch が即時焼き込まれなくなる。ただし現行 persist path の chunk mode も過去行 patch を永続化しない設計なので、方針としては整合する。
- v0.1.592 baseline との互換性: storage schema を変えないため互換性は高い。旧 main 配列を破壊しない。
- 回帰テスト方針: 12k 件相当の comments key を置いた状態で `NLS_INTERCEPT_USERID` 相当の reconcile を流し、comments key が set されず profile cache だけ更新されることを単体/統合で確認する。popup 側で profile が表示に反映されることも確認する。

### 案 2: row patch が必要な場合は overlay key 化し、巨大 comments key を書き換えない

- 内容: commentNo -> userId/nickname/avatar の patch を `nls_comment_patch_<lv>` のような小さい overlay key に追記・圧縮し、読み出し時に comments + tail + chunks + overlay を合成する。`nls_comments_<lv>` は rewrite しない。
- 影響範囲: content reconcile、popup/history/export の読み出し合成、clean migration の対象キー整理。
- リスク: overlay の寿命管理と重複解決が増える。読み出し時の合成が増えるため、popup 側で O(N) が発生するが watch page 本体の freeze からは切り離せる。
- v0.1.592 baseline との互換性: 既存 comments 配列はそのまま。overlay が読めない旧版では補完表示が落ちるだけで記録本体は壊れない。
- 回帰テスト方針: overlay あり/なし、同一 commentNo の複数 patch、184 匿名、avatar URL の uid 不一致除去をテーブルテスト化する。

### 案 3: seed/reseed/migration を分割し、全 chunk concat を避ける

- 内容: `readChunkedComments` の全件 `concat` を、dedupe state builder へ chunk iterator として渡す。未移行 main -> chunks の migration も一括 `chrome.storage.local.set({ ...allChunks })` ではなく小分け set + yield にする。
- 影響範囲: `src/lib/commentChunkStore.js`、`ensureLiveDedupeStateSeeded`、`seedTailFromMain`、関連テスト。
- リスク: migration 中断時の冪等性を今より厳密に検証する必要がある。chunk index を最後に書く方針を守らないと不完全 migration が見える。
- v0.1.592 baseline との互換性: chunk key schema を変えなければ互換性あり。実装時は index version を上げないで済ませられる可能性が高い。
- 回帰テスト方針: 0件、999件、1000件、12000件、migration 中断後再実行、cross-tab total mismatch を単体で確認する。

### 案 4: backfill flush を storage 状態に応じて分割する

- 内容: `computeBackfillFlushThreshold` の上限だけを下げるのではなく、`flushPendingBackfillRows` で 6000 行級 batch を `persistCommentRows` に渡す前に 500-1000 行程度へ分割し、間に `backfillYieldToPage` を入れる。tail が 1500 件に近い場合は compaction と同 turn に重ならないよう defer する。
- 影響範囲: NDGR backfill ingest と persist coalescer。
- リスク: 小分けにしすぎると flush 回数が増え、storage API 呼び出し回数が増える。coalescer と組み合わせて「小分けにしたのに再結合される」状態を避ける必要がある。
- v0.1.592 baseline との互換性: 保存 schema は変えないため互換性あり。
- 回帰テスト方針: 12000 件既存 + backfill 8000 件追加の疑似入力で、1 turn に渡る batch サイズと compaction 発火回数を診断ログで確認する。

## 推奨アクション

- 司令塔（Claude Code）への推奨: 最初に案 1 を別ブランチで実装・検証する。理由は、watch ページ側の 5 秒ブロック候補を最小差分で潰せ、既存の chunk mode 方針「過去行 patch は read-time enrich」に揃うため。
- 次点で案 3 を進める。seed/reseed は頻度こそ低いが、初回ロード・リロード・cross-tab 時の「毎回ではない」freeze と相性がよい。
- 実機診断では `interceptReconcile` の実行回数、`commentsTouched`、comments key の配列長、storage set payload size、所要時間を data-nls 診断に一時追加して確認する。ただし本レポートではコード変更しない。
- deep harvest と DOM scan は引き続き監視対象だが、現時点では storage/reconcile を先に潰す方が効果が大きい。
