# codex 向けタスク指示書: マーケ分析 HTML 機能拡張

**対象**: codex（マーケ分析 HTML レポート担当）
**発行**: 2026-05-07
**作成元**: Claude（拡張本体担当）

---

## 0. 役割分担と干渉回避（必読）

このプロジェクトは **Claude（拡張本体）** と **codex（マーケ分析 HTML レポート）** で領域を分けて並列開発しています。お互いの領域に手を出さないでください。過去（v0.1.193 周辺）に並行作業で衝突した経緯があるため、本指示書で領域を **明確にロック** します。

### 0.1 codex が触る領域（**ここのみ修正可**）

```
src/lib/marketing*.js                  ← マーケ集計・HTML 描画
src/lib/marketing*.test.js
src/lib/broadcast*.js                  ← 配信サマリ・比較・session DB
src/lib/broadcast*.test.js
src/lib/yukkuriBroadcastSummary.js     ← ゆっくり風サマリ
src/lib/mangaBroadcastSummary.js       ← マンガ風サマリ
src/lib/yukkuri*.test.js
src/lib/manga*.test.js
docs/marketing-*.md                    ← マーケ関連 doc 新設可
docs/codex-*.md                        ← codex 自身のドキュメント
tests/e2e/marketing*.spec.js           ← マーケ機能の E2E
（新設）src/lib/geminiBroadcastSummary.js / .test.js
（新設）src/lib/giftTimelineHtml.js / .test.js
（新設）src/lib/broadcastNarrativeBuilder.js / .test.js  等、本指示書に基づく新ファイル
```

### 0.2 Claude が触る領域（**触らない**）

```
src/extension/content-entry.js         ← 拡張 content script 本体
src/extension/popup-entry.js           ← popup UI 本体
src/extension/page-intercept-entry.js  ← intercept hook
src/extension/background.js            ← service worker

src/lib/ndgr*.js                       ← NDGR 受信・decode
src/lib/parseGiftComment.js
src/lib/giftRecord.js
src/lib/giftDisplayNickname.js
src/lib/giftRankStrip*.js
src/lib/officialEventDomBundle.js
src/lib/officialEventBannerDom.js
src/lib/scrapeGiftHistoryList.js
src/lib/scrapeTotalGiftCountList.js
src/lib/summarizeGiftSubAppHistoryDiag.js
src/lib/summarizeDevMonitorGiftRanking.js
src/lib/diagWarnings.js
src/lib/diagnosticErrorRing.js
src/lib/diagnosticRedact.js
src/lib/consoleErrorBuffer.js
src/lib/networkErrorProbe.js
src/lib/probeRecommendedLiveSection.js
src/lib/probeWatchPageDomStructure.js
src/lib/parseEmbeddedDataViewerInfo.js  ← v0.1.203 新設
src/lib/deriveAvatarUrlFromUid.js       ← v0.1.203 新設
src/lib/pruneStaleEventDomLvs.js        ← v0.1.203 新設
src/lib/watchPageViewerProfile.js
src/lib/inlinePanel*.js                 ← inline panel レイアウト
src/lib/topSupportRankStrip*.js         ← 応援ランクストリップ
src/lib/storyUserLane*.js               ← story user lane

src/lib/mcpBridge/*.js                  ← MCP bridge 関連すべて
tools/mcp-nicolive/                     ← MCP server 本体

extension/manifest.json                 ← 拡張 manifest（version も Claude 管理）
extension/popup.html
extension/sidepanel.html
extension/options.html
extension/dist/                         ← build 成果物（npm run build 経由のみ）

package.json の "version" フィールド    ← 拡張本体バージョン、Claude 管理
src/lib/changelog.js                    ← 拡張本体リリース履歴、Claude 管理
src/lib/changelog.test.js
```

### 0.3 共有領域（**変更時は事前共有**）

- `package.json` の dependencies / devDependencies — npm install 衝突注意
- `eslint.config.js` / `tsconfig.json` / `vitest.config.js`
- `tests/e2e/` の共通 fixture
- `scripts/build.mjs` / `scripts/verify-bump.mjs`

### 0.4 ブランチ戦略

- codex のブランチ名: `codex/marketing-*` プレフィックス
- Claude のブランチ名: `claude/v0204-*` 等（version-based）
- merge 先（base branch）: `feature/live-item-throw-by-user`
- 互いに force-push しない、rebase でも他領域のファイルに触らない

### 0.5 commit メッセージ prefix

- codex: `feat(marketing): ...` `feat(broadcast): ...` `feat(report): ...`
- Claude: `feat(diag): ...` `feat(viewer): ...` `feat(popup): ...` `feat(content): ...`
- 両者共通: `chore(release): ...`（Claude のみ実施）, `chore(deps): ...`（事前合意）, `test: ...`, `docs: ...`

---

## 1. 実装してほしい機能（マーケ分析 HTML レポート拡張）

既存の `marketingChartsHtml.js` / `broadcastReportSummary.js` / `broadcastCrossCompare.js` 等の構造を尊重しつつ、以下 4 機能を統合してください。

### 1.1 Gemini 連携機能（オンデバイス AI 分析）

Chrome 138+ の **Built-in AI（Gemini Nano）** を使ってローカル端末内だけで分析を完結させる。**外部 API 呼び出しなし、Anthropic / Google のクラウドにも送らない**。

#### 実装ファイル（新設）
- `src/lib/geminiBroadcastSummary.js` — 純関数 + capabilities 判定
- `src/lib/geminiBroadcastSummary.test.js` — happy-dom + mock

#### API
```js
/**
 * @typedef {{
 *   available: boolean,
 *   reason: string|null,
 *   summary: string,
 *   sentimentBalance: { positive: number, negative: number, neutral: number },
 *   peakHighlights: Array<{ atSec: number, reason: string }>
 * }} GeminiBroadcastAnalysis
 */

export async function analyzeBroadcastWithGeminiNano(
  comments,        // 保存コメント配列
  giftEvents,      // 個別ギフト event 配列（v0.1.204 で利用可能予定）
  programStats     // { startedAt, endedAt, peakWatchCount, totalGiftPoints, ... }
) { ... }
```

#### capabilities 判定（必須）
```js
if (typeof self.ai?.languageModel?.create !== 'function') {
  return { available: false, reason: 'gemini_nano_api_not_present', ... };
}
const cap = await self.ai.languageModel.capabilities();
if (cap.available === 'no') {
  return { available: false, reason: 'device_not_supported', ... };
}
if (cap.available === 'after-download') {
  return { available: false, reason: 'model_downloading', ... };
}
```

#### system prompt（推奨）
```
あなたはニコニコ生放送の保存コメントから、配信者本人向けの 2-3 文の振り返りサマリを書く専門家です。
専門用語は使わず、配信者が次回に活かせる視点で書いてください。
個人情報（特定の視聴者名やニックネーム）は出さないでください。
```

#### fallback 表示
- API 未対応 → 「お使いの Chrome では Built-in AI を利用できません（Chrome 138 以降が必要）」
- model_downloading → 「Gemini Nano モデルを初回ダウンロード中です（約 3GB）。完了後に再表示してください」
- device_not_supported → 「お使いの端末は Gemini Nano に対応していません」

### 1.2 配信間比較機能（自配信 + 他配信者の配信、既存 `broadcastCrossCompare.js` を拡張）

ユーザーの利用シーン（重要）：

> 自分の配信だけじゃなく、いろんな人の配信を比較したい

つまり kimito さんは「他の配信者の配信を視聴している時にも本拡張を ON にして、ローカル storage に各配信のコメント・ギフト・統計を蓄積している」という前提。**この既に蓄積された全配信ログ**を比較対象にする。

#### 比較対象の範囲（必須）

✅ **対象**:
- kimito さんが **視聴 / 記録** した全配信（`chrome.storage.local` の `nls_comments_<liveId>` キーで存在する配信すべて）
- これには「kimito さん自身の配信」と「他配信者の配信」の両方が含まれる
- broadcasterUserId が異なる配信どうしを横断比較する用途を主眼とする

❌ **対象外**:
- kimito さんが視聴していない（拡張で記録していない）配信を新たに取りに行くこと
- 既存ローカルデータの範囲を超えた API スクレイプ
- 配信者本人の許可なしに非公開情報を取得すること

#### 比較軸（拡張版）
- **配信者間比較**: 配信者 A vs 配信者 B vs 配信者 C で「平均コメ密度 / ギフト pt / 盛り上がり時刻」を並べる
- **時系列比較**: 同一配信者の過去 N 回の推移（自分でも他人でも）
- **曜日 / 時間帯比較**: 「土曜 22 時の配信群 vs 平日昼の配信群」を全配信者から横断的に
- **コメンター被り**: 複数配信に同じ視聴者が来ているか（uid ハッシュで判定）
- **ジャンルクラスタリング**: コメント特徴量（ゲーム名 / 雑談キーワード / 歌キーワード等）から自動カテゴリ分け、同カテゴリ内で比較
- **盛り上がり比較**: gift event の集中タイミングを配信間でオーバーレイ

#### データソース
- `chrome.storage.local` の `nls_comments_<liveId>` 一覧（自分の配信 + 他配信者の配信、すべて含む）
- `chrome.storage.local` の `nls_event_dom_<liveId>` 一覧
- `chrome.storage.local` の `nls_user_comment_profile_cache`
- 各配信の broadcasterUserId / broadcasterName（snapshot に含まれる）
- マーケ集計（既存 `marketingAggregate.js`）

#### プライバシー設計（必須、規約配慮）

| 項目 | 扱い |
|---|---|
| 配信者 broadcasterUserId | そのまま比較・表示してよい（公開情報、ニコ生のユーザーページが公開）|
| 配信者 broadcasterName | そのまま比較・表示してよい（同上） |
| 視聴者 uid（コメンター）| **SHA-256 ハッシュ化必須**（本人特定を防ぐ）、個別表示は kimito さんの自分自身のみ |
| 視聴者 nickname（コメンター）| ハッシュ化または「N 名」のような匿名集計 |
| ギフト sender uid | ハッシュ化、ただし「同一 sender が複数配信に登場」の判定には使う |

**重要**：
- 比較は **kimito さんがローカル端末に保存済のデータ範囲内で完結**
- 第三者の配信者ページや公式 API を新規にスクレイプしない（既に拡張本体が記録した範囲のみ使う）
- HTML レポートの **ローカル表示のみ**（自動的にクラウド送信・公開する機能なし）
- 配信者本人の身バレは公開情報の範囲を超えない
- 視聴者の個人情報は集計・匿名化のみ
- 公開・共有する場合の責任は kimito さん側（指示書では制御しない、ただし HTML レポートに「個人利用前提」の注意書きを表示する）

### 1.3 アイテムタイミング表示（gift timeline）

「アイテムがどんなタイミングで飛んだか」を時系列で可視化。

#### 実装ファイル（新設）
- `src/lib/giftTimelineHtml.js` — SVG inline 描画
- `src/lib/giftTimelineHtml.test.js` — DOM string テスト

#### 描画
- X 軸: 配信開始からの経過時間（00:00 〜 02:30 等）
- Y 軸 1: ギフト pt 累積（折れ線）
- Y 軸 2: 個別 gift event のドット（散布図）
  - ドット color: sender uid のハッシュから決定（同一 sender は同色）
  - ドット size: ギフト pt（log scale）
- ドット hover で「sender / item / pt / 時刻」を tooltip 表示
- 配信中のコメ密度ピークも併記（背景に薄い縦線）

#### 依存
- 外部ライブラリは使わない（軽量化、CSP 制約）
- SVG inline で完結
- 既存 `marketingChartsHtml.js` のパターンを参考に

#### データソース
- v0.1.203 時点では `giftCommentDiag.observations`（コメント DOM パース由来、断片的）
- v0.1.204 で NDGR Protobuf gift event が取れるようになった後はそちらを優先

### 1.4 配信内容の描写機能（必須・録画機能とは別物）

ユーザー要望（重要、誤解しないこと）：

> 描写はほしいです。録画機能をつけないでといういみです

つまり「**描写機能は作る**、ただし**動画・音声の録画は作らない**」が正解。描写機能を諦めるという意味ではない。

#### 描写機能の中身（**必ず作る**）

「どんな配信だったか」を **テキスト情報のみ** で振り返れるサマリ。既存 `broadcastReportSummary.js` を拡張：

```
基本情報:
- 配信者名 / broadcaster uid / 配信日時 / 配信時間 / liveId

盛り上がり指標:
- 視聴者数の推移（最大値・平均・終盤の山）
- コメ密度の時間帯（最初の 30 分は静か、1 時間後にピーク 等）
- ギフト送信者上位 5 名（ハッシュ化 uid 表示）
- ギフトアイテム上位 5 種
- イベント参加状況（参加していたか / 終盤の順位）

配信の雰囲気:
- Gemini Nano による 2-3 文の自動 summary（機能 1.1 と統合）
- コメント特徴量からの自動タグ（「歌枠」「ゲーム」「雑談」「料理」等）
- 視聴者反応の傾向（盛り上がり / しっとり / 笑い系）

時系列ハイライト:
- 「配信開始から N 分: 視聴者数急増」
- 「配信開始から N 分: ギフト集中」
- 「配信開始から N 分: コメ density ピーク」
```

#### 描写の出力形式
- HTML レポート内のセクション
- マンガ風 / ゆっくり風（既存 `mangaBroadcastSummary.js` / `yukkuriBroadcastSummary.js`）の演出は維持

#### 録画機能との違い（明確化）

| 項目 | 描写機能 ✅ 作る | 録画機能 ❌ 作らない |
|---|---|---|
| 動画ストリーム保存 | NO | NO |
| 音声ストリーム保存 | NO | NO |
| プレイヤー画面キャプチャ | NO | NO |
| 配信タイトル・時刻 | YES（公開情報のテキスト）| - |
| コメント保存 | 既存（拡張本体が実施）| - |
| ギフトイベント集計 | YES（公開数値の集計）| - |
| AI 自動サマリ | YES（オンデバイス Gemini Nano）| - |
| HTML レポート | YES（ローカル生成）| - |

> 「描写」は **テキスト集計と AI 自動文章化**、「録画」は **メディアストリーム保存**。両者は別物。本機能は前者のみ。

#### NG 項目（録画機能、絶対やらない）
- ❌ 動画ストリームの保存（HLS / MP4 等）
- ❌ 音声ストリームの保存
- ❌ プレイヤー画面のキャプチャ・スクリーンショット・gif 化
- ❌ MediaRecorder API / canvas.captureStream / video.captureStream
- ❌ コメント以外の視聴者発言（音声・チャット外）の取得

---

## 2. 規約配慮（厳守）

ニコニコ生放送の利用規約と一般的な配信プラットフォーム規約への配慮：

| 項目 | 可否 |
|---|---|
| 動画 / 音声の録画 | ❌ 絶対不可 |
| プレイヤー画面キャプチャ | ❌ 絶対不可 |
| 公開された統計データの集計 | ✅ OK |
| 公開コメントの保存・集計 | ✅ OK（配信者本人記録時のみ）|
| 公式 stats API の値の引用 | ✅ OK |
| 視聴者 uid をそのまま表示 | ❌ ハッシュ化必須（個人特定防止） |
| 配信者 uid / 名前の表示 | ✅ OK（公開情報） |
| 他配信者の配信を比較対象に | ✅ **kimito さんが視聴して記録済の範囲なら OK**（ローカル storage の `nls_comments_<liveId>` に存在するもの全部）|
| 視聴していない配信を新規取得 | ❌ スクレイプ禁止、保存済データの範囲のみ |
| AI による分析（オンデバイス） | ✅ Built-in AI のみ、外部 API 禁止 |
| AI による分析（外部クラウド API） | ❌ Anthropic / Google / OpenAI など外部送信は不可 |
| HTML レポート出力 | ✅ ローカルファイルのみ、自動アップロード禁止 |
| HTML レポートの SNS 公開 | ⚠️ kimito さん判断、レポート末尾に「個人利用前提・公開時は uid 等にご注意」の注意書き必須 |

### 「マーケ分析」の意味の明示
本機能は **kimito さんが視聴・記録した配信群を振り返り、自分の配信改善や視聴傾向把握に活かす目的** のもの。

- 自分の配信のみならず、**視聴した他配信者の配信も比較対象**になる（ローカル保存範囲内で完結）
- 第三者の配信者を意図的にスクレイプ・監視する目的ではない
- 公開・共有する場合の責任は kimito さん側で判断

---

## 3. データ供給源と interface

拡張本体（Claude 領域）から提供されるデータ：

### 3.1 chrome.storage.local の主要 key（読み取りのみ）

| Key | Shape | 書き込み元 |
|---|---|---|
| `nls_comments_<liveId>` | `Array<CommentRow>` | content-entry.js |
| `nls_event_dom_<liveId>` | `EventDomBundle` | content-entry.js |
| `nls_user_comment_profile_cache` | `Record<uid, ProfileEntry>` | popup-entry.js |
| `nls_self_posted_recents` | `Array<SelfPosted>` | popup-entry.js |
| `nls_mcp_live_snapshot_v1_<liveId>` | `CanonicalSnapshot` | content-entry.js |
| `nls_ai_share_fast_diag_v1` | `FastDiagPayload` | content-entry.js |

これらの shape は **拡張本体（Claude）が定義** します。codex は読み取り専用で参照してください。shape が変わる際は Claude が事前共有します。

### 3.2 AI 共有診断 JSON（既存）

popup の「AI 共有用にコピー」ボタンと同じ payload。`KEY_AI_SHARE_FAST_DIAG` から読める。マーケ分析の入力としても使えます。

主要フィールド（v0.1.203 時点）：
```
popup.watchSnapshotMeta.{ liveId, broadcasterUserId, viewerUserId, ... }
content.giftDiagnostics.{ rankingDiag, multiTabDiag, ギフトサマリ, ... }
content.giftSubAppDiag.{ historyCount, failureReason, ... }
content.networkErrorProbe.{ ndgrConnectStatus, nicoadFetchStatus, ... }
content.romiDebug.{ recording, ndgrLastReceivedAgo, ... }
```

### 3.3 v0.1.204 で予定されている追加データ（Claude 担当）

- 個別 gift event のリスト（NDGR Protobuf decode 後）：`{ atMs, advertiserUserId, advertiserName, itemName, point, contributionRank }`
- これが取れたら codex の機能 1.3（gift timeline）と機能 1.4（描写）が完成度向上

---

## 4. テスト方針

- **TDD 必須**: vitest で red → green → refactor
- **happy-dom 環境**: SVG / DOM 描画は `happy-dom` で
- **fixture 化**: 実機ではなく合成 payload で grep-able に
- **既存テスト破壊禁止**: 拡張本体の vitest 全 pass を維持（現在 248 files / 2852+ tests）
- **lint / typecheck / build pass**: PR 提出前に必須

---

## 5. リリース運用

- **拡張本体の version は Claude が管理**（package.json / extension/manifest.json / src/lib/changelog.js）
- マーケ分析だけの変更で本体 build が変わらないなら、**codex の PR は version bump 不要**
- 本体 build が変わるマーケ分析変更（dist にも影響する場合）は、Claude と協調して bump

### codex PR テンプレート
```
title: feat(marketing): <内容> / feat(broadcast): <内容> など

## Summary
- ...

## 規約配慮
- 動画/音声録画なし、Built-in AI 完全オンデバイス、第三者 uid ハッシュ化

## Test plan
- [x] vitest <new tests>
- [x] lint / typecheck pass
- [ ] HTML レポート出力で目視確認
```

---

## 6. 緊急時 / 競合発生時

- 拡張本体の挙動が変わった場合、Claude が memory（`~/.claude/projects/.../memory/`）を更新
- データ shape 変更時は Claude が **本 doc に追記** + git log で codex に通知
- ファイルが両者で modified になったら、**領域分担に従って所有者が解決**
  - codex 領域 → codex が解決
  - Claude 領域 → Claude が解決
  - 共有領域 → 事前合意の上で先着が解決

---

## 7. 既存 codex 作業との整合（v0.1.193 周辺）

過去に codex は v0.1.193 で以下を始めていた（uncommit working changes として残っていた可能性）：
- コメント分類細分化
- マーケ分析 HTML 役割分離
- マーケ分析 HTML 棒グラフ

本指示書はこれらの **発展版** として位置付けられます。既に commit されている部分があれば尊重し、競合する実装は本指示書を優先（特に録画機能の混入禁止）。

---

**この指示書は `docs/codex-marketing-analytics-brief.md` として配布されます。codex はこの doc を読んでから着手してください。**
