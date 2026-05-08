# Codex Brief Addendum — v0.1.205 拡張（kimito さん要望 2026-05-07 反映）

このドキュメントは [docs/codex-marketing-analytics-brief.md](codex-marketing-analytics-brief.md) の補遺です。kimito さんの 2026-05-07 提案を反映した追加方針を記述します。

本書を読む順序: **本体 brief → 本 addendum**。

---

## 1. Gemini Nano（Built-in AI）の位置づけを強化

### 1.1 動機（コスト視点）

| 項目 | クラウド AI（外部 API） | Built-in AI (Gemini Nano) |
|---|---|---|
| ユーザーコスト | 従量課金 or 運営者負担 | **0**（ローカル実行） |
| プライバシー | 外部送信 | **ローカル完結** |
| レイテンシ | ネットワーク依存 | デバイス性能依存（一般に低） |
| 規約配慮 | CWS 規約配慮要 | クリア |
| オフライン | 不可 | **可** |

→ 拡張ユーザーが増えても運営コストが線形に増えない = **機能を積極的に AI 化できる** という設計判断。kimito さんの提案「AI 機能は gemini nano を使ったほうがユーザーのコストが少ない」と整合。

### 1.2 Claude が v0.1.205 で先行提供する基盤 lib

| ファイル | 責務 | 領域 |
|---|---|---|
| `src/lib/geminiNanoBridge.js` | Built-in AI（LanguageModel / Summarizer）の薄いラッパー | Claude |
| `src/lib/errorAutoDiagnosis.js` | エラーログ → AI 診断 prompt 構築（純関数） | Claude |

#### `geminiNanoBridge.js` の API

```js
import {
  probeBuiltinAiAvailability,
  runBuiltinAiPrompt,
  runBuiltinAiSummarize
} from '../lib/geminiNanoBridge.js';

// 利用可否判定（codex の summarizer は availability 判定を必ずしてから呼ぶ）
const av = await probeBuiltinAiAvailability();
if (av.state !== 'available') {
  // fallback: ルールベースサマリ
}

// 1 ターン prompt
const reply = await runBuiltinAiPrompt({
  system: '配信レポートの分析専門家',
  user: '配信ID: lv1234, コメント数: 500, ピーク: 200...'
});

// Summarizer API（任意の text を要約）
const sum = await runBuiltinAiSummarize({
  text: longText,
  type: 'tldr',     // 'tldr' | 'key-points' | 'teaser' | 'headline'
  length: 'short'   // 'short' | 'medium' | 'long'
});
```

#### codex 側の責務

codex の `src/lib/geminiBroadcastSummary.js`（Brief §3.1）は:
- prompt 構築まで（純関数 `buildGeminiPrompt(report) → { system, user }`）
- 実際の AI 呼び出しは `geminiNanoBridge` を import して行う
- AI が利用できない時の fallback 文言も codex 側で用意

---

## 2. 新機能：レポート → ゆっくり解説変換（codex 領域、Phase E）

kimito さん提案：
> レポートをゆっくり解説に変換機能がいいかも

### 設計案

- 既存 `yukkuriBroadcastSummary.js`（codex 領域、現状はテンプレートベース）を Gemini Nano で発展
- 新設または拡張: `src/lib/yukkuriGeminiSummary.js`（仮称）
- 入力: MarketingReport
- 処理:
  1. `buildYukkuriGeminiPrompt(report)` で prompt 構築
  2. `runBuiltinAiPrompt({ system: '霊夢と魔理沙のゆっくり対話形式で配信レポートを解説してください...', user: reportSerialized })` で AI 呼び出し
  3. 出力をパースして HTML 化（既存 `renderYukkuriBroadcastSummaryHtml` と互換 or 拡張）
- Built-in AI 不在時は既存テンプレベース（`buildYukkuriBroadcastSummary` の現状経路）に fallback

### system prompt の例

```
あなたは「霊夢と魔理沙」の対話形式で niconico 生放送の配信データを
解説する解説者です。視聴者ファンが楽しめるよう、要点を 3〜5 つ取り上げて、
- 霊夢の語尾は「〜よ」「〜だわ」
- 魔理沙の語尾は「〜だぜ」「〜だな」
で対話形式に。1 件あたり 2〜3 行、合計 200〜400 字程度。
特徴的な数字（コメント数 / ピーク / ギフト pt）は具体的に挙げる。
```

### 領域

- prompt 構築 + HTML 化: codex
- AI 呼び出し基盤: Claude（`geminiNanoBridge.js`）

---

## 3. 新機能：Gemini Nano 開発機能エラーチェック（Claude 領域、codex 連携不要）

kimito さん提案：
> gemininanoで開発機能でエラーチェックが向いてそう

### 設計（Claude が v0.1.205 で実装）

- popup「詳しい状況」セクションに **「AI 診断」ボタン** 追加
- ボタン押下時の処理:
  1. 既存 `consoleErrorBuffer.getRing()` + `networkErrorProbe` + `diagWarnings` を集約
  2. `buildErrorDiagnosisPrompt({ consoleErrors, networkErrors, diagWarnings, contextNote })` で prompt 構築
  3. `runBuiltinAiPrompt(prompt)` で AI 実行
  4. 結果を popup 上に 3 行で表示（主因 / 対処 / 備考）
- 効果:
  - kimito さんがテレグラム投稿前に状況把握できる = **サポートコスト削減**
  - 自己診断ループの確立 = AI が assist する開発体験
- 全部 Claude 領域なので codex は触らない

### `errorAutoDiagnosis.js` の API

```js
import { buildErrorDiagnosisPrompt } from '../lib/errorAutoDiagnosis.js';

const prompt = buildErrorDiagnosisPrompt({
  consoleErrors: [...],   // [{ ts, message, source?, stack? }]
  networkErrors: [...],   // [{ url, status?, ts, reason? }]
  diagWarnings: [...],    // [{ severity, code, message }]
  contextNote: 'kimito さんが「拡張が動かない」と報告',
  maxConsoleErrors: 8,    // optional, default 8
  maxNetworkErrors: 6,    // optional, default 6
  maxDiagWarnings: 6      // optional, default 6
});
// prompt = { system: '...', user: '...' }
```

system prompt は固定（出力フォーマット 3 行構成）。user prompt は集約された診断情報の Markdown 化。

---

## 4. ラテラル発想（v0.1.206 以降の候補）

kimito さんの判断材料として、Built-in AI を起点に展開できるアイデア:

1. **AI 機能切替フラグ** `nls_ai_features_enabled` — プライバシー重視ユーザーは off 可能
2. **学習 system prompt** — kimito さんの好み（語尾 / 絵文字なし / 日本語）を template 化、全 AI セッションで共有（`src/lib/userPreferenceSystemPrompt.js`）
3. **「めがくろ」型 type confusion 予防** — 内部ラベル vs 人名を AI で動的判別。新パターンが増えても自動追従
4. **次回配信スタイル提案** — 過去配信のコメント傾向 + ピーク時間 + ギフト動向 → 「次は○○を変えると伸びる」を AI が提案
5. **リアルタイム反応サマリ** — 配信中の直近 1 分のコメントを AI が「楽しい / 疑問 / 退屈 / 議論」で分類してオーバーレイ表示
6. **アンチコメント検出強化** — 既存 `commentKindnessNudge` を Built-in AI で精度向上
7. **配信タイトル提案** — 過去データから AI が次回タイトル案を生成
8. **拡張機能の onboarding** — 初回ユーザーに AI が使い方を案内（Q&A 形式）

これらは v0.1.205 の Phase A〜F が安定したあと、v0.1.206 以降で段階導入候補。

---

## 5. codex への新規依頼

### Phase E（codex 領域、v0.1.205 以降）: レポート → ゆっくり解説変換

- 上記 §2 の設計を実装
- 新設 `src/lib/yukkuriGeminiSummary.js`
- 既存 `yukkuriBroadcastSummary.js` を残しつつ、AI 利用版を別ファイルで（fallback 経路を維持）
- Brief 本体 §3.4 配信内容描写 と統合（narrative + ゆっくり化）

### 既存依頼（変更なし）

- Brief 本体 §9 推奨実装順を継続
  1. gift timeline (1.3)
  2. 配信内容描写 (1.4) + Phase E ゆっくり変換
  3. Gemini 連携 (1.1) — `geminiNanoBridge` を import
  4. 配信間比較 (1.2)

---

## 6. 領域分離（最新版・本 addendum 後の確定図）

| 機能 | 担当 | 主要ファイル |
|---|---|---|
| Built-in AI ラッパー | **Claude** | `src/lib/geminiNanoBridge.js` |
| エラー自動診断 prompt | **Claude** | `src/lib/errorAutoDiagnosis.js` |
| エラー診断 popup ボタン UI | **Claude** | popup-entry.js（次セッション） |
| Gemini Nano サマリ prompt 構築 | codex | `src/lib/geminiBroadcastSummary.js`（Brief §3.1） |
| ゆっくり変換 prompt 構築 | codex | `src/lib/yukkuriGeminiSummary.js`（新設、Phase E） |
| 配信間比較 | codex | `src/lib/broadcastCrossCompare.js` |
| gift timeline | codex | `src/lib/giftTimelineHtml.js`（新設） |
| 配信内容描写 | codex | `src/lib/broadcastReportSummary.js` 拡張 |

---

## 7. 着手順序の更新

### v0.1.205 で Claude が先行実装

| Phase | 内容 | 状態 |
|---|---|---|
| C | `geminiNanoBridge.js` + tests | ✅ 実装完了（v0.1.205 ブランチ push 待ち） |
| D | `errorAutoDiagnosis.js` + tests | ✅ 実装完了（v0.1.205 ブランチ push 待ち） |
| A | gift event 表示統合（content/popup） | 次セッション、popup 大改修なので kimito さん同席で |
| B | avatar URL UI 統合（popup） | 次セッション、popup 大改修なので kimito さん同席で |
| 追加 | popup「AI 診断」ボタン UI | 次セッション、Phase D 完了後 |

### codex 側で v0.1.205 以降

| Phase | 内容 | kimito さんからの受け渡し |
|---|---|---|
| 1.3 | gift timeline | Brief 本体 + 本 addendum を渡す |
| 1.4 + Phase E | 配信内容描写 + ゆっくり変換 | 同上 |
| 1.1 | Gemini Nano 連携 | 同上、`geminiNanoBridge` を import 指示 |
| 1.2 | 配信間比較 | 同上 |

---

*Last updated: 2026-05-07*
*Maintained by: Claude（拡張本体担当 + Built-in AI 基盤提供）*
