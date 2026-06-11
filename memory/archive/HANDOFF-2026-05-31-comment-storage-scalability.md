# HANDOFF: コメント保存のスケーラビリティ改修（巨大放送×多タブ）

作成: 2026-05-31 / 担当: Cursor (Opus 4.8) → 次担当へ
対象ブランチ: `feature/live-item-throw-by-user`（このセッションでの作業も同ブランチ）

---

## 0. これは何の引継ぎか

「ニコ生コメントを `chrome.storage.local` に記録するが、**①既に大量記録済みの放送を開くと固まる ②巨大放送のバックフィルが遅い ③多タブ（7〜8本・うち数本が2万件級）でパネルが『—』固定・ロード継続・ページが応答しません**」という一連の不具合を追ってきた。

このセッションで **①は修正済み（v0.1.506）/②③の一部は緩和（v0.1.507）**。残るのは **②バックフィル速度** と **③多タブ飽和（表示/ストレージI/O）** で、これらは**アーキテクチャ改修（本ドキュメントの§4）が必要**。

---

## 1. 直近で何を直したか（このセッションの成果）

すべて `npm run verify` 通過済み・ビルド済み。ソースの正は `src/`、バンドルは `npm run build` → `extension/dist/`。

| ver | 直した内容 | 主な変更ファイル |
|---|---|---|
| 0.1.505（前セッション） | 保存方式を「テールバッファ方式」に刷新（新着を小さな `nls_ctail_<lv>` に追記し、一定量/時間で本体 `nls_comments_<lv>` へ畳み込み） | `src/lib/commentTailBuffer.js`（新規）, `src/extension/content-entry.js`, `src/extension/popup-entry.js` |
| **0.1.506** | **「既に1万件超を記録済みの放送を開き直すと記録が前進しない（16,849で固定）」を修正。** 原因は `seedTailFromMain` の巨大メイン read が timeout すると `tailSeededLiveId` が立たず、毎フラッシュで巨大 read を撃ち直し→テール追記が一度も走らない。seed を **best-effort 化**（timeout でも必ず seed 完了・記録を止めない。欠けた dedup は畳み込み時の `mergeNewComments` が最終担保） | `src/extension/content-entry.js`（`seedTailFromMain`） |
| **0.1.507** | **「多タブで大量記録の放送を開くと『ページが応答しません』」を修正。** 真因は **タブを裏に回した瞬間（`visibilitychange`）と `shouldCompactTail` の hidden 強制**で、巨大放送が一斉に「全件畳み込み（2万件の構造化クローン）」を開始→共有レンダラ硬直。巨大メイン（`BIG_MAIN_THRESHOLD=5000` 超）では **畳み込みをテール満杯近く（`TAIL_COMPACT_COUNT_BIG=1500`）の時だけに絞り、hidden 強制・短間隔・タブ切替時の強制を無効化** | `src/lib/commentTailBuffer.js`（`shouldCompactTail` をサイズ対応化＋定数追加）, `src/extension/content-entry.js`（`flushBatchViaTail` に `mainCount` を渡す／`flushCommentTailNow` は巨大メインで強制畳み込みをスキップ） |

### 実機確認できたこと
- 新規〜中規模放送: 正常に記録が増える（公式比 100% 到達も確認）。
- 既存大量放送の開き直し: 16,849固定が解消、増えるようになった。
- 巨大放送（公式24,000超）: フリーズせず**進む**が「一気には取れない」（＝§2 の②）。
- **7〜8タブ（数本が2万件級）**: パネルが「—」固定・白ロード継続・タブ切替でローディング（＝§2 の③）。**※「ページが応答しません」ダイアログ自体は v0.1.507 で出にくくなったが、今度はパネル読み取り側が飽和**。

---

## 2. 残っている問題（次担当のスコープ）

### ② 巨大放送のバックフィルが遅い（「いっきにガッとは取れない」）
- 原因: 畳み込み（テール→本体）のたびに **本体配列を丸ごと read→merge→write**。本体が大きいほど1回が重く、過去2万件超を追いつかせるのに時間がかかる（実質 O(N²) 的）。
- v0.1.507 で「重い畳み込みの**回数**」は最小化したが、「**1回あたりの重さ**」は残っている。

### ③ 多タブ（7〜8本）でパネル「—」/ロード継続/タブ切替ローディング
- 原因: **1放送＝1本の巨大配列**を、各タブの「記録の保存」も「パネルの表示」も `chrome.storage.local` 経由で読み書き。タブ数×配列サイズで**単一ストレージI/Oが飽和**→パネルの read がタイムアウト→`data={}`→全カード「—」（v0.1.481 で既知の穴）／初回ロードが終わらない。
- **重要**: 「—」は**表示（読み取り）側の失敗**で、**記録（小さなテール追記）は裏で続いている可能性が高い**＝データは概ね無事と思われる（要確認: 余分タブを閉じて F5 →記録が本来件数で復活するか）。

### （付随）レポート/エクスポートのテール取りこぼし
- 巨大放送では本体未畳み込みのテールに**最大約1,500件**が残る。レポート/エクスポートは `nls_comments_<lv>` だけ読む箇所が多く（`src/extension/popup-entry.js` の 7473 / 10963 / 14239 / 14290 ほか）、**テール分を取りこぼす**。データ自体は消えていない。

---

## 3. アーキテクチャの現状（読む前提知識）

- **保存キー**:
  - 本体（正本）: `nls_comments_<lv>`（1放送=1配列。`commentsStorageKey(lv)`）
  - テール（新着の安い追記先・v0.1.505〜）: `nls_ctail_<lv>`（`tailStorageKey(lv)`）
  - 取り込みハートビート: `nls_comment_ingest_log_v1`
- **純関数**: `src/lib/commentTailBuffer.js`（`selectNewTailRows` / `appendToTail` / `shouldCompactTail` / `tailStorageKey` / `collectCommentNoKeys` / 定数）。**ユニットテスト**: `src/lib/commentTailBuffer.test.js`。
- **content 側 持続フロー**（`src/extension/content-entry.js`）:
  - `persistCoalescer`（最小間隔は `computeLivePersistIntervalMs` / `src/lib/livePersistInterval.js`）→ flush で `flushBatchViaTail(batch)`。
  - `flushBatchViaTail`: 初回 `seedTailFromMain` → `bufferRowsToTail`（テールへ追記＋heartbeat）→ `shouldCompactTail` 真なら `compactTailIntoMain`。
  - `compactTailIntoMain` → 既存 `persistCommentRowsImpl`（本体 read+merge+write）を `__isCompaction/__noRequeue` で再利用。
  - hide/pagehide: `flushCommentTailNow`（巨大メインでは v0.1.507 でスキップ）。
- **popup/inline 側 表示**（`src/extension/popup-entry.js`）:
  - `paintWatchPopupUi` 周辺で本体 `nls_comments_<lv>` を heavy read＋テール `nls_ctail_<lv>` を light read し、**main+tail を concat して表示**（`normalizeTailRowsForDisplay`）。
  - 再描画トリガ: `chrome.storage.onChanged` → `scheduleCoalescedStorageRefresh`（高頻度キー判定 `isHighFrequencyCommentRelatedStorageKey` は `^nls_comments_` 等。**`nls_ctail_` は未登録**）。
  - polling: inline/side=3s, standalone=30s。`watchMetaCache.snapshotFetchActive` が立っている間 tick をスキップ（`withTimeout(15s)`+finally でリセットされる設計）。多タブ飽和でパネルが固まると、**レンダラ自体がCPUブロックされて tick が動けない**ことが「—」/ロード継続の実体（フラグ論理バグではなくCPU飽和）。

---

## 4. 次にやる実装（Repro 概念の本丸・ユーザー合意済み）

参考にした概念: https://repro.io/products/booster/ の「先読み・事前計算（0秒表示）」「重い処理を描画スレッドから外す（INP）」。**製品そのものは MV3 のリモートコード禁止で不可。概念だけ自前実装**。

### 4-A. パネルは「軽いサマリ」だけ読む（0秒表示・③の本命）
- content 側で**小さな要約キー**（例 `nls_csummary_<lv>` / `nls_panel_summary_<lv>`）を作り、記録件数・公式比・来場・上位ユーザー数・最終取り込み時刻・直近Nコメントなど **パネル初期表示に必要な最小限**だけを書く。
- パネルのカード描画は巨大配列ではなく**この要約キー**を読む。詳細（全コメント集計）は要求時/段階描画で後追い。
- **v0.1.595 追加:** storage 飽和の初回 open 向けに `NLS_EXPORT_PANEL_METRICS` で **content メモリ → popup 直結**（左下オーバーレイと同じ速報をカードへ）。storage 書き込みは進捗 tick / metrics 要求時にも同期。
- 効果: 多タブでも各パネルが巨大配列をデシリアライズしなくなる→ストレージI/O飽和と「—」/ロード継続が激減。
- 注意: `isHighFrequencyCommentRelatedStorageKey` に要約キー（または `nls_ctail_`）を登録して再描画が走るように。

### 4-B. 本体を追記専用チャンクに分割（②③の根治）
- `nls_comments_<lv>` 1本をやめ、**`nls_cchunk_<lv>_<seq>`**（例 1000件/チャンク・追記専用）へ。畳み込み＝**新チャンクを足すだけ**（既存チャンクは書き換えない）＝書き込みが**件数非依存の一定の軽さ**に。
- 読み手（popup 表示・レポート・past-live 移行・dedup）は**全チャンク＋テールを concat**。helper（例 `readCommentsAllChunks(lv)`）を1つ作って差し替える。
- **移行**: 既存 `nls_comments_<lv>`（巨大配列）を初回に1回だけチャンク分割するマイグレーション。**既存データを壊さない**こと（DO_NOT_REWRITE）。
- 効果: バックフィルの各バッチ書き込みが一定の軽さに（「ガッと取れない」改善）＋多タブ書き込み飽和の緩和。

### 4-C. （付随）レポート/エクスポートがテール＋全チャンクを読む（取りこぼし修正）
- §2 付随の箇所を helper 経由に統一。

### （検討）SW へ重い保存をオフロード
- background.js（別プロセス）に本体I/Oを移すと page renderer が一切重くならない。ただし大改修。4-A/4-B を先にやってから検討で良い。

---

## 5. 実装上の鉄則（必読）

- **記録（ユーザーの録画データ）を絶対に壊さない/落とさない**。移行は冪等・既存キー温存。
- **DO_NOT_REWRITE**: 動いているパスを理由なく別実装に置換しない。最小差分・段階実装・各段で `npm run verify`。
- **`chrome.storage` キー名・`NLS_*` メッセージ型・`frameId` 経路**の互換に注意（AGENTS.md / .cursor ルール）。
- 入れ替え時は**リロードで現セッションの取り込みが一旦リセット**される（データは残る）。録画中の実装投入はユーザーに timing 確認。
- 反映1セット: build → commit/push → 本体 pull → `chrome://extensions` リロード → watch タブ F5。
- 純関数は `src/lib/` に置き**ユニットテスト必須**（`commentTailBuffer.test.js` に倣う）。
- changelog: `src/lib/changelog.js` 先頭に追加、**summary は35字以内**（`changelog.test.js` が検査）。version は manifest/package/changelog/`changelog.test.js` の4点同期。

---

## 6. 次担当が最初にやること

1. ユーザーに「余分タブを2本まで閉じて F5 →各放送の記録が本来件数で復活するか」を確認（②③がデータ損失か表示飽和かの最終切り分け）。
2. **4-A（軽量サマリ→パネルがそれを読む）から着手**（③に最も効く・比較的独立・リスク低め）。
3. 次に **4-B（チャンク分割＋移行）**（②③根治・要マイグレーション・最も慎重に）。
4. 仕上げに **4-C（レポート/エクスポートのテール＋チャンク対応）**。

各ステップで `npm run verify` → 実機（Claude-in-Chrome 等）で「多タブ非飽和」「巨大放送が止まらず増える」「レポートに取りこぼしなし」を確認。
