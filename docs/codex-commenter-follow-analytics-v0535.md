# Codex 依頼: コメンターフォロー分析レイヤ（v0.1.535）

## 起動方法（Codex フル活用モード）

1. このリポジトリを作業ディレクトリにする  
   `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`
2. Codex（OpenCode 等）を **フル活用モード** で起動し、最初のプロンプトに **`.codex-task-prompt.txt` の全文** を貼る  
   または本ファイルの「実装タスク」節を貼る
3. モデル分担の目安（HANDOFF-to-codex-opencode.md 準拠）  
   - **実装・テスト・HTML**: NVIDIA DeepSeek V4 Flash / Codex 本家  
   - **閾値・セグメント文言の推敲**: 軽量モデルで下書き → 実装モデルで反映
4. 完了条件: `npm run typecheck` / `npx vitest run src/lib/commenterFollowAnalytics.test.js` / `npm run build` が通ること
5. **commit まで**（push はしない）。ブランチ名例: `codex/commenter-follow-analytics-v0535`

## 担当領域（触ってよい）

| 触る | 触らない |
|------|----------|
| `src/lib/commenterFollowAnalytics.js`（新規） | `src/extension/content-entry.js`（取得は済） |
| `src/lib/commenterFollowAnalytics.test.js`（新規） | `extension/background.js` |
| `src/lib/marketingChartsHtml.js`（分析UI追加） | Claude 領域（popup-entry 本体・NDGR・IDB 等） |
| `src/lib/marketingReportEmbed.js`（共有マスク拡張が要れば） | |
| `package.json` / `extension/manifest.json` / `src/lib/changelog.js` | |

詳細な領域ロック: [docs/codex-marketing-analytics-brief.md](codex-marketing-analytics-brief.md)

---

## 前提（v0.1.534 で完了済み・再実装禁止）

- **取得**: `content-entry.js` → `maybeFetchCommenterFollowBatchOnce()` が数値 ID コメンター全員を 8秒×8名 で nvapi 取得
- **保存**:  
  - 横断 `KEY_COMMENTER_FOLLOW_CACHE`  
  - 配信別 `commenterFollowLiveStorageKey(liveId)` → `nls_commenter_follow_live_<lv>`
- **集計**: `marketingAggregate.js` → `allNumericCommenters[]`（数値 ID 全員・コメ数順）
- **popup**: `attachCommenterFollowToReport()` → `commenterFollowDataset` + follow フィールドマージ
- **表示**: `sectionCommenterFollowDirectory()` … 全員表（初期40行＋「残りを表示」は **v0.1.535 Claude 側でスクロール対策済み**）

### 埋め込み JSON（表計算用）

マーケ HTML 末尾 `id="nl-marketing-export-v1"` の `application/json`:

```json
{
  "schemaVersion": 1,
  "report": {
    "allNumericCommenters": [ { "userId", "count", "followerCount?", "followeeCount?", "userLevel?", "isPremium?" } ],
    "commenterFollowDataset": { "rows": [...], "withFollowData", "totalNumericCommenters" }
  }
}
```

---

## 実装タスク（Codex がやること）

### 1. 純関数 `src/lib/commenterFollowAnalytics.js`

- `computeCommenterFollowThresholds(rows)` … 中央値/パーセンタイルから閾値（followerCount, commentCount）
- `buildCommenterFollowScatterPoints(rows)` … `{ x: followerCount, y: commentCount, userId, label }[]`（follow 未取得は除外）
- `buildCommenterFollowSegments(rows, thresholds)` … 次の3分類 + 人数 + 代表例（最大3名）  
  - **高フォロワー常連**: follower ≥ 閾値 かつ comment ≥ 閾値  
  - **ローカル熱心層**: follower 低 かつ comment 高  
  - **静かな支援**: follower 高 かつ comment 低  
- `buildCommenterFollowCsv(rows)` … UTF-8 BOM 付き CSV 文字列（Excel 向け）

単体テスト必須: `src/lib/commenterFollowAnalytics.test.js`

### 2. `marketingChartsHtml.js` に分析 UI

`sectionCommenterFollowDirectory` の**直後**（または同一セクション内）に追加:

1. **散布図**（SVG、既存 `sectionTimeline` の SVG パターンに合わせる。ダークテーマ `#0f172a` / `#93c5fd`）
2. **セグメントカード**（3枚、日本語、人数・短い説明・代表名）
3. **CSV ダウンロードボタン** … `nl-marketing-export-v1` から `allNumericCommenters` + follow を読んで Blob DL（サーバー不要）

- TOC に `mkt-commenter-follow-analytics` を追加
- レスポンシブ（既存 `@media(max-width:640px)` に合わせる）
- `maskShare` 時は散布図・CSV・セグメント名を伏せ字 or 非表示

### 3. バージョン

- `0.1.535` → 分析追加なら **`0.1.536`** に bump（スクロール対策が 0.1.535 の場合）
- `src/lib/changelog.js` 先頭エントリ（利用者向け日本語、HTML タグ風文字列禁止）

---

## スクロール軽量化（Claude 側 v0.1.535 で対応済み・Codex は維持）

- `scroll-behavior: smooth` 削除
- `.mkt-section` に `content-visibility: auto`
- コメンター一覧は **初期40行** + 「残り N 名を表示」ボタン  
→ Codex はこの挙動を壊さないこと。CSV/JSON には**全員**載せること。

---

## 手動確認

1. 拡張再読み込み → 配信を開いて数分 → マーケ分析 DL
2. 「数値IDコメンター一覧」下に散布図・セグメント・CSV ボタンがある
3. 長い配信でページスクロールが以前より軽い（40行折りたたみ）
4. CSV を Excel で開いて文字化けしない（BOM）

---

## 短い起動プロンプト

`.codex-task-prompt.txt` を Codex にそのまま貼ってください。
