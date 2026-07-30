/**
 * 会議メンバー名簿（クラウドのみ。ローカルOllamaは従来通り meeting.mjs 側の
 * MEETING_LOCAL_MODELS/LOCAL_DEFAULT で管理＝ここには入れない）。
 *
 * 2026-07-16 抽出: meeting.mjs にハードコードされていた push(...) 呼び出し列を
 * データ化した（HANDOFF-council-scout-design.md Phase 0）。挙動は変えない
 * リファクタであり、各エントリの日付入りコメントは移設元のものをそのまま保持する
 * （制度的記憶。コメントを消してはならない）。
 *
 * スキーマ:
 *   label:     会議での表示名（例: 'groq/gpt-oss-120b'）
 *   provider:  'groq' | 'gemini' | 'nvidia' | 'cloudflare' | 'openrouter' | 'anthropic'
 *              実在チェック(verifyLiveModels)の対象グループは 'groq'|'gemini' のみ。
 *   rawId:     プロバイダ側の実モデルID（起動時ライブ実在チェックで /models と突合する用。
 *              空文字なら実在チェック対象外＝素通し）。
 *   apiModel:  実際にAPIへ渡すモデル文字列（rawIdと異なる場合があるため別フィールド。
 *              例: groq/compound は rawId も apiModel も 'groq/compound' で同一）。
 *   opts:      openaiChat/geminiChat への追加パラメータ（reasoning_effort 等）。
 *   timeoutMs: 個別タイムアウト（省略時は各 xxxChat の既定値）。
 *   requires:  このエントリを有効化するのに必要な env キー名の配列（'G'|'N'|'O'|'E'|'CF'|'CF_ACC'）。
 *              meeting.mjs 側で解決済みの真偽フラグと突き合わせて if 判定する。
 */
export const LINEUP = [
  { label: 'groq/gpt-oss-120b', provider: 'groq', rawId: 'openai/gpt-oss-120b', apiModel: 'openai/gpt-oss-120b', opts: { reasoning_effort: 'low' }, requires: ['G'] },
  { label: 'groq/llama-3.3-70b', provider: 'groq', rawId: 'llama-3.3-70b-versatile', apiModel: 'llama-3.3-70b-versatile', opts: {}, requires: ['G'] },

  // 2026-06-22 追加（実機で応答確認済み・無料枠）:
  //  - qwen3-32b: thinking付き推論モデル → 批判(critic)。ローカル deepseek の重さ無しで鋭い批判が出せる。
  //  - llama-4-scout: 軽快な新顔 → 速い視点(fast)。
  // ※ groq/kimi-k2 は同日プローブで access 無し（未開放/要申請）→ 不採用。
  //
  // 2026-07-23 撤去（上の2体・qwen3-32b / llama-4-scout）:
  //   council-scout が 07-20 に Groq カタログから消滅を検知し、07-22・07-23 と3日連続で
  //   不在＋プローブ 404。groq の /models 件数も 17→15 と、ちょうどこの2体分だけ減っている。
  //   一時障害ではなく Groq 側の提供終了と判断し、会議を回さず手動で撤去した。
  //   役割の穴: critic 6→5（層が厚く問題なし）／ fast 2→1（groq/llama-3.3-70b のみ）。
  //   fast が単一プロバイダ依存になるが、council-roles の ROLE_FALLBACK fast:["generalist"]
  //   （2026-07-04 追加）が別プロバイダで代行するため会議は成立する。
  //   復活したら council-scout が「新着候補」として拾うので、その時に再採用を検討する。

  // 2026-07-01 追加（司令塔Claudeがライブ /models で実在裏取り）:
  //  - groq/compound: Web検索を内蔵したエージェント型（Groq無料枠）。fact裏取りの「会議内で最新を取りに行く」担当。
  //    エージェント型ゆえ通常チャットより遅い/長い → タイムアウトを広め(150s)に。役割は roleOf で generalist。
  //  - groq/compound-mini: その速い版。軽い fact 確認向け。
  //  ※ 同日、会議が推した "Mistral-7B-Instruct" / "Llama-3-8b-Instruct" は Groq のライブ一覧に無く【幻覚】→ 不採用。
  { label: 'groq/compound', provider: 'groq', rawId: 'groq/compound', apiModel: 'groq/compound', opts: {}, timeoutMs: 180000, requires: ['G'] },
  { label: 'groq/compound-mini', provider: 'groq', rawId: 'groq/compound-mini', apiModel: 'groq/compound-mini', opts: {}, timeoutMs: 150000, requires: ['G'] },

  // 2026-06-25 追加（会議ハーネス自身で採否を合議→司令塔Claudeが実機裏取り）:
  //  - qwen3.6-27b: Groq の新世代 thinking モデル。発散(diverge)。実機で <think>…</think>＋本文を返す
  //    （strip後「東京」を確認済み）。openaiChat 側で <think> を除去するので本文だけが会議に乗る。
  //  ※ 会議は「llama-3.3-70b-instant」を批判/速い視点に推したが【実在しない幻覚】。70Bは -versatile のみ。
  //    8B級の -instant は llama-3.1-8b-instant だけ（実機で確認）。幻覚IDは採用しない。
  { label: 'groq/qwen3.6-27b', provider: 'groq', rawId: 'qwen/qwen3.6-27b', apiModel: 'qwen/qwen3.6-27b', opts: {}, requires: ['G'] },

  // 2026-07-04 追加（実機 /models 取得で新顔確認・weightOf で予備(weight3)に格下げ）:
  //  - gpt-oss-20b: gpt-oss-120b の軽量版。Ollama停止時に diverge-alt(ローカルgpt-oss:20b専任)が
  //    消滅する穴を、クラウド版で塞ぐための予備。正規のgpt-oss-120b(weight1)は絶対に食わない。
  { label: 'groq/gpt-oss-20b', provider: 'groq', rawId: 'openai/gpt-oss-20b', apiModel: 'openai/gpt-oss-20b', opts: { reasoning_effort: 'low' }, requires: ['G'] },

  // Cloudflare Workers AI（2026-06-27 実機で 200＋本文を裏取りして採用。X 一覧は鵜呑みにせず叩いて確認）。
  //  - 採用基準: 会議に「無い能力」を足すものだけ。gpt-oss-120b / llama-3.3-70b は Groq 等で既出なので CF では足さない。
  //  - nemotron-3-120b: どこにも無い大型の別頭脳 → 汎用(generalist)。/ai/models/search で実在確認済み。
  //  - glm-5.2:        reasoning_content を別フィールドで返す強い推論 → 批判(critic)。content は既にクリーンなので stripThinking で十分。
  //  - kimi-k2.7-code: コード特化 → 実装(implement)。
  //  ※ いずれも openaiChat 流用可（OpenAI互換）。役割は council-roles の roleOf が label から自動付与（glm/kimi+code 用に1行追記済）。
  //  2026-06-27実機確認: 会議の並列実負荷でFAILEDしやすい→ weightOf で reserve層(weight4)に格下げ済み。
  //  timeout はここで明示（nemotronは61秒成功実績があるため45秒では誤殺するので90秒、glm/kimiは60秒）。
  { label: 'cloudflare/nemotron-120b', provider: 'cloudflare', rawId: '', apiModel: '@cf/nvidia/nemotron-3-120b-a12b', opts: {}, timeoutMs: 90000, requires: ['CF', 'CF_ACC'] },
  { label: 'cloudflare/glm-5.2', provider: 'cloudflare', rawId: '', apiModel: '@cf/zai-org/glm-5.2', opts: {}, timeoutMs: 60000, requires: ['CF', 'CF_ACC'] },
  { label: 'cloudflare/kimi-k2.7-code', provider: 'cloudflare', rawId: '', apiModel: '@cf/moonshotai/kimi-k2.7-code', opts: {}, timeoutMs: 60000, requires: ['CF', 'CF_ACC'] },

  // 2026-07-04 追加: glm-5.2(不安定)の軽量flash版。並列実負荷での安定性トライアル中。
  // トライアル判定: QUALITY会議2回でFAILEDゼロ→glm-5.2を撤去して一本化。1回でもFAILEDなら本モデルを撤去。
  // 実IDは /ai/models/search で実機確認済み(@cf/zai-org/glm-4.7-flash)。単発疎通は200 OK確認済み。
  { label: 'cloudflare/glm-4.7-flash', provider: 'cloudflare', rawId: '', apiModel: '@cf/zai-org/glm-4.7-flash', opts: {}, timeoutMs: 60000, requires: ['CF', 'CF_ACC'] },

  { label: 'nvidia/qwen3.5-122b', provider: 'nvidia', rawId: '', apiModel: 'qwen/qwen3.5-122b-a10b', opts: { chat_template_kwargs: { thinking: false } }, requires: ['N'] },

  // 2026-07-14 追加: NIM無料枠の全121モデルを実機一覧取得→大型候補抽出→2並列200 OK裏取り
  // →会議諮問(慎重派/発散派の対立)→Fable設計で採用。詳細はmemory/council-llm-lineup-upgrade
  // 系ファイル参照。labelの"mistral-large"/"nemotron-3-ultra"/"deepseek-v4"の綴りが
  // roleOf/weightOfの判定に直結するので変更しないこと。
  //  - mistral-large-3-675b: 675B。会議のlead(統括)枠が従来local/gemma4(8B)頼みで
  //    全役割中最弱だった穴を埋める本命。roleOfでlead・weightOfは既存nvidiaルールでweight2。
  //  - nemotron-3-ultra-550b: 550BのNVIDIA自社大型。leadの2番手予備(weight3)。
  //  - deepseek-v4-pro: 実測5〜15秒とやや遅いが並列会議では律速にならない。criticの予備(weight3)。
  //    ※ nvidia/llama-3.1-nemotron-ultra-253b-v1 は404で現在アクセス不可・採用禁止。
  { label: 'nvidia/mistral-large-3-675b', provider: 'nvidia', rawId: '', apiModel: 'mistralai/mistral-large-3-675b-instruct-2512', opts: {}, timeoutMs: 90000, requires: ['N'] },
  { label: 'nvidia/nemotron-3-ultra-550b', provider: 'nvidia', rawId: '', apiModel: 'nvidia/nemotron-3-ultra-550b-a55b', opts: {}, timeoutMs: 90000, requires: ['N'] },
  { label: 'nvidia/deepseek-v4-pro', provider: 'nvidia', rawId: '', apiModel: 'deepseek-ai/deepseek-v4-pro', opts: {}, timeoutMs: 120000, requires: ['N'] },

  { label: 'gemini-2.5-flash', provider: 'gemini', rawId: 'gemini-2.5-flash', apiModel: 'gemini-2.5-flash', opts: {}, requires: ['E'] },

  // 2026-07-04 追加: 2026-06-25には429/503で常用不可だったが、今回の再検証で単発・4並列とも
  // 全て200 OKを確認。Google側の無料枠割当が時期変動していると解釈し、weightOfで予備(weight3)に
  // 留める。昇格基準: 7日以上空けた実会議2回でFAILEDゼロなら正規化。降格基準: 1回でも429/503が
  // 出たら即撤去。3-pro/3-flash-previewは今回も429継続 or 完全重複のため不採用（詳細は
  // memory/council-llm-lineup-upgrade-2026-07-03.md 参照）。
  { label: 'gemini-3.5-flash', provider: 'gemini', rawId: 'gemini-3.5-flash', apiModel: 'gemini-3.5-flash', opts: {}, requires: ['E'] },

  // OpenRouter は無料枠で 429 が出やすい=予備の1票(reference-free-cloud-llm-apis.md)。
  { label: 'openrouter/gpt-oss-120b', provider: 'openrouter', rawId: '', apiModel: 'openai/gpt-oss-120b:free', opts: { reasoning_effort: 'low' }, requires: ['O'] },
];
