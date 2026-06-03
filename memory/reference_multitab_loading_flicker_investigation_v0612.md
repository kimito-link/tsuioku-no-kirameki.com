# reference: 複数タブで「ローディング点滅」+ 取得低下 真因調査依頼書(v0.1.612 時点)

> ⚠️ Codex への調査依頼の正本。AGENTS.md + 本ドキュメント + 関連 reference を読んで自走し、
> `docs/codex-multitab-flicker-investigation-v0612.md` にレポートを出力すること。**実装はしない**(調査のみ)。
>
> 司令塔(Claude Code)がユーザーから受けた症状報告を、Codex の専門領域
> (放送系・`memory/codex_collaboration_rules.md`)に渡すための依頼書。

## 1. 症状(2026-06-03 ユーザー観察)

### 1.1 同一配信を複数タブで開いた時の症状

- ニコ生 watch ページを **複数タブで開いている**(タブ数は未確定・観察待ち)
- すべてのタブのポップアップが **「ローディング中」と「数字表示」の間を点滅** する
- 「**みんなの応援コメント、集めてるよ〜**」「**一度開くと次からの取り込みがはやくなるよ**」が出たり消えたりする
- 最終的には数字が出るが、**取得できる件数が少なめ**になる
  - 例: 同接 1,043 / コメ 591 件あるのに、拡張記録は 79 件(13%)
  - 「**過去ログは今は遡れませんでした(理由: backward_exhausted・残り約 512件)**」と正直表示
- **タブを切り替えるたびに点滅が再発**

### 1.2 副次的な症状(別観察)

- マーケ HTML / コメント記録 HTML のダウンロードが**以前(v0.1.592)より遅い体感**
- ただしこれは **別 PR(本依頼とは独立)**で先に対処予定(v0.1.611 で
  `buildCommenterFollowAnalytics` が同 HTML 内で 2 回呼ばれている重複計算が確証済み)

### 1.3 未確認だが影響範囲

- 拡張 Service Worker のエラーログ・実行頻度
- chrome.storage.local の write 競合の有無
- 各タブ間の取得タスクのキュー化状況

## 2. 既知の関連先行調査

MEMORY に複数の関連 reference が登録済み:

- **`reference_standalone_popup_multitab_empty_dash`**(v0.1.414 複数タブ「—」根治)
  - データのある lv 優先選択 + 空 lv 救済 + ウォッチドッグで根治済とされた
  - 今回はその同系列の再発か別系統かを判定
- **`reference_multitab_scale_ultraC_leader_election`**(未着手の大物)
  - 「ウルトラC = Web Locks + SW 集約」案。リーダー1タブが重仕事 → `storage.onChanged` で全配布
  - **今回の症状はこの未着手問題の射程内である可能性が高い**
- **`reference_b4_sidepanel_lv_mixup_rootcause`**
  - chrome.sidePanel per-tab 要設計の真因特定済(未修正)
- **`reference_storage_local_live_db_perf_overhaul`**(v0.1.420)
  - get(null) 撤去 + 保存全件パス最適化済
- **`reference_2026-06-03_wip_consolidation_and_bugfixes`**
  - v0.1.606 真因対策(runInterceptReconcile から巨大配列 read/write 撤去)

## 3. 容疑(初期仮説・Codex は否定可)

### 容疑 α: 各タブが独立に取得処理を走らせる
- watch ページの content script が all_frames で走り、複数タブで同一 API を叩く
- SW (background.js) で受けるが、tab 別の独立処理になっており dedup されていない
- **観察ポイント**: SW の fetch コールバック数、retry 数

### 容疑 β: storage.onChanged で全タブが同時再描画
- 1 タブの取得完了で `chrome.storage.local.set` → 全タブで `storage.onChanged` 発火
- 全タブで描画が同時に走る → 描画中に次の取得が走って「ローディング」状態に逆戻り

### 容疑 γ: storage write 競合
- 複数タブが同じ key を同時に write し、「ローディング中」フラグが残ったり消えたりを繰り返す
- 特に `nls_live_<lv>` 系のフラグ管理

### 容疑 δ: 直近 v0.1.606-612 で何かが顕在化させた
- v0.1.606: runInterceptReconcile から storage write 撤去(これは負荷減のはず)
- v0.1.607: TTL 24h→6h/12h(取得頻度↑ で複数タブ競合が顕在化?)
- v0.1.608: 強制再取得ボタン(明示操作時のみで通常時は影響なし)
- v0.1.609-612: 純計算追加・HTML UI 追加(取得層には触れていないはず)

### 容疑 ε: 取得層のキャッシュ TTL 短縮の副作用(v0.1.607)
- COMMENTER_FOLLOW_TTL_MS: 24h → 6h
- COMMENTER_FOLLOWING_LIST_TTL_MS: 24h → 12h
- これにより**配信中の再取得頻度が上がり**、複数タブで競合増加した可能性

### 容疑 ζ: backfill の global queue 枯渇
- ユーザー観察「backward_exhausted・残り約 512件」
- v0.1.557 以降の決定論バックフィルが複数タブ時に不公平 cancel される?

## 4. 調査タスク

### 4.1 第一目標
**「複数タブで同時に同一配信を開いた時、ローディング点滅と取得低下が起きるコードパス」**を特定する。

### 4.2 調査手順(提案)

1. **エントリ点の網羅**: `nls_live_<lv>` 系・`nls_event_dom_<lv>`・`nls_koken_*` 等の storage key の
   write 発生箇所を grep で全列挙
2. **各 write の trigger** を遡る(配信中 polling? コメント着信? 定期実行?)
3. **多タブ時の動作**:
   - SW が複数タブから同じ要求を受けた時に dedup しているか
   - `storage.onChanged` listener が popup でどのように扱われているか
   - 「ローディング中」状態の DOM/CSS class はどこで toggle されるか
4. **過去 reference との照合**:
   - `reference_standalone_popup_multitab_empty_dash` で v0.1.414 が根治したのは「全部—」固定問題
   - 今回は「**点滅**」(状態が動く)なので別系統の可能性が高い
5. **v0.1.607 TTL 短縮の影響**:
   - 6h TTL になったことで、配信中の再取得頻度がどう変化したか
   - これが複数タブ競合を顕在化させていないか
6. **backfill global queue**:
   - 多タブで queue がどう共有/分散されているか
   - 「残り 512件」で打ち切られる経路を特定

### 4.3 出力フォーマット(必須)

`docs/codex-multitab-flicker-investigation-v0612.md` に以下章立てで:

```markdown
# Codex 調査レポート: 複数タブでローディング点滅+取得低下(v0.1.612)

## エグゼクティブサマリー
- 真因として最も疑わしい:
- 即修正可能: yes/no
- 修正の影響範囲:

## 観察ポイント(司令塔がユーザーに依頼する観察項目)
- (a) タブ数を変えた時の挙動差
- (b) SW DevTools で確認すべきエラー/頻度
- (c) chrome.storage.local の write 頻度の測り方

## 容疑別の判定
### 容疑 α (タブ独立 fetch)
- 根拠 grep:
- 計算量:
- 既存防御策:
- 残るリスク:

### 容疑 β (storage.onChanged 全タブ再描画)
(同上)

### 容疑 γ (storage write 競合)
(同上)

### 容疑 δ (v0.1.606-612 退行)
(同上)

### 容疑 ε (TTL 短縮副作用)
(同上)

### 容疑 ζ (backfill 枯渇)
(同上)

## 新規発見の真因候補

## 修正案(複数案・実装はしない)
### 案 1: ...
- 影響範囲
- リスク
- v0.1.592 baseline との互換性
- 回帰テスト方針

### 案 2: ...

## 推奨アクション
- 司令塔への推奨:
- ウルトラC(Web Locks + SW 集約)に踏み込むかの判断材料:
```

### 4.4 絶対禁止事項
- **コード修正はしない**(調査のみ)
- 過去対策のコメント(v0.1.414 等)を削除/書き換えしない
- master ブランチに直接コミットしない
- v0.1.592 baseline zip の挙動を壊す案を出さない
- 「症状を隠す改修」(早期 return で見えなくする等)を案として出さない

## 5. 環境情報

- 起点ブランチ: `master` (HEAD は v0.1.612 PR #215)
- baseline: `C:\Users\info\OneDrive\デスクトップ\extension.zip`(v0.1.592、SHA-256: 51d729cb...)
- 主要ソース:
  - `src/extension/content-entry.js`(content script 本体)
  - `src/extension/popup-entry.js`(popup・拡張UI)
  - `extension/background.js`(Service Worker)
  - `src/lib/commentTailBuffer.js` / `commentChunkStore.js`(storage 層)
  - `src/lib/commenterFollowCache.js` / `commenterFollowingListCache.js`(TTL 短縮の影響観察)
  - `src/lib/ndgrBackfillCrawl.js` / `globalBackfillQueue.js`(backfill)
- 関連 reference:
  - `reference_standalone_popup_multitab_empty_dash`
  - `reference_multitab_scale_ultraC_leader_election`
  - `reference_b4_sidepanel_lv_mixup_rootcause`
  - `reference_storage_local_live_db_perf_overhaul`
  - `reference_baseline_v0192_zip`
  - `reference_2026-06-03_wip_consolidation_and_bugfixes`
  - `reference_osint_strategy_socialxup_chikuran`

## 6. 完了条件

1. `docs/codex-multitab-flicker-investigation-v0612.md` を作成
2. 容疑 α〜ζ 全てに判定を付ける
3. 修正案を最低 2 案、トレードオフ付きで提示
4. ウルトラC(Web Locks + SW 集約)を取るかどうかの判断材料を提示
5. 司令塔がユーザーに観察を依頼すべき項目を「観察ポイント」章にリスト化
6. リポジトリにコミットしない・作業ブランチも作らない・ファイルだけ作る

司令塔(次セッションの Claude Code)は受領後、診断結果を読み込み、判断する。
