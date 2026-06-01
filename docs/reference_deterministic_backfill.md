# reference: 決定論 NDGR バックフィル（コペルニクス展開 / B 案）

> 司令塔（Claude/Cursor）が作成した実装指示書。**Codex CLI はこのファイルと AGENTS.md を読んでから実装すること。**
> 目的: 途中参加でも「記録対象コメント（運営/gift/system を除く一般コメント）」を取りこぼしゼロで遡り切る。

---

## 1. 背景と真因（なぜ作り直すか）

### 症状（再発の歴史）
途中参加した放送で、過去ログバックフィルが **公式件数の途中（実機で 12% / 33% / 37% / 47% / 51% / 55% / 68% / 76%）で停止**し、停止理由が `reached_start`（＝「配信開始まで遡り切った」）と表示される。記録カードには「過去ログが公式件数に届いていません（理由: reached_start・残り約N件）」と出る。

### 真因
現行の `src/lib/ndgrBackfillCrawl.js`（`crawlNdgrBackward`）は、以下の **ヒューリスティック**で「配信開始に到達した」を判定している:

- `chainLooksLikeStreamStart(chats, { nearStartCs })`: 取り込んだ区画の chat のうち、**vpos が開始近傍（≤30 秒）の一般コメントが 2 件以上**あれば「開始区画」とみなす（`NDGR_BACKFILL_NEAR_START_VPOS_CS=3000`, `NDGR_BACKFILL_NEAR_START_MIN_HITS=2`）。
- backward 連鎖（`decodePackedSegmentNav` の `nextUri`）は **時刻バケット境界で `nextUri=''` 終端**する（配信開始ではない）。そのたびに `?at={推測した過去 unixtime}` で**再シード**して前のバケットへ移ろうとする。

この 2 つが脆い:
1. **vpos 誤判定**: 配信中盤の区画に、運営アナウンス/gift お知らせ/system の vpos 極小コメントが 2 件以上紛れると、中盤なのに「開始区画」と誤発火 → 偽 `reached_start`。除外フィルタ（`isRecordablePlainComment` 相当）を重ねてきたが、vpos ヒューリスティックである限り再発し続けている。
2. **`?at` 再シードの当て推量**: バケット幅（実測 30〜50 秒）を推測して `?at` を後退させるが、疎区間・幅広バケット・隙間落ちで「入口が見つからない / 同じ区画に戻る」が起き、`no_progress` か偽 `reached_start` に倒れる。

### 自動回復が効かない理由（今回ユーザーが指摘）
`shouldRearmBackfillForOfficialGap` は `reached_start` でも「記録 < 公式 × 0.5」の大ギャップなら **`reachedStartGapOverride` で再 sweep を許可**する設計。しかし:
- フル sweep し直しても **同じ偽 `reached_start` の壁**に当たり、過去ログは進まない（伸びるのはライブ新規ぶんだけ）。
- 再アームには上限 `maxGapRearms=40`（`timingConstants.js`）があり、進捗ゼロの空振りで budget を消費 → 約24分で打ち止め → 手動「もう一度ためす」しか残らない。

→ **vpos ヒューリスティックを廃し、NDGR の構造（ポインタ）だけで決定論的に遡り切る**のが本質的解決。

---

## 2. ゴール（受け入れ条件）

1. 途中参加（経過 2〜3 時間級・公式数千件）で、記録対象コメントを **公式件数の 94% 以上**まで自動で遡り切る（gift/運営/system ぶんは対象外なので 100% にはならない＝`AGENTS.md §3.3`）。
2. `reached_start`（達成宣言）は **NDGR ポインタが真に枯渇したときだけ**発火する。`vpos` による開始判定は**判定ロジックから除去**（診断用に残すのは可）。
3. 偽 `reached_start` で「記録 < 公式 × 0.5」のまま固定される帯を**構造的に作らない**。
4. 既存の契約（後述 §5）を壊さない。`npm run verify` がグリーン。
5. 既存パスからの**段階移行**: フラグで新旧を切替可能にし、旧パスは即削除しない（A/B 比較・ロールバック余地）。

---

## 3. 現行アーキテクチャ（実装前に必読の地図）

### 3.1 デコード（`src/lib/ndgrDecode.js`）— ポインタの正
- `decodeChunkedEntry(buf)` → `{ segmentUri/segmentUris, backwardUri, previousUris[], nextAt }`
  - `backwardUri`: さらに過去へ辿る **Backward API**(`/data/backward/v4/...`) の URI。
  - `previousUris[]`: ChunkedEntry field3（`previous`）由来の **segment URI**。「直近過去の区画」を指す＝**バケット間を橋渡しする決定論ポインタ**（`?at` 推測の代替候補）。
  - `nextAt`: 未来方向 long-poll ポインタ（ライブ追従用。backfill では使わない）。
- `decodePackedSegmentNav(buf)` → `{ results: NdgrChat[]-ish, nextUri }`
  - **Backward API 応答は単一 PackedSegment**。`messages` をインライン抽出し、`next.uri`(field2) が **次に古い backward URI**。`nextUri===''` なら**その連鎖は終端**（バケット境界 or 配信開始）。
  - 詳細プロトコルは decode 内コメント（行 879〜925 付近）に記載。

### 3.2 巡回エンジン（`src/lib/ndgrBackfillCrawl.js`）
- `crawlNdgrBackward(opts)`: async generator。純ロジック（I/O は `opts.fetchBinary/sleep/now` 注入、副作用は `yield` のみ）。
  - opts: `{ viewBase, fetchBinary, sleep?, now?, caps?, fetchGapMs?, programStartSec?, resumeFromVpos?, signal? }`
  - 戻り値: `{ stopReason, segmentsFetched, rowsSeen, bytesFetched, minVposReached, diagnostics? }`
  - 現行フロー: `?at=now`→nextAt → `?at={過去}`で入口 backwardUri 探索 → Backward API を `nextUri` で辿る → 終端で `?at` 再シード → `chainLooksLikeStreamStart` で `reached_start` 判定。`drainPreviousUris` で previous も一部回収。
- 停止理由 enum `NdgrBackfillStopReason`:
  `'backward_exhausted' | 'reached_start' | 'cap_reseeds' | 'visited_revisit' | 'cap_segments' | 'cap_elapsed' | 'cap_bytes' | 'cap_rows' | 'aborted' | 'rate_limited' | 'no_view_base' | 'no_entry' | 'no_progress'`
- caps: `NDGR_BACKFILL_DEFAULT_CAPS`（segments 20000 / elapsedMs 900000 / bytes 60MB / rows 100000）, throttle `NDGR_BACKFILL_FETCH_GAP_MS=15`, backoff `NDGR_BACKFILL_BACKOFF_MS`。

### 3.3 オーケストレーション（`src/extension/content-entry.js`）
- `runNdgrBackfillOnce(...)`: 起動・`forceFullSweep`（gap≥170 で resume 破棄）・resume 読み書き（`backfillResumeStorageKey`）・進捗 `_backfillProgress`(done/stopReason)・診断面・`saveBackfillResume`。
- `maybeRearmBackfillForGapCatchup()`: 自動再アームのウォッチドッグ（`shouldRearmBackfillForOfficialGap` + `reachedStartGapOverride` + `effectiveMinGap` + `maxGapRearms` + cooldown）。
- `chats → 保存行`は `src/lib/ndgrChatRows.js` の `ndgrChatsToMergeRows`（gift/system guard・vpos 保持）。**この整形は変更しない。**

### 3.4 純関数・定数
- `src/lib/shouldRearmBackfillForOfficialGap.js`（再アーム判定・`computeEffectiveBackfillRearmMinGap`）
- `src/lib/timingConstants.js`（`OFFICIAL_GAP_DEEP_TIMING`, `BACKFILL_FALSE_COMPLETION_RATIO`）
- `src/lib/storageKeys.js`（resume キー等）
- `src/lib/backfillRinkuNarration.js`（記録カードの未達文言。`stopReason`/比率を参照）

---

## 4. 設計（B 案・決定論巡回）

### 4.1 中核アイデア
「配信開始＝ポインタが尽きた」を**唯一の達成条件**にする。具体的には **BFS/DFS の決定論巡回**:

1. 入口 ChunkedEntry を取得（現行同様 `?at={now - SEED_LAG}` で backwardUri を得る。`?at` は**入口の特定にだけ**使い、以降の遡及には使わない）。
2. **訪問キュー**を `visited:Set<string>`（URI 正規化キー）で管理し、次を決定論的に辿る:
   - Backward API 連鎖: `backwardUri` → `decodePackedSegmentNav` → chats を yield → `nextUri` があれば push（未訪問なら）。
   - **バケット橋渡し**: Backward 連鎖が `nextUri===''` で終端したら、**`?at` 推測ではなく**、直近 ChunkedEntry の **`previousUris`**（および各 PackedSegment 応答から得られる前方/前区画ポインタがあればそれ）を辿って前のバケットの ChunkedEntry/segment を取得し、その `backwardUri` から再び連鎖する。
3. **達成条件 `reached_start`**: 「未訪問の backward / previous ポインタが 1 つも無くなった」ときだけ。`vpos` は使わない。
4. 途中の安全網（既存維持）: caps（segments/bytes/rows/elapsedMs）, 429/403 backoff→`rate_limited`, abort（hidden/SPA）→`aborted`, visited 再訪→スキップ（無限ループ防止。`visited_revisit` は「進める先が visited だけ」になった時の終了に転用可）。

> ⚠️ **プロトコル検証が必要**: 「`previousUris` だけで配信開始まで橋渡しできるか」は実機/フィクスチャで確証を取ること。もし `previous` だけでは届かない区間があるなら、`?at` 再シードを**フォールバック**として残してよい。ただしその場合でも **`reached_start` の判定基準は vpos ではなくポインタ枯渇**にすること（`?at` 後退して入口が見つからない＝ `no_progress` 継続 or ポインタ枯渇判定）。最古到達は `vpos` ではなく「もう辿る先が無い」で判断する。

### 4.2 フラグによる段階移行
- `src/lib/storageKeys.js` に `KEY_NDGR_DETERMINISTIC_BACKFILL`（例: `'nls_ndgr_deterministic_backfill_enabled'`）を追加。
- content-entry 側で `chrome.storage.local` から読んだフラグ（既定値の方針は司令塔に確認 → **既定 true で実装し、kill switch として false で旧パス**に倒せる形が望ましい）で `crawlNdgrBackward`（旧）/ `crawlNdgrBackwardDeterministic`（新）を切替。
- 新エンジンは**別 export 関数**として追加（旧 `crawlNdgrBackward` はそのまま残す）。共有ヘルパ（`buildViewAtUrl`/`fetchWithThrottle`/decode 呼び出し）は再利用。

### 4.3 resume の再定義
- 現行 resume は `minVpos`（vpos センチ秒）基準。新方式は vpos に依存しないので、resume は **「最後に到達した最古 backward/previous URI」** または **visited URI 集合のダイジェスト**で持つのが自然。
  - 後方互換のため、storage キーは新設（旧 `backfillResumeStorageKey` は触らない or 併存）。
  - 大ギャップ時の `forceFullSweep`（resume 破棄）はそのまま活かせる。

---

## 5. 壊してはいけない契約（リグレッション禁止）

- `NdgrBackfillStopReason` の **enum 文字列は維持**（popup / narration / rearm が参照）。新たな理由を足すなら enum と参照側を両方更新。
- generator の **yield イベント形状** と最終 return 形状（`stopReason/segmentsFetched/rowsSeen/bytesFetched/minVposReached`）を維持（`minVposReached` は新方式で算出不能なら `null` 可だが、フィールドは残す）。
- `ndgrChatsToMergeRows`（保存行整形）・`chrome.storage` キー・`NLS_*` メッセージ型・`frameId` 経路は**変更しない**。
- caps / throttle / backoff / abort-on-hidden の安全網を**弱めない**（BAN 回避・暴走防止）。
- マルチタブ制御（可視タブだけが重い backfill を起動）の前提を壊さない。
- `AGENTS.md §3.3`: `reached_start` のときだけ「ぜんぶ届いた」を宣言。途中は正直な文言。

---

## 6. テスト要件（フィクスチャ純テスト）

`src/lib/ndgrBackfillCrawl.test.js` の既存フィクスチャ流儀に合わせて、新エンジンの単体テストを追加:

1. **ポインタ枯渇で reached_start**: backward→nextUri→previous を辿り、全ポインタが尽きたら `reached_start`。vpos に依存しないこと（中盤区画に vpos≈0 の運営/gift を複数仕込んでも誤発火しない＝旧バグの回帰防止ケース）。
2. **バケット橋渡し**: Backward 連鎖が `nextUri===''` 終端後、`previousUris` で前バケットへ進めること。
3. **visited 再訪防止**: ポインタが循環/重複しても無限ループせず終了。
4. **caps**: segments/bytes/rows/elapsed 各上限で正しい stopReason。
5. **abort / rate_limited**: signal abort と 429 backoff 枯渇で正しい停止。
6. **途中参加シナリオ**: 入口が配信中盤でも、開始まで遡って全区画の chats を流すこと（件数で検証）。

`npm test`（vitest）/ `npm run typecheck` / `npm run lint` をパスさせる。

---

## 7. やらないこと / 禁則

- ❌ `privacy.html` / `description-ja.txt` / CWS 申請ファイルに触れない。
- ❌ `MEMORY.md` / `memory/reference_*.md` を編集しない（司令塔専用）。
- ❌ `ndgrChatRows.js` の保存行整形・gift guard を変えない。
- ❌ 旧 `crawlNdgrBackward` をいきなり削除しない（フラグ併存で移行）。
- ❌ `push` しない。commit までで停止（司令塔が diff を読み戻してレビュー＋実機検証する）。
- バージョン bump（manifest/package/changelog）は司令塔が最後に行う。Codex は触らなくてよい。

---

## 8. 完了時の報告（Codex → 司令塔）

- 変更ファイル一覧（`git diff --stat`）。
- 新エンジンの設計要約（ポインタ巡回の終了条件・previous 橋渡しが効いたか・`?at` フォールバックを残したか）。
- 追加テストと結果（`npm test` の該当 spec）。
- プロトコル上の不確実点（`previous` だけで開始到達できたか等、実機検証が要る項目）。
- 既存契約（§5）への影響評価。
