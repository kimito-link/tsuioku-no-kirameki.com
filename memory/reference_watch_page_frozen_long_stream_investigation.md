# reference: watch ページが「ページが応答しません」になる現象の調査依頼（v0.1.605 時点）

> ⚠️ これは Codex への調査依頼の正本です。Codex は AGENTS.md + 本ドキュメントを読んで自走し、調査レポートを `docs/codex-watch-frozen-investigation-v0606.md` に出力してください。**修正コードは書かないでください**（調査のみ）。
>
> Claude Code（司令塔）が実機ユーザーから受けた症状報告を、Codex の専門領域（marketing/HTML レポート/放送系 = `memory/codex_collaboration_rules.md`）に渡すための依頼書です。

## 1. 症状

### 1.1 ユーザー報告（2026-06-03）
ニコ生 watch ページに、Chrome の **「ページが応答しません」** ダイアログが出る。

- 配信時間: **6 時間 41 分 57 秒**（長時間配信）
- コメント数: **約 12,000 件**（11,977 件まで観測）
- ライブ ID: 不明（スクショからは推定不可）
- アクティブな配信（流速それなり）
- 発生頻度: **「毎回ではない」**（特定条件で発火）
- フリーズ箇所: **watch ページ本体**（拡張ポップアップではない）

### 1.2 ダイアログの意味
Chrome は通常 **5 秒以上メインスレッドがブロックされる** とこのダイアログを出す。つまり「ローディングが長い」ではなく **「メインスレッドを長時間占有する重い処理が走っている」** 状態。

### 1.3 関連する過去対策（壊さないこと）
- **v0.1.598**: コメント欄スクロール中は deep harvest 仮想走査を開始・継続しない
- **v0.1.420**: storage.local の get(null) 撤去 + 保存全件パス最適化（O(N) 改善）
- **v0.1.337**: 全部「—」stall 根治（storage.local.get タイムアウト無し await → withTimeout 化）
- **v0.1.398**: snapshot fetch hang 根治（chrome API 永久 pending → withTimeout 15s）
- **v0.1.601〜605**: ポップアップ側体感改善（白抜け / こん太クリック / 送信遅延 / 待機文言）

これらの修正は **本症状の根治には至っていない**（または別経路の問題）と考えられる。

## 2. 既に絞り込んだ容疑

Claude Code 側のコード精査で、メインスレッドブロックを引き起こし得る箇所を以下に絞った。**Codex はこれらを起点に深掘りし、または新規の真因を発見してよい。**

### 2.1 容疑 α: deep harvest 仮想走査（content-entry.js）
- `runVirtualScrollSweep`（src/lib/commentHarvest.js 周辺）
- v0.1.598 で「スクロール中は走らない」対策済みだが、**長時間配信 + 大量コメントで何かしら漏れている可能性**
- 関連: `deepHarvestPipelineStats`、`maybeOfficialGapQuietDeepHarvest`、`cancelPendingDeepHarvest`
- 確認ポイント: スクロール検出が極稀にミスして長時間走り続けないか、abort が確実に効くか

### 2.2 容疑 β: DOM 全件スキャン（コメント欄 virtualization 解放）
- `findCommentListScrollHost` + `scrollHeight` の取得
- ニコ生のコメント欄は React 仮想化されているので、`scrollHeight` を毎回計算するだけでも重い
- スクロール量 × N pass の走査が一定以上の時間を超えていないか

### 2.3 容疑 γ: NDGR backfill の同期処理
- `backfillRinkuNarration`、`globalBackfillQueue`、`backfillFlushThreshold`
- 12000 件超のコメントをまとめて storage に flush する瞬間にメインスレッドが固まらないか
- 過去ログ取り込みパスの batch サイズが大きすぎないか

### 2.4 容疑 δ: refresh 系の積み重ね（popup 側だが content にも relay があり得る）
- `refreshAllNorthStarMirrorLanes`（順次 await・11 段）
- `refreshOfficialEventDomBundle` + その下で動く DOM scrape
- watch タブ側に postMessage で重い処理を相乗りさせていないか

### 2.5 容疑 ε: storage.local の get/set サイズ膨張
- ライブ正本 `nls_live_<lv>` に 12000 件のコメント配列が乗ると、毎回 read → merge → write で **数 MB の JSON シリアライズ/デシリアライズ**
- v0.1.420 で改善したはずだが、長時間配信では依然として O(N) パスが残っていないか
- 確認ポイント: 1 コメント保存ごとに全件 write していないか（intercept hot path 含む）

### 2.6 容疑 ζ: NDGR / WS 受信ホットパスのバッチ化漏れ
- WS で来たコメントを即 storage に書く設計だと、流速が秒間 10-20 で長時間続くと累積負荷大
- 「数件まとめて 200ms 後に flush」みたいなバッチ化が崩れていないか

## 3. 調査タスク（Codex への具体的指示）

### 3.1 第一目標
**「12000 コメント + 6.7 時間配信」で、watch ページのメインスレッドを 5 秒以上ブロックし得るコードパスを特定する。**

### 3.2 調査手順（提案）
1. `extension/dist/content.js`（または source: `src/extension/content-entry.js` + `src/lib/*.js`）を全件 grep して **同期的に巨大配列を回す箇所** を列挙
2. 各箇所について「**12000 件投入時の計算量**」を見積もる（O(N) / O(N^2) / O(N log N)）
3. **イベントループに yield していない箇所**（`yieldToBrowserPaint` や `await new Promise(r => setTimeout(r, 0))` 等を挟んでいない長尺ループ）を特定
4. **storage.local.set のサイズ** が累積で MB 級になり得るキーを洗い出す
5. **WS 受信〜storage write の hot path** をトレースし、バッチ化されているか確認
6. 容疑 α〜ζ について個別に「該当する/しない/条件付きで該当」を判定

### 3.3 出力フォーマット（必須）
**`docs/codex-watch-frozen-investigation-v0606.md`** に以下の章立てで:

```markdown
# Codex 調査レポート: watch ページ「応答しません」現象（v0.1.605 時点）

## エグゼクティブサマリー
- 真因として最も疑わしい: <候補1> / <候補2>
- 即修正可能: yes/no
- 修正の影響範囲: 〜

## 容疑別の判定
### 容疑 α (deep harvest): 該当 / 不該当 / 条件付き
- 根拠 grep: src/extension/content-entry.js:LINE
- 計算量: O(N), N=12000 で約 〜ms
- 既存の防御策: v0.1.598 のスクロール中抑止が効くか
- 残るリスク: ...

### 容疑 β (DOM 全件スキャン)
（同上）

### 容疑 γ (NDGR backfill)
（同上）

### 容疑 δ (refresh 積み重ね)
（同上）

### 容疑 ε (storage 膨張)
（同上）

### 容疑 ζ (WS hot path)
（同上）

## 新規発見の真因候補
- 私たちが見落としていた箇所があれば列挙

## 修正案（複数案・実装はしない）
### 案 1: ...
- 影響範囲: ...
- リスク: ...
- v0.1.592 baseline との互換性: ...
- 回帰テスト方針: ...

### 案 2: ...
...

## 推奨アクション
- 司令塔（Claude Code）への推奨: ...
```

### 3.4 絶対禁止事項
- **コード修正をしないこと**（調査のみ）
- 過去対策のコメント（`v0.1.598:`、`v0.1.420:` 等）を **削除/書き換えしないこと**
- `master` ブランチに直接コミットしないこと
- v0.1.592 baseline zip の挙動を壊す改修は提案しないこと
- 「症状を隠す改修」（早期 return で見えなくする等）を案として出さないこと → 根本対策のみ

## 4. 環境情報

- ブランチ: 調査の起点は `fix/comment-submit-latency`（v0.1.605）
- baseline: `C:\Users\info\OneDrive\デスクトップ\extension.zip`（v0.1.592、SHA-256: 51d729cb...）
- 主要ソース:
  - `src/extension/content-entry.js`（content script 本体）
  - `src/extension/popup-entry.js`（popup・拡張UI）
  - `src/lib/commentHarvest.js`
  - `src/lib/backfillRinkuNarration.js`
  - `src/lib/globalBackfillQueue.js`
  - `src/lib/storageKeys.js`
- 関連 reference:
  - `reference_storage_local_live_db_perf_overhaul.md`
  - `reference_all_dash_freeze_storage_stall.md`
  - `reference_ndgr_backward_packedsegment_protocol.md`
  - `reference_baseline_v0192_zip.md`

## 5. 完了条件

Codex が以下をすべて満たしたら司令塔（Claude Code）に戻す:
1. `docs/codex-watch-frozen-investigation-v0606.md` を作成（上記フォーマット通り）
2. 容疑 α〜ζ 全てに判定を付ける
3. 修正案を最低 2 案、トレードオフ付きで提示
4. リポジトリにコミットしない（作業ブランチも作らない・ファイルだけ作る）

Claude Code は受領後、診断結果を読み込み、別ブランチで修正実装に進む。
