# お題: LINE公式アカウント「りんく」に画像認識・URL認識機能を追加したい

## 背景
`line-harness-oss`（Cloudflare Workers製のLINE公式アカウントBot、AI社員「りんく」）で、
ユーザーが画像やURLを送っても、AIが中身を理解して返信できない。現状は画像を受信しても
「画像は認識できません。テキストベースの会話のみ対応可能です」と正直に答えるだけで、
実際にはR2に保存されてURLが記録されるのみ。URLもテキストの一部として渡るだけで
リンク先の内容（OGP等）を取得・解釈する仕組みは無い。

これを「画像の内容を読んで返信に活かす」「送られてきたURLの中身（ページ内容）を
読んで返信に活かす」ように拡張したい。

## 現状のアーキテクチャ（司令塔調査済み・事実）

- Cloudflare Workers + Hono構成。LINE webhook受信 → D1保存 → AI応答生成 → LINE返信、の流れ。
- テキストメッセージの応答生成は `apps/worker/src/services/groq-pipeline.ts` が起点。
  cache → canned(定型文) → RAG+LLMチェーン、の順で試す。
- LLM呼び出しは `apps/worker/src/services/llm-chain.ts`（Groq→Gemini→Cloudflare Workers AI
  の3段フォールバック、webhook受信からの残り時間駆動でタイムアウト調整）
  → `apps/worker/src/services/llm-providers.ts`（`callGroq`/`callGemini`/`callWorkersAi`、
  OpenAI互換 chat/completions を共通実装で叩いている）。
- **画像メッセージの処理は完全に別経路**（`apps/worker/src/routes/webhook.ts` 498-556行）。
  `event.message.type === 'image'` の分岐は、LINE Content APIから画像バイナリを取得し
  `apps/worker/src/services/incoming-image.ts` (`fetchAndStoreIncomingImage`) でR2に保存、
  `messages_log` に記録して即 `return` する。**AI応答生成ロジック（groq-pipeline.ts）が
  一切呼ばれない**。つまり画像を送っても現状はBotから何の返信も出ない設計。
- `llm-providers.ts` の `ChatMessage.content` は `string` 型固定。画像URLを渡すvision形式
  （OpenAI互換の `content: [{type: "text"...}, {type: "image_url"...}]` 配列形式）には
  現状未対応。
- URL関連で近い既存資産として `apps/worker/src/lib/og-resolver.ts` があるが、これは
  「自分たちが発行するリンク（tracked-link/event/form）」のOGP情報をDBから組み立てる
  ものであり、「ユーザーが送ってきた外部URLの中身を取得・解釈する」機能ではない
  （用途が別物、名前が紛らわしいだけ）。
- webhookはreplyToken失効（60秒）との戦いで、`llm-chain.ts` は
  `receivedAt` からの残り時間を見て段をスキップする設計になっている。画像を外部APIに
  投げてvision解析させる場合、この60秒予算内に収める必要がある。
- Groq・GeminiともOpenAI互換エンドポイントを使っており、両者ともvision対応モデルが
  存在する（Groqは`llama-4-scout`等、Geminiは`gemini-2.5-flash`等）。ただし現行の
  `groq-config.ts`（`getBotConfig().llm.chain`）に設定されているモデルがvision対応かは
  未確認。

## 検討してほしいこと
1. 画像認識の実装方式（vision対応モデルへの直接投げ方、既存3段フォールバックとの統合方法、
   フォールバック段でvision非対応モデルに当たった場合の扱い）
2. URL認識の実装方式（送られてきたURLをfetchしてOGP/本文を取得する処理をどこに置くか、
   フェッチ失敗時のフォールバック、SSRF等のセキュリティ考慮）
3. 60秒のreplyToken予算内に収めるための時間配分（画像vision呼び出し・URL fetch・
   その後のLLM応答生成を合計してどう配分するか）
4. 既存の `messages_log` への保存方式・`labels`ラベル方式との整合性
5. コスト面（Groq/Geminiの無料枠、画像1枚あたりのトークン消費増）

## 地雷マップ（過去に壊した箇所・分かっている制約）
- 画像受信処理は「AI応答を一切呼ばない設計」を意図的に選んでいる可能性がある
  （60秒制約下でR2アップロード＋vision解析まで安定して収めるのは難しいという判断が
  過去にあったかもしれない。ここは未確認・要調査）。
- `llm-chain.ts` の3段フォールバックは「残り時間駆動でスキップ」という繊細な設計。
  visionのために処理時間が増えると、フォールバック段のタイムアウト計算全体に影響する。
- ChatMessage.content が string 固定という型制約が、Groq/Gemini/WorkersAI 3実装すべてに
  波及するため、型を変えるなら3箇所同時修正が必要。
- 本プロジェクトはfail-closed原則（例外を投げず`fail_closed`で返す）を徹底しており、
  vision機能追加でもこの原則を崩さないこと。
