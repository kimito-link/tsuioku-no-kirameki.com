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
 *   provider:  'groq' | 'gemini' | 'nvidia' | 'cloudflare' | 'openrouter' | 'sambanova' | 'mistral' | 'anthropic'
 *              実在チェック(verifyLiveModels)の対象グループは 'groq'|'gemini' のみ。
 *   rawId:     プロバイダ側の実モデルID（起動時ライブ実在チェックで /models と突合する用。
 *              空文字なら実在チェック対象外＝素通し）。
 *   apiModel:  実際にAPIへ渡すモデル文字列（rawIdと異なる場合があるため別フィールド。
 *              例: groq/compound は rawId も apiModel も 'groq/compound' で同一）。
 *   opts:      openaiChat/geminiChat への追加パラメータ（reasoning_effort 等）。
 *   timeoutMs: 個別タイムアウト（省略時は各 xxxChat の既定値）。
 *   requires:  このエントリを有効化するのに必要な env キー名の配列（'G'|'N'|'O'|'E'|'CF'|'CF_ACC'|'SN'|'MI'）。
 *              meeting.mjs 側で解決済みの真偽フラグと突き合わせて if 判定する。
 *   liveProbe: true なら council-scout が毎日実疎通(chat/completions 1発)を確認する
 *              （2026-07-31追加）。カタログ照合(rawId)では「一覧に存在するが実際は呼べない」
 *              劣化（例: 有料プラン専用化）を検知できないため、その種の事象が実証された
 *              プロバイダにだけ付ける。省略時はfalse相当（カタログ照合のみ）。
 *
 * 【rawIdを空にする場合の必須ルール】(2026-07-31追記):
 * rawId空＝council-scoutのカタログ照合(健康診断)から丸ごと除外される。2026-07-31時点で
 * 17体中9体(53%)がrawId空になっており、その間にnvidia/mistral-large-3-675bのEOL消滅を
 * 8日間検知できなかった実害が出た。今後rawIdを空にする場合は、(a)エントリコメントに
 * 理由を書く、(b)liveProbe:trueで代替監視を付ける、のどちらかを必須とする。
 *
 * 【新規プロバイダ追加時の基本姿勢】(2026-07-31追記・SambaNova採用を機に制定):
 * 1. カード登録不要の無料枠であることを公式ドキュメントで確認してから触る。
 * 2. 実機で2並列以上の200 OKを裏取りしてから採用会議へ（カタログ実在≠呼べる、はglm-5.2で実証済み）。
 * 3. 新規プロバイダのモデルは必ず予備(weight3以上)から入れる。主力(weight1〜2)には最低でも
 *    「7日以上空けた実会議2回でFAILEDゼロ」（gemini-3.5-flash昇格基準の流用）を経ずに置かない。
 * 4. rawId必須（既存ルール）。加えて「カタログに残ったまま課金要求で死ぬ」型があり得る
 *    プロバイダ（プラン自動適用型＝SambaNova・Cloudflare）はliveProbe:true必須。
 *    カタログから消える型（Groq・OpenRouter・NIM）はカタログ照合のみでよい。
 * 5. 同役割の予備に同一プロバイダを重ね積みしない（そのプロバイダが死んだ日に予備が
 *    まとめて消え、冗長化の意味が1体分しかなくなるため）。異なる役割への同一プロバイダ
 *    配置は、両方が予備である限り許容する。
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
  //  ※ いずれも openaiChat 流用可（OpenAI互換）。役割は council-roles の roleOf が label から自動付与。
  //  2026-06-27実機確認: 会議の並列実負荷でFAILEDしやすい→ weightOf で reserve層(weight4)に格下げ済み。
  //  timeout はここで明示（nemotronは61秒成功実績があるため45秒では誤殺するので90秒）。
  //  2026-07-31: rawIdをapiModelと同値で埋めた（従来空だったため健康診断の対象外になっていた）。
  //  CFの/ai/models/searchは実測で毎日安定取得できており、素通しにする理由が既に消えている。
  //  liveProbe:true も付与（下記glm-5.2/kimi-k2.7-codeの有料化発覚を受け、カタログ照合だけでは
  //  検知できない「一覧に存在するが無料枠では呼べない」劣化を実疎通で毎日確認する）。
  { label: 'cloudflare/nemotron-120b', provider: 'cloudflare', rawId: '@cf/nvidia/nemotron-3-120b-a12b', apiModel: '@cf/nvidia/nemotron-3-120b-a12b', opts: {}, timeoutMs: 90000, requires: ['CF', 'CF_ACC'], liveProbe: true },

  // 2026-06-27 追加 → 2026-07-31 撤去（cloudflare/glm-5.2, cloudflare/kimi-k2.7-code）:
  //   実機でCloudflare Workers AI /ai/v1/chat/completions を叩いたところ両モデルとも
  //   "AiError: Model is not available on the Workers Free plan: This model requires a
  //   Workers Paid plan." で401/403。モデルカタログ(/ai/models/search)には今も両方
  //   載っており、rawId空(=健康診断対象外)だったためcouncil-scoutは「消滅疑いなし」と
  //   誤診断し続けていた。カタログ照合では原理的に検知不可能な劣化パターン（有料プラン
  //   専用化）であり、これがliveProbe機構(上記)を新設した直接の動機。
  //   役割の穴: glm-5.2(critic)は同役割・同プロバイダの glm-4.7-flash が無料枠で稼働中
  //   →実質的な後退なし。kimi-k2.7-code(implement)はローカルqwen2.5-coder:14bのみが残るが、
  //   weightOfでCF勢(weight4)がローカル(weight5)より軽く扱われていたため、撤去前は
  //   codeカテゴリのimplement枠を死んだkimiが毎回先取りしFAILEDさせていた（現在進行形の実害）。
  //   Ollama停止時はROLE_FALLBACK(implement→fast→generalist)が代打するため会議は成立する。
  //   復活検知は不可: 撤去後もCFカタログに残り続けるため、差分ベースのscoutは二度と
  //   「新着候補」として拾わない。無料化に気づいたら `node scripts/scout-models.mjs
  //   --probe-only @cf/zai-org/glm-5.2 --provider cloudflare` 等で手動裏取りしてから再採用会議へ。

  // 2026-07-04 追加: glm-5.2(不安定)の軽量flash版。並列実負荷での安定性トライアル中。
  // トライアル判定: QUALITY会議2回でFAILEDゼロ→glm-5.2を撤去して一本化。1回でもFAILEDなら本モデルを撤去。
  // 実IDは /ai/models/search で実機確認済み(@cf/zai-org/glm-4.7-flash)。単発疎通は200 OK確認済み。
  // 2026-07-31: glm-5.2が有料化により強制撤去されたため、このモデルがcritic役の一本に
  // 確定した（トライアル判定は事実上「合格」で終了）。rawId埋め＋liveProbe追加は上記と同じ理由。
  { label: 'cloudflare/glm-4.7-flash', provider: 'cloudflare', rawId: '@cf/zai-org/glm-4.7-flash', apiModel: '@cf/zai-org/glm-4.7-flash', opts: {}, timeoutMs: 60000, requires: ['CF', 'CF_ACC'], liveProbe: true },

  // 2026-06-?? 追加 → 2026-07-31 撤去（nvidia/qwen3.5-122b）:
  //   本改修でrawIdを空('')からapiModelと同値('qwen/qwen3.5-122b-a10b')に埋め、
  //   council-scoutの健康診断が初めて機能した結果、実行直後にカタログ不在を検知
  //   （adoptedHealthに`nvidia:qwen/qwen3.5-122b-a10b`のmissingStreak=1が記録された）。
  //   念のため実機で直接叩いて確認したところ HTTP 410 Gone（mistral-large-3-675bと
  //   同一のEOLパターン）。NIM現行モデル一覧(102件)にも不在。復活の見込みなし。
  //   役割の穴: diverge役はgroq/qwen3.6-27b・ローカルqwen3.5:9b/qwen3:14bが健在で
  //   問題なし。もともとweight2(NIM不安定枠)の予備的な位置づけだったため実害は小さい。
  //   rawId空のまま8日以上放置されていれば同じくmistral-large型の長期未検知になっていた
  //   （rawId全数埋めの効果を初回実行で即座に実証した事例として記録）。

  // 2026-07-14 追加 → 2026-07-23 EOL（nvidia/mistral-large-3-675b）:
  //   会議のlead(統括)枠が従来local/gemma4(8B)頼みで全役割中最弱だった穴を埋める本命として
  //   採用したが、NVIDIA側が2026-07-23T09:00:00Zに正式にEOL(提供終了)。実機で叩くと
  //   HTTP 410 "has reached its end of life ... and is no longer available"。NIMの現行
  //   モデル一覧からも完全に消滅済み(復活の見込みなし＝メンテ落ちでなく提供終了宣言のため)。
  //   rawIdが空だったため council-scout のカタログ照合が効かず、発覚が2026-07-31まで
  //   8日遅れた。これがrawId全数埋めルール(このファイル冒頭)を新設した最大の動機。
  //   lead役の後継: 同時に予備採用していた nemotron-3-ultra-550b を正規(weight2)に格上げ
  //   （council-roles.mjs weightOf 参照）。roleOfの"mistral-large"判定行は削除しない
  //   （mistral-large-2系など将来の同名系統モデル採用時にそのまま効く無害な行のため）。
  //  - nemotron-3-ultra-550b: 550BのNVIDIA自社大型。lead正規(weight2、2026-07-31格上げ)。
  //  - deepseek-v4-pro: 実測5〜15秒とやや遅いが並列会議では律速にならない。criticの予備(weight3)。
  //    ※ nvidia/llama-3.1-nemotron-ultra-253b-v1 は404で現在アクセス不可・採用禁止。
  //   2026-07-31: rawIdをapiModelと同値で埋めた（NVIDIA NIMのカタログ取得自体は毎日
  //   安定成功しているため、rawId空にしていたことに合理的理由が無かった）。
  { label: 'nvidia/nemotron-3-ultra-550b', provider: 'nvidia', rawId: 'nvidia/nemotron-3-ultra-550b-a55b', apiModel: 'nvidia/nemotron-3-ultra-550b-a55b', opts: {}, timeoutMs: 90000, requires: ['N'] },
  { label: 'nvidia/deepseek-v4-pro', provider: 'nvidia', rawId: 'deepseek-ai/deepseek-v4-pro', apiModel: 'deepseek-ai/deepseek-v4-pro', opts: {}, timeoutMs: 120000, requires: ['N'] },

  // 2026-07-31 追加: NVIDIA lead正規(nemotron-3-ultra-550b)の別経路予備。OpenRouterの無料
  // モデル一覧(:freeサフィックス)に同一モデルが存在することを発見し、3並列200 OK(360/402/2140ms)
  // で裏取り済み。roleOfはlabelに"nemotron-3-ultra"を含むため自動でlead判定される。
  // 注意: labelに"nvidia"の文字列を含めないこと——weightOfの`n.includes("nvidia")`判定(weight2)
  // に誤爆し、NVIDIA本線と同格になってタイブレークがLINEUP順依存になってしまう。
  // weightOfは変更不要（既存のopenrouter判定でweight3が自動適用される。OpenRouterは429が
  // 出やすい実績があるため個別に軽い重みは与えない）。liveProbeは不要（OpenRouterの無料枠
  // 終了は「カタログから:freeスラッグが消える」形で現れることが本改修のopenrouter/gpt-oss-120b
  // 撤去で実証済みのため、カタログ照合で十分）。
  { label: 'openrouter/nemotron-3-ultra-550b', provider: 'openrouter', rawId: 'nvidia/nemotron-3-ultra-550b-a55b:free', apiModel: 'nvidia/nemotron-3-ultra-550b-a55b:free', opts: {}, timeoutMs: 90000, requires: ['O'] },

  // 2026-07-31 追加: SambaNova Cloud（新規プロバイダ）。Free Tierは支払い方法未登録時に
  // 自動適用されカード登録不要（docs.sambanova.ai/docs/en/models/rate-limitsで確認済み）。
  // 会議ハーネス自身への諮問で「同一無料プロバイダへの二重依存」を懸念されたが、両エントリ
  // とも予備(weight3)のみで採用し、主力は一切置き換えない。SambaNovaが死んだ日に失うのは
  // 予備2枠だけで、会議は今日(2026-07-31)と同じ構成で成立する。
  //  - deepseek-v3.1: criticの予備。nvidia/deepseek-v4-proより後ろに置くこと必須
  //    （weight3同士のタイブレークはJSの安定ソート＝配列順で決まる。v4-proは稼働実績が
  //    あるため先、V3.1は実績ゼロのため後、という優先順位をこの並び順で表現している。
  //    並べ替え禁止）。実機2並列200 OK・600-900ms(2026-07-31)。
  //  - llama-3.3-70b: fastの予備。groq/llama-3.3-70bと完全同一モデルの別経路。
  //    2026-07-23にqwen3-32b/llama-4-scoutが撤去されて以来fastはgroq単騎（このファイル
  //    上部のコメント参照）で単一プロバイダ依存が明記されていた穴を塞ぐのが本採用の主目的。
  //    実機2並列200 OK・600ms(2026-07-31)。
  //  - gpt-oss-120b(SambaNova版)は見送り: 応答7〜14秒でgroq版に速度で明確に劣後し、
  //    criticの冗長化はdeepseek-v3.1で確保済みのため採用価値が薄い。
  //  - MiniMax-M2.7は無料枠対象外（402 "A payment method is required"）のため採用不可。
  //  両エントリとも liveProbe:true 必須: SambaNovaの規約は「カタログに残ったまま402で
  //  無料枠対象外になる」型（MiniMax-M2.7で実証済み）であり、これはcloudflare/glm-5.2の
  //  有料化と同一の、カタログ照合では原理的に検知不可能なパターンのため。
  { label: 'sambanova/deepseek-v3.1', provider: 'sambanova', rawId: 'DeepSeek-V3.1', apiModel: 'DeepSeek-V3.1', opts: {}, requires: ['SN'], liveProbe: true },
  { label: 'sambanova/llama-3.3-70b', provider: 'sambanova', rawId: 'Meta-Llama-3.3-70B-Instruct', apiModel: 'Meta-Llama-3.3-70B-Instruct', opts: {}, requires: ['SN'], liveProbe: true },

  // 2026-08-05 追加: Mistral AI（新規プロバイダ・フランス独立系）。La Plateformeの無料枠は
  // カード登録不要で、実機で /v1/models 200(chat系39体)＋chat/completions 6モデル全て200を
  // 裏取り済み（mistral-large/medium/magistral-small/small/devstral-medium/ministral-8b・
  // 応答500〜790ms）。2並列も200 OKで429なし。同日に調査したCerebrasが全モデル402
  // "payment required" で全滅したのとは対照的に、本当にカード無しで呼べることを確認した。
  //  採用の主目的は「学習系譜の多様化」。既存クラウド勢はGroq/SambaNova/OpenRouter/CFいずれも
  //  他社製モデル(llama/deepseek/nemotron/glm)を走らせるインフラ業者であり、経路を増やしても
  //  中身の頭脳が被る（openrouter/nemotron-3-ultraはnvidia本線と同一モデルの別経路）。Mistralは
  //  自社開発モデルを自社で提供する唯一のメンバーで、欧州の独立した学習系譜という点で会議に
  //  「無い頭」を足せる（このファイルのCF採用基準「会議に無い能力を足すものだけ」と同じ理屈）。
  //  - mistral-large-latest: leadの予備。roleOfの"mistral-large"判定行(council-roles.mjs)に
  //    そのまま乗る——同行は2026-07-23にnvidia/mistral-large-3-675bがEOLした際「将来
  //    mistral-large-2系等を採用する際にそのまま効く無害な行」として意図的に温存されたもので、
  //    今回その想定通りに再利用される（roleOfへの追加行は不要）。
  //    lead予備は既にopenrouter/nemotron-3-ultra-550bがあるが別プロバイダのため恒久ルール5
  //    （同役割の予備に同一プロバイダを重ね積みしない）に抵触しない。加えてopenrouter版は
  //    nvidia本線と中身が同一モデルであり、真に独立した頭脳のlead予備はこれが初。
  //  - magistral-small-latest: criticの予備。Mistral自社の推論特化モデル。実機で日本語の
  //    批判役プロンプト(system付き)に的確な指摘を返すことを確認済み。<think>タグも
  //    reasoning_contentも使わず通常のcontentで返すため、meeting.mjsのstripThinking/
  //    reasoning救済のどちらも不要（glm-4.7-flash型の特殊対応がいらない）。
  //    critic予備はnvidia/deepseek-v4-pro・sambanova/deepseek-v3.1と合わせて3体になるが、
  //    3体とも別プロバイダ（ルール5適合）。かつ前2体はどちらもDeepSeek系＝同一系譜であり、
  //    ここに非DeepSeek系の批判役が入ることで批判の視点自体が分散する。
  //  両エントリとも weightOf の n.includes("mistral") で予備(weight3)が自動適用される
  //  （council-roles.mjs・恒久ルール3「新規プロバイダは必ず予備から」）。昇格基準は
  //  gemini-3系/SambaNovaと同一（7日以上空けた実会議2回でFAILEDゼロ）。
  //  liveProbe:true 必須と判断: Mistralのダッシュボードは「0% used, Resets in 27 days」という
  //  月次クォータ表示を持つが、枯渇時に429で止まるのか課金に移るのかがAPI側から判別できない
  //  （Pay-As-You-Goは任意オプトインだが、無料枠内でのカタログ表示は変わらない見込み）。
  //  「カタログに残ったまま呼べなくなる」型に該当し得るため、SambaNova・CFと同じ扱いにする。
  //  labelに"large"を含むが weightOf に "large" 判定は無いため誤爆しない（"nvidia"を含めない
  //  のはopenrouter/nemotron採用時と同じ注意点。ここでは"mistral/"プレフィクスなので問題なし）。
  { label: 'mistral/mistral-large', provider: 'mistral', rawId: 'mistral-large-latest', apiModel: 'mistral-large-latest', opts: {}, requires: ['MI'], liveProbe: true },
  { label: 'mistral/magistral-small', provider: 'mistral', rawId: 'magistral-small-latest', apiModel: 'magistral-small-latest', opts: {}, requires: ['MI'], liveProbe: true },

  { label: 'gemini-2.5-flash', provider: 'gemini', rawId: 'gemini-2.5-flash', apiModel: 'gemini-2.5-flash', opts: {}, requires: ['E'] },

  // 2026-07-04 追加: 2026-06-25には429/503で常用不可だったが、今回の再検証で単発・4並列とも
  // 全て200 OKを確認。Google側の無料枠割当が時期変動していると解釈し、weightOfで予備(weight3)に
  // 留める。昇格基準: 7日以上空けた実会議2回でFAILEDゼロなら正規化。降格基準: 1回でも429/503が
  // 出たら即撤去。3-pro/3-flash-previewは今回も429継続 or 完全重複のため不採用（詳細は
  // memory/council-llm-lineup-upgrade-2026-07-03.md 参照）。
  { label: 'gemini-3.5-flash', provider: 'gemini', rawId: 'gemini-3.5-flash', apiModel: 'gemini-3.5-flash', opts: {}, requires: ['E'] },

  // 2026-06-?? 追加 → 2026-07-31 撤去（openrouter/gpt-oss-120b）:
  //   本改修でrawIdを空('')から'openai/gpt-oss-120b:free'に埋めた直後の初回実行で
  //   カタログ不在を検知（adoptedHealthにmissingStreak=1として記録）。実機で直接叩いて
  //   確認したところ HTTP 404、エラー本文:「This model is unavailable for free. The
  //   paid version is available now - use this slug instead: openai/gpt-oss-120b」。
  //   OpenRouterが120bの無料枠提供を終了し、20b版のみ無料枠に残す方針に変更した模様
  //   （実際 /models 一覧には 'openai/gpt-oss-20b:free' は存在する）。
  //   役割の穴: このエントリは元々「予備の1票」（コメント参照）。critic役はgroq勢+
  //   nvidia/deepseek-v4-proが健在で実害なし。gpt-oss-20b:freeへの乗り換えは今回は
  //   見送り（groq/gpt-oss-20bと役割・系統が重複するため採用価値が薄い。未検証）。
];
