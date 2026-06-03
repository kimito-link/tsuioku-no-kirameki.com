# Codex / Cursor 依頼: 興味タグ来場のマーケ分析 v0.1.563

最終更新: 2026-06-02  
作業ディレクトリ: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`

## 起動方法

1. 本リポジトリを作業ディレクトリにする
2. Codex フル活用モード / 新 Cursor セッションで **`.codex-task-prompt.txt` の全文** を最初のプロンプトに貼る  
   または本ファイルの「実装タスク」節を貼る
3. 完了条件: `npm run typecheck` / 関連 vitest / `npm run build` が通ること
4. **git commit / push はユーザー明示依頼までしない**（本リポジトリの運用ルール）

---

## 背景（ユーザー要望）

ニコ生の公式システムコメント **「○○が好きなN人が来場しました」**（`generalSystemMessage`）を、マーケデータ分析で**専用指標として集計・表示**したい。

- 視聴者プロフィールの**好きなタグ**（例: 料理、雑談）に基づく**公式集計通知**
- **個人名は出ない**（「1人」「3人」など人数のみ）
- 形式例: `「料理」が好きな1人が来場しました`

### 現状

| 経路 | 状態 |
|------|------|
| コメント記録 | コメント番号付きなら本文テキストとして保存される |
| マーケ集計 | `aggregateMarketingReport` は**パース・専用集計なし** → 普通の1コメントとして件数に混ざる |
| ギフト/広告 | `parseGiftComment.js` で専用パース済み（**同パターンで実装**） |
| 客層推定 Gemini | `audienceInterestGeminiPrompt.js` あり（**本文推定**。今回タスクとは別。統合は任意・後回し可） |
| フォロー分析 | `commenterFollowAnalytics.js` 済（v0.1.535〜541。**コメンター follow**。興味タグ来場とは別軸） |

---

## 同セッションで完了済み（触らない・退行させない）

以下は **v0.1.561 / v0.1.562** で別タスクとして完了。本タスクのスコープ外。

| 版 | 内容 | 主要ファイル |
|----|------|-------------|
| 0.1.561 | watch 埋め込み iframe で 100pt 広告節目が豪雨にならない問題 | `supportCelebrationMotionEnabled()` が `nl-calm-motion` を見ない |
| 0.1.562 | 演出を watch ウィンドウ全体に（iframe → content script → トップフレーム） | `watchCelebrationOverlay.js`, `celebrationCharaAssets.js`, `popup-entry.js`, `content-entry.js` |

検証（演出系退行確認用）:

```bash
npx vitest run src/lib/selfActionCelebration.test.js src/lib/supportCelebration.test.js
```

---

## ニコ側の仕組み（調査済み）

- DOM: `data-comment-type="generalSystemMessage"`
- 番号なし行は `parseNicoLiveTableRow` が `null`（記録しない）
- 番号付き行は `{ commentNo, text, userId: null }` として記録される

テスト実例（`src/lib/nicoliveDom.test.js` L282-293）:

```javascript
// text: 「料理」が好きな1人が来場しました
// commentNo: '535', userId: null
```

表記ゆれ候補（テストで追加検討）:

- `「料理」が好きな1人が来場しました`（正本）
- `「雑談」が好きな1人が来場しました`（同上・別タグ）
- 複数人: `「ゲーム」が好きな3人が来場しました`
- ユーザー言及の「料理好きが来場」系 — **実ログがあれば正規表現に追加**

---

## 実装タスク

### Phase 1: パーサ（純関数）

**新規** `src/lib/parseInterestArrivalComment.js`（名前は既存命名に合わせて可）

```javascript
/**
 * @typedef {{ tag: string, count: number }} ParsedInterestArrivalComment
 */

/**
 * @param {string} text
 * @returns {ParsedInterestArrivalComment | null}
 */
export function parseInterestArrivalComment(text) {
  // 想定: /「(.+?)」が好きな(\d+)人が来場しました/
}
```

- `parseGiftComment.js` / `parseNicoadCommentText` と同パターン（trim → match → null）
- **新規** `src/lib/parseInterestArrivalComment.test.js` — 実例 + 表記ゆれ + null ケース

### Phase 2: マーケ集計

**変更** `src/lib/marketingAggregate.js`

1. 記録コメントを走査し `parseInterestArrivalComment` でヒットを集計
2. `MarketingReport` typedef に追加:

```typescript
interestArrivalSummary: {
  totalArrivals: number,   // count の合計（来場人数の合算）
  uniqueTags: number,
  messageCount: number,    // 該当システムコメ行数
  topTags: { tag: string, arrivals: number, messageCount: number }[]
}
```

3. **除外方針（重要）**: 興味タグ来場行は `topUsers` / CPM / uniqueUsers / timeline 等の**通常コメ集計から除外**  
   - ギフトシステム文除外と同思想（`cleanNdgrChatRows.js` が `parseGiftCommentText` で skip しているパターン）
   - `userId` が null の anon キーで 1 ユーザー扱いされ KPI が歪むのを防ぐ
4. `totalComments` の扱い: **専用フィールドで見せ、通常 KPI からは除外**（ギフト文と同様のノイズ扱い）

参考: `aggregateMarketingReport` の filtered ループ（L162〜）の前またはループ内で skip。

### Phase 3: マーケ HTML

**変更** `src/lib/marketingChartsHtml.js`

- 新セクション例: **「興味タグ別来場（公式システムコメ）」**
- 内容:
  - 合計来場人数（`totalArrivals`）
  - タグ別ランキング表（`topTags`）
  - 注記: 「ニコ公式の集計通知。個人は特定不可」
- 既存セクション（`sectionCommenterFollowDirectory` 付近）の HTML/CSS パターンに合わせる
- レスポンシブ（`@media (max-width: 640px)` 既存に追随）
- TOC にアンカー追加（例: `mkt-interest-arrival`）
- **新規/更新** `src/lib/marketingChartsHtml.test.js` — セクション見出し・数値の HTML 含有アサーション

`buildMarketingChartsHtml`（または相当の export）で `report.interestArrivalSummary` を渡す配線を確認。

### Phase 4: バージョン

- `package.json` / `extension/manifest.json` → **0.1.563**
- `src/lib/changelog.js` 先頭エントリ（日本語、items に angle-bracket タグ禁止）

### Phase 5（任意・後回し可）

- storage マイグレーション不要（マーケ出力時に stored comments から再集計で足りる）
- `audienceInterestGeminiPrompt.js` との統合（Gemini 推定タグ vs 公式来場タグの対比 UI）
- 興味タグ来場時の**演出**（ユーザー未明示・別タスク）

---

## 触ってよい / 触らない

| 触る | 触らない（除非必要） |
|------|---------------------|
| `src/lib/parseInterestArrivalComment.js`（新規） | `src/extension/content-entry.js` |
| `src/lib/parseInterestArrivalComment.test.js`（新規） | `extension/background.js` |
| `src/lib/marketingAggregate.js` | `src/lib/watchCelebrationOverlay.js`（演出 v0.1.562） |
| `src/lib/marketingAggregate.test.js`（あれば更新） | `src/extension/popup-entry.js`（aggregate 呼び出しは既存のまま動く想定） |
| `src/lib/marketingChartsHtml.js` | |
| `src/lib/marketingChartsHtml.test.js` | |
| `package.json` / `manifest` / `changelog.js` | |
| `extension/dist/*`（build 生成のみ） | |

領域ロック詳細: [docs/codex-marketing-analytics-brief.md](codex-marketing-analytics-brief.md)

---

## 検証コマンド

```bash
npm run typecheck
npx vitest run src/lib/parseInterestArrivalComment.test.js src/lib/marketingAggregate.test.js src/lib/marketingChartsHtml.test.js
npm run build
```

手動確認:

1. 興味タグ来場が出る配信（またはテスト用 stored comments）でマーケ HTML 出力
2. 「興味タグ別来場」セクションにタグ・人数が表示される
3. topUsers / CPM がシステムコメ 1 件分だけ増えない（除外が効いている）

---

## 受け入れ条件

1. `「料理」が好きな1人が来場しました` → `{ tag: '料理', count: 1 }`
2. `「ゲーム」が好きな3人が来場しました` → `{ tag: 'ゲーム', count: 3 }`
3. 通常コメント / ギフト文 → `null`
4. マーケ HTML に専用セクションあり
5. 興味タグ行が uniqueUsers / topUsers を汚さない
6. typecheck / vitest / build 通過

---

## 主要ファイル早見

| ファイル | 役割 |
|---------|------|
| `src/lib/marketingAggregate.js` | マーケレポート集計の正本 |
| `src/lib/marketingChartsHtml.js` | マーケ分析 HTML 生成 |
| `src/lib/nicoliveDom.js` | コメント行 DOM パース |
| `src/lib/parseGiftComment.js` | ギフト/広告パースの参考実装 |
| `src/lib/cleanNdgrChatRows.js` | システム文 skip の参考 |
| `src/lib/commenterFollowAnalytics.js` | マーケ HTML セクション追加の参考（v0.1.535） |
| `src/lib/audienceInterestGeminiPrompt.js` | 任意統合先（今回は未接続） |

---

## コピペ用ミニプロンプト

```
【タスク】ニコ生「○○が好きなN人が来場しました」系システムコメをマーケ分析で集計する v0.1.563

【背景】
- generalSystemMessage がコメントログに「「料理」が好きな1人が来場しました」として残る
- 現状マーケ分析では専用指標なし（普通の1コメントとして件数に混ざる）
- ギフト/広告は parseGiftComment.js でパース済み → 同パターン

【やること】
1. src/lib/parseInterestArrivalComment.js + test（tag, count 抽出）
2. marketingAggregate.js で interestArrivalSummary 追加、興味タグ行は topUsers/CPM から除外
3. marketingChartsHtml.js に「興味タグ別来場」セクション + test
4. changelog 0.1.563, manifest/package.json bump, typecheck/vitest/build

【参考】
- docs/codex-interest-arrival-analytics-v0563.md（本 Brief）
- nicoliveDom.test.js L282-293（実例）
- cleanNdgrChatRows.js（ギフトシステム文 skip）
- commenterFollowAnalytics（マーケ HTML セクション追加パターン）

【やらない】
- git commit/push（ユーザー依頼まで）
- v0.1.561/562 演出系の変更
- audienceInterestGemini との統合（任意・後回し）
```
