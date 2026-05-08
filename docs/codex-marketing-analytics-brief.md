# codex 向けマーケ分析 HTML 担当 技術 Brief

このドキュメントは、君斗りんく Chrome 拡張「追憶のきらめき」（GitHub: kimito-link/tsuioku-no-kirameki.com、以下「本拡張」）の **マーケ分析 HTML レポート機能** を担当する codex 向けの技術仕様書です。

並列開発の相方である Claude（拡張本体担当）と領域が衝突しないよう、本書を読んでから作業に入ってください。

---

## 1. プロジェクト概要

本拡張は niconico 生放送（live.nicovideo.jp）の視聴者向け Chrome 拡張で、配信中のコメント・ギフト・ランキング・配信統計をローカル収集し、配信後にマーケティングレポートを HTML で生成します。

### 1.1 役割分担

| 担当 | 領域 |
|---|---|
| **Claude** | 拡張本体（content/popup/page-intercept、NDGR/gift/ranking 系 lib、release 周り） |
| **codex（あなた）** | マーケ分析 HTML レポート（marketing\*/broadcast\*/yukkuri\*/manga\* 系 + 新設の gift timeline / gemini summary / narrative builder） |

詳細な領域ロックは §2 を参照。

### 1.2 リポジトリの状態（2026-05-07 現在）

- 最新 release: v0.1.203
- メインブランチ: `feature/live-item-throw-by-user`（kimito さんがここで PR を merge して master に ff-merge）
- 拡張本体は v0.1.204 に向けて Claude が `claude/v0204-*` で作業中（NDGR gift event の真因解明 + UI 統合）

codex の作業はこれらと **完全に独立** に進められる設計（領域ロックで物理的に分離）。

---

## 2. 領域ロック（厳守）

### 2.1 codex が触る領域

```
src/lib/marketing*.js / .test.js
src/lib/broadcast*.js / .test.js
  ※ broadcastSessionSummaryDb.js は IDB の「データ構造」のみ参照。schema 変更は要事前合意
src/lib/yukkuriBroadcastSummary.js / .test.js
src/lib/mangaBroadcastSummary.js / .test.js

新設可:
  src/lib/geminiBroadcastSummary.js / .test.js
  src/lib/giftTimelineHtml.js / .test.js
  src/lib/broadcastNarrativeBuilder.js / .test.js
  （他に必要な lib があれば marketing*/broadcast* prefix で命名）

docs/marketing-*.md / docs/codex-*.md
tests/e2e/marketing*.spec.js
```

### 2.2 codex が **絶対に触らない** Claude 領域

```
src/extension/content-entry.js
src/extension/popup-entry.js
src/extension/page-intercept-entry.js
src/extension/background.js

src/lib/{
  ndgr*,
  gift*,                  ← gift で始まるが broadcast でないもの
                           （giftRecord / giftDiagnosticsForAiShare / giftDisplayNickname /
                            giftRankStripConfig / PopupSync / Prep / StableKey 等）
  official*,
  scrape*,
  summarizeGiftSubAppHistoryDiag,
  summarizeDevMonitorGiftRanking,
  diagWarnings, diagnostic*,
  networkErrorProbe, probe*,
  parseEmbeddedDataViewerInfo,
  deriveAvatarUrlFromUid,
  pruneStaleEventDomLvs,
  watchPageViewerProfile,
  inlinePanel*,
  topSupportRankStrip*,
  storyUserLane*,
  mcpBridge/*,
}

extension/manifest.json
extension/dist/
package.json の "version" フィールド
src/lib/changelog.js / changelog.test.js
```

### 2.3 共有領域（変更時は事前合意）

- `package.json` の dependencies
- `eslint.config.js` / `tsconfig.json` / `vitest.config.js`
- `scripts/build.mjs`
- `scripts/verify-bump.mjs`
- `tests/e2e/` 配下の共通 fixture

これらに変更が必要な場合、kimito さん経由で Claude に確認してから実施してください。

### 2.4 v0.1.193 衝突の教訓

過去に codex の uncommit working changes が Claude の push と整合せず混乱した事例があります。今後は本ルールで物理分離。**自分の領域内で commit→push を細かく回す** のがおすすめ。

---

## 3. 4 機能の詳細仕様

ユーザー（kimito さん）からの要望（2026-05-07）:

1. **Gemini Nano（Built-in AI）連携** — オンデバイス AI 分析
2. **配信間比較** — 自配信 + 他配信者の配信、kimito さんがローカル保存している範囲内
3. **ギフトアイテムタイミング表示** — gift timeline、SVG inline
4. **配信内容の描写** — テキスト集計 + AI 自動サマリ

### 3.1 Gemini Nano（Built-in AI）連携

#### 目的
オンデバイスで動く Built-in AI（Chrome 138+、Gemini Nano）で、配信レポートに自動サマリ・アドバイス・ナラティブを付与する。**外部クラウド API（Anthropic / Google / OpenAI）は不可**。

#### Built-in AI の API

```js
// Chrome 138+ の標準 API（origin trial 不要、全 chrome:// に exposed）
const availability = await LanguageModel.availability();
if (availability !== 'available') return null;
const session = await LanguageModel.create({
  initialPrompts: [{ role: 'system', content: '配信サマリの専門家' }],
});
const text = await session.prompt(userPrompt);
session.destroy();
```

availability の戻り値:
- `'available'` — そのまま使える
- `'downloadable'` / `'downloading'` — モデル DL 中
- `'unavailable'` — Chrome バージョン or デバイス未対応

#### 実装ファイル
- 新設: `src/lib/geminiBroadcastSummary.js`
- 純関数として `buildGeminiPrompt(report)` を export
- 実際の `LanguageModel.create()` 呼び出しは popup 起動時のラッパー側で（codex はプロンプト構築まで責務分離）

```js
export function buildGeminiPrompt(report) {
  return {
    system: '配信レポートの分析専門家として、簡潔に要点を 3-5 行で。',
    user: `配信ID: ${report.liveId}\nコメント数: ${report.commentCount}\nピーク: ${report.peakConcurrent}\n...`,
  };
}
```

#### Fallback 設計
Built-in AI が不在 / disabled の環境では、既存の `marketingDynamicAdvice.js`（`pickAdvicesFor`）と同等のルールベースサマリで埋める。AI が未利用でも HTML が崩れないこと。

#### 出力先
配信レポートの「AI サマリ」セクション。`buildMarketingDashboardHtml(report, opts)` の opts に `geminiSummary?: string` を渡せるよう拡張。

### 3.2 配信間比較

#### 目的
kimito さんが視聴・記録した複数配信を横断比較。**自配信だけでなく他配信者の配信も対象**（ローカル `nls_comments_<liveId>` / `nls_broadcast_summary_v1` IDB に記録があるもの）。

#### よくある誤解（重要）

| ❌ 誤解 | ✅ 正しい理解 |
|---|---|
| 比較は kimito さん本人の配信のみ | kimito さんが視聴して記録した全配信が対象。自配信 + 他配信者の配信 |
| 視聴者 uid をそのまま表示 | 必ず SHA-256 でハッシュ化（§5.2 参照） |
| 視聴していない配信を新規取得 | NG。既に記録済データの範囲のみ |

#### データソース
- `nls_broadcast_summary_v1` IDB（過去配信サマリ）
  - `openBroadcastSessionSummaryDb()` → `listBroadcastSessionSummaryForLive(db, liveId, limit)`
- `nls_comments_<liveId>` chrome.storage.local（個別コメント、必要に応じて）

#### 実装ファイル
- 既存: `src/lib/broadcastCrossCompare.js` を拡張
- `buildRecentBroadcastComparison(input)` の input を「複数 liveId 横断 + 配信者横断」に対応
- 既存の `buildWeekdayHourHeatmap()`, `computeBroadcastGrowthScore()` は引き続き利用可

#### 視聴者 uid のハッシュ化
他配信者の配信に登場する視聴者 uid は **必ず** SHA-256 で。配信者本人の userId（`broadcasterUserId.js`）はハッシュ化不要（公開情報）。

```js
async function hashUserId(uid) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(uid)));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16); // 短縮 16 文字で衝突確率は十分低い
}
```

### 3.3 gift timeline

#### 目的
配信中にどのタイミングでどのギフトが投げられたかを SVG 散布図で表示。累積ポイント線も重ねて時系列の盛り上がりを可視化。

#### データソース
- `nls_gift_users_<liveId>` chrome.storage.local — `StoredGiftUser[] { userId, nickname, capturedAt, throwCount }`
- `nls_gift_subapp_history_<liveId>` — 詳細 event data（タイムスタンプ付き、Claude 側 v0.1.204 で拡張中）
- `capturedAt` フィールドが時刻情報を提供

⚠️ **`nls_gift_subapp_history_<liveId>` の中身フォーマット**は Claude 側 v0.1.204 で確定する予定。codex は **当面 `nls_gift_users_<liveId>` のみ依存**で実装し、subapp_history は将来オプションフィールドとして対応する設計に。

#### 実装ファイル
- 新設: `src/lib/giftTimelineHtml.js`
- export: `buildGiftTimelineHtml(input)` — input は `{ liveId, gifts: StoredGiftUser[], durationMs }`
- 出力: SVG inline HTML 文字列

#### SVG 仕様
- 散布図: x = 経過時刻（分単位）、y = ポイント数 or アイテム種別
- 累積線: 同じ時間軸で総ポイントの累積を `<polyline>` 描画
- ホバーで個別ギフト詳細を `<title>` ツールチップ
- aria-label / role 必須（§6 a11y 規約）

#### TDD 例
```js
// giftTimelineHtml.test.js
import { describe, it, expect } from 'vitest';
import { buildGiftTimelineHtml } from './giftTimelineHtml.js';

const BASE = 1000000000000;
const g = (offsetMs, userId, throwCount) => ({
  userId, nickname: `user${userId}`, capturedAt: BASE + offsetMs, throwCount,
});

describe('buildGiftTimelineHtml', () => {
  it('emits SVG with cumulative polyline', () => {
    const html = buildGiftTimelineHtml({
      liveId: 'lv1', durationMs: 60_000,
      gifts: [g(10_000, 'u1', 1), g(30_000, 'u2', 2), g(50_000, 'u3', 1)],
    });
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox');
    expect(html).toContain('aria-label');
    expect(html).toContain('<polyline');
  });

  it('handles empty gifts gracefully', () => {
    const html = buildGiftTimelineHtml({ liveId: 'lv1', durationMs: 60_000, gifts: [] });
    expect(html).toContain('<svg');
    expect(html).toMatch(/(no\s|空|なし)/i);
  });
});
```

### 3.4 配信内容の描写

#### 目的
配信中の状況をテキストで要約。コメント密度・ピーク時間・トピック推移などを集計し、Built-in AI に投げてナラティブ化。

#### よくある誤解（重要）

| ❌ 誤解 | ✅ 正しい理解 |
|---|---|
| 描写機能は録画機能だから作らない | テキスト集計 + AI サマリは **必須**。録画機能（メディア保存）のみ NG |
| 録画 NG なので画像表示も全部 NG | avatar URL（公開画像）の `<img>` 表示は OK |
| AI は外部クラウド API を使う | NG。**Built-in AI（オンデバイス）のみ** |

#### データソース
- `nls_comments_<liveId>` — `StoredComment[]` のテキスト
- 既存関数: `summarizeBroadcastTiming(comments)` で時系列軸
- 既存関数: `summarizeCommentBodyStats(comments)` で本文統計
- 既存関数: `summarizeIdentifierStats(comments)` で識別子統計

#### 実装ファイル
- 既存: `src/lib/broadcastReportSummary.js` を拡張、または新設 `broadcastNarrativeBuilder.js`
- 純関数として「集計 → narrative プロンプト構築」まで

#### Gemini Nano 連携
narrative プロンプトを `geminiBroadcastSummary.js` に渡して AI サマリ生成。プロンプト構築と AI 呼び出しは責務分離。

#### 規約
- テキスト集計 ✅
- AI サマリ（Built-in AI） ✅
- AI サマリ（外部クラウド API） ❌
- メディア（動画 / 音声 / 画面）保存 ❌

---

## 4. 既存資産マップ

### 4.1 codex 担当ファイル一覧

| ファイル | 一行サマリ | メイン export | I/O |
|---|---|---|---|
| `marketingAggregate.js` | StoredComment[] → MarketingReport 集計 | `aggregateMarketingReport(comments, liveId, opts)` | 入: StoredComment[]、出: MarketingReport |
| `marketingChartsHtml.js` | MarketingReport → ダッシュボード HTML / SVG | `buildMarketingDashboardHtml(r, opts)` | 入: MarketingReport、出: HTML 文字列 |
| `marketingDynamicAdvice.js` | KPI 値セット → アドバイステキスト | `pickAdvicesFor(section, metrics)` | 入: AdviceMetrics、出: string[] |
| `marketingHtmlAdvisorAvatars.js` | キャラ 3 体のアバター DATA URI 定数 | `MKT_ADVISOR_AVATAR_DATA_URI` | const object |
| `marketingReportEmbed.js` | MarketingReport → script タグ内 JSON 化 | `buildMarketingEmbedScriptInnerText(report, opts)` | 入: MarketingReport、出: JS source |
| `broadcastCrossCompare.js` | 複数配信データ → 比較チャート用数値 | `buildRecentBroadcastComparison()`, `buildWeekdayHourHeatmap()` 等 | 入: CrossCompareBroadcast[]、出: { bars }, { matrix } |
| `broadcastReportSummary.js` | StoredComment[] → 配信タイミング・コメント統計 | `summarizeBroadcastTiming()`, `summarizeCommentBodyStats()` | 入: StoredComment[]、出: { firstCapturedAt, durationMin } 等 |
| `broadcastSessionSummaryDb.js` | IDB 操作の API | `openBroadcastSessionSummaryDb()`, `appendBroadcastSessionSummarySample()` 等 | IDB Transaction / row array |
| `broadcastSessionSummaryFlush.js` | snapshot → review fields 抽出 / IDB 書き込み | `extractReviewFieldsFromSnapshot()`, `maybeFlushBroadcastSessionSummarySample()` | snapshot → review object |
| `broadcastUrl.js` | URL/DOM → liveId 抽出 / 検証 | `extractLiveIdFromUrl()`, `isNicoLiveWatchUrl()` | URL string → liveId |
| `broadcastWaveformFingerprint.js` | コメ時系列 → 周波数署名・類似度計算 | `buildBroadcastWaveformFingerprint()`, `findSimilarBroadcasts()` | StoredComment[] → Float32Array, { similar[] } |
| `broadcasterFollowTarget.js` | snapshot → フォロー対象ユーザー抽出 | `resolveBroadcasterFollowTarget(snapshot)` | snapshot → { followUserId, followUserName } |
| `broadcasterUserId.js` | snapshot → 配信者 userId 抽出 | `extractBroadcasterUserId(input)` | snapshot → string |
| `yukkuriBroadcastSummary.js` | MarketingReport → ゆっくり音声台本 HTML | `buildYukkuriBroadcastSummary()`, `renderYukkuriBroadcastSummaryHtml()` | MarketingReport → YukkuriLine[], HTML |
| `mangaBroadcastSummary.js` | MarketingReport → 漫画パネル表現 HTML | `buildMangaBroadcastPanels()`, `renderMangaBroadcastPanelsHtml()` | MarketingReport → MangaPanel[], HTML |

### 4.2 chrome.storage.local の nls_* キーマップ

#### コメント・チャット系
- `nls_comments_<liveId>` — `StoredComment[] { commentNo, text, userId, nickname, capturedAt }`

#### ギフト系
- `nls_gift_users_<liveId>` — `StoredGiftUser[] { userId, nickname, capturedAt, throwCount }`
- `nls_gift_subapp_history_<liveId>` — sub-app 由来 payload（v0.1.204 で Claude が拡張中、フォーマット未確定）

#### 配信 metadata
- `nls_broadcast_summary_v1` IDB — `BROADCAST_SUMMARY_STORE` に過去配信サマリ rows（liveId, capturedAt, peakConcurrent 等）。`index('byCapturedAt')` で時系列 sort 可能
- `nls_last_watch_url` — 最後に見た配信ページ URL

#### セッション・状態
- `nls_comment_ingest_log_v1`
- `nls_comment_panel_status`
- `nls_event_dom_<liveId>`
- `nls_auto_backup_state`

#### マーケティング系設定
- `nls_marketing_export_mask_labels_v1` — 共有向けマスク設定フラグ

#### その他 UI
- `nls_dm_tr:<liveId>` — dev monitor trend (dev only)
- `nls_inline_panel_*`
- `nls_recording_enabled`, `nls_voice_autosend`, `nls_thumb_auto_enabled`

#### IDB 過去配信サマリの参照経路

```js
import {
  openBroadcastSessionSummaryDb,
  listBroadcastSessionSummaryForLive,
} from './broadcastSessionSummaryDb.js';

const db = await openBroadcastSessionSummaryDb();
const rows = await listBroadcastSessionSummaryForLive(db, liveId, /* limit */ 20);
// rows[i] = { liveId, capturedAt, peakConcurrent, commentCount, uniqueUsers, ... }
```

---

## 5. 規約配慮（厳守）

### 5.1 OK / NG 表

| 項目 | 可否 |
|---|---|
| 動画 / 音声の録画 | ❌ 絶対不可 |
| プレイヤー画面キャプチャ（MediaRecorder API / canvas.captureStream / video.captureStream） | ❌ 絶対不可 |
| 公開された統計データの集計 | ✅ |
| 公開コメントの保存・集計（拡張本体が記録した範囲内） | ✅ |
| 配信者の uid / 名前の表示 | ✅（公開情報） |
| 視聴者 uid の表示 | ❌ SHA-256 ハッシュ化必須 |
| AI 分析（オンデバイス Built-in AI） | ✅ |
| AI 分析（外部クラウド API: Anthropic / Google / OpenAI 等） | ❌ |
| 視聴していない配信の新規スクレイプ | ❌（既に記録済データの範囲のみ） |
| HTML レポートのローカル生成 | ✅ |
| HTML レポートの自動アップロード・公開 | ❌（kimito さんが手動で判断） |
| avatar URL（公開画像）の HTML 表示 | ✅ |

### 5.2 視聴者 uid のハッシュ化

```js
async function hashUserId(uid) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(uid)));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
```

短縮 16 文字で衝突確率は十分低い。必要なら 32 文字に拡張。
配信者の userId はハッシュ化不要（公開情報、本拡張は既に表示している）。

### 5.3 録画 NG の境界

- **描写機能（テキスト集計 + AI サマリ）** ✅ — text のみ、player 画面に触れない
- **録画機能（メディア保存）** ❌ — MediaRecorder / canvas.captureStream / 任意の binary キャプチャ全て NG

avatar URL の HTML 表示は OK（公開画像、`<img src="...">` での参照のみ）。

---

## 6. UI / UX 規約

### 6.1 SVG マークアップ

- `viewBox="0 0 W H"` 標準（W=800〜960, H=250〜400 px 相当）
- `width` / `height` は CSS で制御、`viewBox` で aspect ratio 固定
- 背景矩形: `<rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="none" stroke="#334155" stroke-width="0.5"/>` が定型

### 6.2 色パレット（dark mode 前提）

- 背景: `#0f172a`
- text: `#e2e8f0`
- accent green: `#22c55e`（成長・ポジティブ）
- accent purple: `#a855f7`（特別・推し）
- accent sky: `#38bdf8`（情報・neutral）
- accent amber: `#fbbf24`（注意・ピーク）
- 中間調 stroke: `#334155`
- opacity: 0.6〜0.85 で濃淡

### 6.3 アクセシビリティ

- `<svg aria-label="...">` 必須（chart の性質と内容を 1 文で）
- 個別データ点に `<title>` ツールチップ（マウスホバーで表示）
- セクションに `role="article"` / `role="note"` を適切に
- `<img alt="...">` 必須

#### 例

```html
<svg viewBox="0 0 800 300" class="mkt-svg" aria-label="累積と5分窓の折れ線">
  <rect x="40" y="20" width="760" height="260" fill="none" stroke="#334155" stroke-width="0.5"/>
  <polyline points="..." fill="none" stroke="#22c55e" stroke-width="2.2" />
  <circle cx="..." cy="..." r="5" fill="none" stroke="#fbbf24">
    <title>ピーク: 15分目 / 500人</title>
  </circle>
</svg>
```

---

## 7. 実装規約（TDD 必須）

### 7.1 テストランナー
- `vitest` (v3) + `happy-dom`
- `npm test` で全テスト走行
- `npx vitest run src/lib/marketing src/lib/broadcast` でマーケ系のみ走行（path prefix で部分マッチ）

### 7.2 fixture パターン
- ヘルパー関数で mock オブジェクト生成（例: `c(commentNo, userId, text, offsetMs, extra)` → StoredComment）
- 固定 liveId（`'lv1'`, `'lv999'`）で segregate
- 固定タイムスタンプ base（`const BASE = 1000;`）で deterministic
- 既存テストファイル（`marketingAggregate.test.js` 等）の fixture パターンを真似る

### 7.3 拡張本体テストを破壊しないルール

現状: 248 files / 2852+ tests pass。
- マーケ系テストの追加で既存テストが落ちたら blocker
- 共通 fixture（`tests/e2e/fixtures/`）に手を入れる場合は事前合意
- `chrome.storage.local` mock は既存 helper と整合

### 7.4 テストファイル命名
- `<source>.test.js` を同ディレクトリに配置
- DOM テストは `<source>.dom.test.js`

---

## 8. ブランチ・PR 戦略

### 8.1 ブランチ命名
- codex: `codex/marketing-<task>` プレフィックス
- 例: `codex/marketing-gift-timeline`, `codex/marketing-gemini-summary`

### 8.2 merge 先
- base branch: `feature/live-item-throw-by-user`
- master / main へは kimito さんが別途 ff-merge

### 8.3 force-push 禁止
- Claude のブランチ（`claude/v0XXX-*`）に force-push しない
- 共通 base（`feature/live-item-throw-by-user`）に force-push しない
- 自分の codex ブランチ内なら force-push 可（共有前のみ）

### 8.4 PR 単位
1 機能 1 PR。1.3 / 1.4 / 1.1 / 1.2 を別 PR にする。1 PR に詰め込まない。

PR タイトル例:
- `feat(marketing): gift timeline SVG 散布図 + 累積線`
- `feat(marketing): Gemini Nano 連携 + 配信サマリ AI 生成`
- `feat(marketing): 配信内容描写の narrative builder 追加`
- `feat(marketing): 配信間比較を他配信者横断対応に拡張`

---

## 9. 推奨実装順

| 順 | 機能 | 主要ファイル | 着手しやすさ |
|---|---|---|---|
| 1 | **既存把握**（30 分） | §4.1 のファイル群を Read | — |
| 2 | **gift timeline (1.3)** | `giftTimelineHtml.js`（新設） | ⭐⭐⭐ TDD しやすい、既存データで完結 |
| 3 | **配信内容の描写 (1.4)** | `broadcastReportSummary.js` 拡張 + `broadcastNarrativeBuilder.js`（新設） | ⭐⭐ |
| 4 | **Gemini 連携 (1.1)** | `geminiBroadcastSummary.js`（新設） | ⭐⭐ Built-in AI 検証必要 |
| 5 | **配信間比較拡張 (1.2)** | `broadcastCrossCompare.js` 拡張 | ⭐ uid hash 全部対応必要 |

---

## 10. gift timeline (1.3) 着手のおすすめ既存活用ポイント

Brief 用調査で抽出した「再利用候補」:

1. **`loadLastBroadcastSummary(db, opts)`** (loadLastBroadcastSummary.js)
   - IDB から最新配信サマリを 1 行取得 → UI で「前回配信との比較」
   - freshness check 済み

2. **`listRecentUniqueBroadcastLiveIds(db, limit)`** (recentBroadcastLiveIds.js)
   - 過去 N 配信の liveId リスト → gift timeline のフィルタ UI

3. **`buildBroadcastWaveformFingerprint(comments)`** + **`findSimilarBroadcasts(current, past)`**
   - コメ時系列のフィンガープリント → gift timeline の「似た過去配信」推奨

4. **`buildWeekdayHourHeatmap(input)`** (broadcastCrossCompare.js)
   - 曜日×時間帯密度ヒートマップ → 「このタイミングのギフトが多い」表示

5. **SVG / HTML 生成基盤** (marketingChartsHtml.js)
   - レイアウト・色・accessibility 規約が成熟 → gift timeline も同基盤で UI 一貫性

### 注意点

- `StoredComment` (`capturedAt`) と `StoredGiftUser` (`capturedAt`) は別オブジェクト → 統合時に型マッピング層が必要
- IDB `nls_broadcast_summary_v1` は sample-based（全行は保存されない）→ 詳細 gift timeline には `nls_gift_users_<liveId>` の直読が必須
- `nls_gift_subapp_history_<liveId>` のフォーマットは Claude 側 v0.1.204 で確定。当面は **依存しない設計** に

---

## 11. 質問・確認事項

ご質問・確認事項は **kimito さん（プロジェクトオーナー）経由で Claude に連絡** してください。直接 Claude のブランチに push したり、Claude 領域のファイルを編集することは避けてください（領域ロック §2 違反）。

不明点が出たら:
1. まず本書 §4 の既存ファイル（`marketingAggregate.js` 等）を読んで類推
2. それでも不明なら kimito さんへ「`docs/codex-marketing-analytics-brief.md` の §X について確認したい」形で照会

---

## 12. 着手宣言

実装着手時は以下を kimito さんに伝えてください:

> 「`docs/codex-marketing-analytics-brief.md` を読んで領域分担を理解した。1.3 gift timeline から TDD で着手する」

---

## Appendix A: 関連 memory

Claude が memory に保持しているマーケ分析関連の記録:
- `codex_collaboration_rules.md` — 役割分担と干渉回避の原則
- `project_release_status.md` — 最新リリース状況

これらは Claude の memory 配下にあり、codex から直接読めませんが、kimito さん経由で照会してください。

---

## Appendix B: Built-in AI の参考リンク（外部公開情報）

- Chrome Built-in AI ドキュメント（developer.chrome.com の AI セクション）
- `LanguageModel` API（Prompt API）
- `Summarizer` API
- `Writer` / `Rewriter` API

Origin Trial は Chrome 138 で終了し標準化済み。ただし第一引数 `availability()` で必ず利用可否確認すること。

---

*Last updated: 2026-05-07*
*Maintained by: Claude (拡張本体担当)*
