# お題: Gmail秘書モードのAI仕分け（triage）不具合の直し方

## 背景

Chrome拡張「君斗りんく」のGmail秘書モード機能で、受信メールをAIが自動仕分けする
`gmail_triage` mode（OpenRouter経由、モデル `google/gemma-3-12b-it`、
`response_format: json_schema` で構造化出力を要求）に不具合が発覚した。

## 発生した不具合（実機で確認済み）

低〜中リスクのメール（例: 「来週のランチ、どうですか？」という雑談メール）を
仕分けさせたところ、モデルは実際には正しく判断していた
（`category: "schedule"`, `priority: "low"`, `riskLevel: "low"`,
`summary: "来週のランチの提案"`, `detectedTasks: []`）にもかかわらず、
その後のフィールド（`suggestedAction`, `draftIntent`, `warnings`）を出力する前に
**半角スペースを大量に生成し続けるループ**に入り、`max_tokens: 900` を使い切って
`finish_reason: "length"` で強制打ち切りされた。

結果、JSONの閉じ括弧が無い不正な出力になり、パース処理
（`extractJsonObject` → 失敗時は空オブジェクト `{}` にフォールバック）が失敗。
安全側のデフォルト値（`category: "unknown"`, `summary: ""`,
`suggestedAction: "needs_manual_review"`）で埋められてしまい、
モデルが実際には正しく出していた分類結果が丸ごと失われた。

3件テストしたうち、高リスク（返金クレーム、短い出力で済んだケース）は成功、
低リスク・中リスクの2件（フィールドが多く長くなるケース）が失敗した。

## このプロダクトの位置づけ（重要な前提）

このGmail秘書モードは「AI返信秘書」という業務ツールとして月額課金
（月2,980円想定）で売る計画で、差別化の核は「返信が必要か正しく判断すること」
「危険な返信を送信前に止めること」。**仕分けが機能しないと商品価値が成立しない。**
低リスクメールが軒並み「要確認」に丸められると、「重要なメールだけAI秘書が
見つける」という価値提案が崩れる。

## 関連コード（実在確認済み・パスで参照可）

- `sw/features/gmail-inbox/triage.js` — `buildGmailTriagePrompt` / `parseGmailTriageContent` /
  `triageGmailInboxItem`。`extractJsonObject` は失敗時に空オブジェクトへフォールバックする実装。
- `sw/features/gmail-inbox/schema.js` — `GMAIL_AI_TRIAGE_SCHEMA`（JSON Schema、9フィールド必須、
  `additionalProperties: false`、`strict: true`）
- `sw/llm.js` — OpenRouter呼び出し本体。`maxTokensOverride: 900`, `temperatureOverride: 0.2`
  で `triage.js` から呼ばれる。

## 地雷マップ（過去の経緯・制約）

- このプロジェクトは個人開発者が1人でGmail秘書モードを実装済み（PR-S1〜S6bまで完了、
  下書き生成LLM化・棚UI・高リスク確認ゲート・ライセンス課金基盤まで一通り動く状態）。
  **triageロジック自体の大規模書き換えは避けたい**（他機能への影響範囲が広い）。
- モデルは低コスト運用が絶対条件（月間コスト目安30円程度で設計されている。GPT-4クラスの
  高価なモデルへの全面切り替えは事業計画上避けたい。ただしtriageだけ品質重視モデルに
  変える、は検討の余地あり）。
- `gmail_draft`（下書き生成）mode は同じ `google/gemma-3-12b-it` で自然文生成しており、
  こちらは今回の3テストでは正常動作していた（構造化出力ではなく自由文だったため
  ループが起きなかった可能性がある）。triage側だけの問題という仮説。
- 既存のテストスイート（`test/gmail-ai-triage-schema-test.js` 等）は `callLLM` を
  モックしており、実LLMの挙動不具合（今回のような空白ループ）は検知できない設計。

## 検討してほしいこと（発散・批判・具体案がほしい）

1. **直接原因への対処**: `max_tokens` を増やす／`extractJsonObject` を部分パース対応にする／
   ループ検知で早期リトライする、などの選択肢のトレードオフ
2. **モデル選定**: `google/gemma-3-12b-it` を構造化出力用途で使い続けるべきか。
   同程度の低コストで空白ループを起こしにくい代替モデル（OpenRouter経由で使えるもの）
   はあるか
3. **恒久対策・再発防止**: 実LLMの構造化出力が壊れるケースを自動検知するテスト設計、
   本番での異常系フォールバック（パース失敗時にリトライする／ユーザーに「仕分け失敗」と
   正直に見せる、等）の設計
4. **優先順位**: 上記のうち、今すぐ直すべきものと、後回しでよいものの切り分け

出力は「結論→根拠→反論・リスク→具体案」の型で。
