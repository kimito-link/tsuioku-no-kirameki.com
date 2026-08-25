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
  // 2026-08-18 撤去（groq/llama-3.3-70b）: GroqがLlama系を一斉廃止し404（同日、分類器専任の
  //  llama-3.1-8b-instantも同時に死亡。meeting.mjs classify()の撤去コメント参照）。
  //  fast役のweight1主力だったため、死んだままLINEUPに残るとfast役プールの先頭に座り
  //  毎回選ばれて必ず失敗する「死に枠が席を先取りする」kimi-k2.7-code型の構造になる。
  //  verifyLiveModels（groqはカタログ照合対象）が起動時に除外するため平常時の実害は
  //  抑えられていたが、/modelsの取得に失敗した日はnull=素通しで死に枠が復活する
  //  （fail-open）ため、エントリ自体を撤去する。
  //  役割の穴: fast役の後継はlocal/qwen3.5:9b（VRAM100%格納・2回目以降2.0〜2.4秒・
  //  レート制限なしを実測して採用）。Ollama停止時はROLE_FALLBACK fast→["generalist"]
  //  （2026-07-04追加）が別プロバイダで代行する。
  //  roleOfの"llama-3.3"→fast判定行は温存（mistral-large行の前例。LINEUPに該当labelが
  //  無ければ発火しない無害な行で、Llama系が復活した際そのまま効く。同行の"groq"判定は
  //  groq新顔のフォールスルー受け皿として現役のため、行ごと消してはならない）。
  //  meeting.mjs ②統合のpriority配列からも同時に撤去した（cloudflare/glm-5.2撤去
  //  (2026-08-13)と同じ「findが永久に外れる死に要素」化を防ぐため）。

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
  //
  // 2026-08-16 撤去（上の2体・compound / compound-mini）: council/*.json 84件の実績解析で発覚。
  //   ★実績: compound は 9回召集され 9回とも HTTP 413 Request Entity Too Large で失敗（成功ゼロ）。
  //     compound-mini は1回召集され429。＝会議に呼ぶたびに必ず落ちる死に枠だった。
  //   ★413は入力サイズを絞っても避けられない: 本日の実機プローブで「あ」×1200字は200、
  //     一方 council に残る実問い1231字は413で再現した。compoundはWeb検索・エージェント展開を
  //     内部で行うため、実効リクエスト量が呼ぶ側から制御不能。「digestを渡さない配置」でも救えない。
  //   ★成功しても害がある: compound系のエラー原文が "Rate limit reached for model
  //     `openai/gpt-oss-120b` ... TPM: Limit 8000" ＝ compound を呼ぶこと自体が、批判役主力かつ
  //     統合役筆頭である gpt-oss-120b の分あたり8000トークンを食う（心臓の酸素を吸う枠だった）。
  //   ★存在理由が発火していない: 採用目的の fact カテゴリは84会議で0回（design 56 / code 16 /
  //     general 5 / writing 2）。「会議内で最新を取りに行く」担当として一度も出番が無かった。
  //   ★weight1のため4経路の先頭に座る地雷だった: weightOfのどの分岐にも掛からず既定1になるため、
  //     (a)generalistプールの先頭＝ROLE_FALLBACK(lead→generalist)が発動するたび必ず選ばれる
  //     （実際7月上旬のOllama停止時にこの経路で召集され413を量産した）、(b)敗者復活の候補
  //     (weightOf<=2)、(c)swapToCloudのanyCloud先頭圏、(d)2体目批判役のfail-open側。
  //   役割の穴: generalist は gemini-2.5-flash(weight1) が先頭に繰り上がり健全。
  //     fact カテゴリの want は generalist/fast/lead で、いずれも他メンバーが埋める。
  //   再採用の条件: 会議メンバーとしては永久に不適（長文の問いで413が本質的・TPMを
  //     gpt-oss-120bと共有）。使うなら classifierOnly と同型の「会議外・短文専用のfact確認
  //     ツール」として別枠で。目安は問い数百字以下で実測413ゼロを2回確認してから。
  //   roleOf の "compound"→generalist 判定行は削除しない（mistral-large行の前例に倣う。
  //     LINEUPに該当labelが無ければ発火しない無害な行）。

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
  // 2026-08-13: timeoutMs: 90000 を撤去し openaiChat の既定(150秒)に委ねる。
  //  実測(150秒制限で単発5回): 69592ms / 104469ms / 88884ms / 52025ms / 150秒超abort。
  //  ＝旧90秒制限では5回中2回がFAILED、うち1回(88884ms)は1.1秒差の薄氷だった。
  //  COUNCIL_QUALITY=1の実会議でも「[FAILED: This operation was aborted]」が実際に発生し、
  //  修正後の会議では103999msで成功＝旧制限なら確実に落ちていた回を拾えている。
  //  ただし150秒でも5回に1回は落ちる＝このモデルは本質的に不安定で、タイムアウト延長は
  //  「落ちる頻度を2/5から1/5に減らす」改善であって根治ではない（根治するならlead役の
  //  振替か、敗者復活の発動条件見直しが必要。本コミットの範囲外）。leadは会議で最も地頭の要る
  //  統括役であり、しかもmeeting.mjsの敗者復活は「有効回答が3体未満」でしか発動しないため、
  //  5体中leadだけが落ちた会議(有効4体)では何の救済も働かない＝最も重要な1票が無言で欠ける。
  //  90秒は既定150秒より厳しい自己制限であり、この縛りは自傷だった（他のNIMエントリは
  //  timeoutMs無指定で既定150秒に委ねている）。weightOfのNIM「やや不安定枠」(weight2)の
  //  扱いは従来どおり変更しない——遅さの評価と、遅い時に殺すかどうかは別の判断。
  { label: 'nvidia/nemotron-3-ultra-550b', provider: 'nvidia', rawId: 'nvidia/nemotron-3-ultra-550b-a55b', apiModel: 'nvidia/nemotron-3-ultra-550b-a55b', opts: {}, requires: ['N'] },
  // 2026-08-21 撤去（nvidia/deepseek-v4-pro・criticの予備weight3）:
  //   実疎通で HTTP 410 Gone。原文 "The model 'deepseek-ai/deepseek-v4-pro' has reached its
  //   end of life on 2026-08-07T09:00:00Z and is no longer available."
  //   ＝2026-08-07にEOL済み。NVIDIAカタログ(103件)にも不在で、残るのは deepseek-v4-flash-0731 のみ。
  //   ★14日間気づけなかった: council-scout が 2026-08-05 を最後に実行されていなかったため
  //     （scoutは手動起動で、HANDOFF設計にある "council:scout" npm script が未追加のまま。
  //      毎日の日課という当初設計が実運用では成立していない）。本コミットで npm script を足す。
  //   役割の穴: critic 5→4。予備は cloudflare/glm-4.7-flash・sambanova/deepseek-v3.1・
  //   mistral/magistral-small の3体が別プロバイダで残るため恒久ルール5(同役割の予備に
  //   同一プロバイダを重ね積みしない)を満たす＝後継の補充はしない。
  //   roleOf/weightOf の "deepseek" 判定行は削除しない（mistral-large行の前例に倣う。
  //   将来 deepseek 系を再採用したときそのまま効く無害な行のため）。

  // 2026-07-31 追加: NVIDIA lead正規(nemotron-3-ultra-550b)の別経路予備。OpenRouterの無料
  // モデル一覧(:freeサフィックス)に同一モデルが存在することを発見し、3並列200 OK(360/402/2140ms)
  // で裏取り済み。roleOfはlabelに"nemotron-3-ultra"を含むため自動でlead判定される。
  // 注意: labelに"nvidia"の文字列を含めないこと——weightOfの`n.includes("nvidia")`判定(weight2)
  // に誤爆し、NVIDIA本線と同格になってタイブレークがLINEUP順依存になってしまう。
  // weightOfは変更不要（既存のopenrouter判定でweight3が自動適用される。OpenRouterは429が
  // 出やすい実績があるため個別に軽い重みは与えない）。liveProbeは不要（OpenRouterの無料枠
  // 終了は「カタログから:freeスラッグが消える」形で現れることが本改修のopenrouter/gpt-oss-120b
  // 撤去で実証済みのため、カタログ照合で十分）。
  // 2026-08-13: 上のnvidia本線と同一モデル・同一理由で timeoutMs: 90000 を撤去（既定150秒へ）。
  //  こちらはlead予備だが、本線が落ちた日の代打がまた90秒で落ちては冗長化の意味がない。
  { label: 'openrouter/nemotron-3-ultra-550b', provider: 'openrouter', rawId: 'nvidia/nemotron-3-ultra-550b-a55b:free', apiModel: 'nvidia/nemotron-3-ultra-550b-a55b:free', opts: {}, requires: ['O'] },

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
  //  ★2026-08-25 追測: 5日連続失敗に伸びたが判定は変わらず撤去しない。同日の全7モデル実測で
  //   429が5体・200が2体（MiniMax-M2.7 / gemma-4-31B-it）＝キーは有効でカタログにも在籍。
  //   30秒あけて2回測っても同結果＝瞬間的なスパイクではないが、プロバイダ全体の容量枯渇である
  //   ことは変わらない。エラー文言は "high demand" から "Rate limit exceeded" に変わったが
  //   どちらも429で、200を返すモデルが同居する以上「このモデルの死」ではない。
  //   ※撤去推奨が日報に出るようになったが、これは liveProbe の連続失敗カウントによるもので、
  //     上の判別（他モデルも同時に落ちているか）を通していない。日報の推奨をそのまま実行しない。
  //  ★2026-08-21 liveProbe 3日連続失敗（08-19/20/21）だが撤去しない。判別の実測:
  //   同一キーで DeepSeek-V3.1 / V3.2 / Meta-Llama-3.3-70B がいずれも429 "is currently
  //   experiencing high demand" を返す一方、MiniMax-M2.7 は200で応答した。＝キーは生きて
  //   おり、カタログにも在籍し、特定モデルだけの死ではない＝無料枠の容量枯渇。
  //   「カタログに残ったまま呼べない」型のうち、402(有料化)=死 と 429(高需要)=一時的 を
  //   取り違えると生きているモデルを撤去してしまう。撤去の判断は必ず
  //   「同プロバイダの他モデルも同時に落ちているか」で切り分ける（全部429なら容量、
  //   1体だけなら本物の劣化）。streakは伸び続けるので警告自体は毎日出る——
  //   数字が増えたことは新情報ではない。
  //   なお MiniMax-M2.7 は下記コメントで「402で無料枠対象外」と記録しているが、本日は
  //   200で応答した＝SambaNovaの無料枠対象は時期で変わる。下の記述は当時の実測として
  //   残す（履歴を書き換えない）が、再検討する際は必ず再測定すること。
  { label: 'sambanova/deepseek-v3.1', provider: 'sambanova', rawId: 'DeepSeek-V3.1', apiModel: 'DeepSeek-V3.1', opts: {}, requires: ['SN'], liveProbe: true },
  //  2026-08-18 撤去（上のうち llama-3.3-70b）: 実測で使い物にならない——本日の検証6会議で
  //  召集4回すべて429、単発プローブも3回中3回429（"Meta-Llama-3.3-70B-Instruct-8k is
  //  currently experiencing high demand"）。さらに同日Groqが本線llama-3.3-70bを廃止（404）し、
  //  「groq単騎の穴を塞ぐ別経路」という本採用の主目的そのものが消滅した（経路の冗長化と
  //  頭脳の多様化は別物——死んだ本線の予備経路は冗長化ですらない）。
  //  残置の実害: fast後継local/qwen3.5:9bと同じweight3のため、タイブレーク（JSの安定ソート
  //  ＝allMembersのpush順で、LINEUPのクラウドはローカルより先）で本エントリが常にfast席を
  //  先取りし、毎会議429でFAILEDさせる——kimi-k2.7-code型の実害が確定する。撤去が唯一の
  //  「コードを足さない」解（weight格下げはweightOfに1ラベル専用分岐を足すことになる）。
  //  429は"high demand"文言で一時混雑の可能性も残るため恒久拒否はしない: nvidia/minimax-m3の
  //  前例に倣い、7日以上空けた再測定2回で2並列200 OKなら再検討可。ただしその時点でも
  //  fast席はレート制限の無いローカルで充足しており採用動機は弱い（健康であることと、
  //  会議に足りない頭脳であることは別）。deepseek-v3.1（critic予備）は無関係のため残す＝
  //  SNキーの配線・liveProbe運用は変わらない。

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

  // 2026-08-11 追加 → 2026-08-13 撤去（mistral/devstral-medium）: devstral-medium-latest → implementの予備。
  //  2026-07-31にcloudflare/kimi-k2.7-codeが有料化で撤去されて以来、implement役はローカル
  //  qwen2.5-coder:14b単騎（Ollama停止時はROLE_FALLBACKで代打）で、CATEGORIESのcodeカテゴリは
  //  want筆頭がimplementのためコード系のお題で毎回この穴を踏んでいた。roleOfがimplementを返す
  //  クラウドエントリはゼロであり、コード特化頭脳の追加はCF採用基準「会議に無い能力を足す
  //  ものだけ」に適合する（経路の冗長化でなく頭脳の追加）。2026-08-05の実機調査で
  //  200 OK・応答500〜790ms・2並列200 OK・カード登録不要を裏取り済み（上記Mistral採用コメントの
  //  6モデル一斉調査に含まれる）。roleOfに"devstral"→implementの判定行を追加済み
  //  （council-roles.mjs。"devstral"は"coder"にも"code"にも一致しないため）。weightOfは
  //  既存の"mistral"判定でweight3が自動適用（変更不要・実装前に現行コードで検証済み）。
  //  恒久ルール5との関係: Mistralはこれでlead予備・critic予備・implement予備の3役割に散るが、
  //  全て予備で同役割への重ね積みは無く条文適合。Mistralが死んだ日はlead/criticが予備1体ずつ
  //  減るだけ（leadはnvidia正規+openrouter予備、criticはgroq/glm/deepseek系が健在）で、
  //  implementは今日の構成（ローカル単騎+FALLBACK）に戻るだけ＝どの役割も採用前より悪化しない。
  //  優先順位の注意: implement役の競合はlocal/qwen2.5-coder:14b(weight5)のみのため、weight3の
  //  本モデルが事実上のimplement一番手になる（nemotron-3-ultraのlead weight2と同じ「予備の
  //  重みのまま事実上の主力」構図を意図的に受け入れる。LINEUP配列順はこのタイブレークに
  //  関与しない＝weight差で決まる）。ゆえに死んだ場合は「死に枠がimplement席を先取りして
  //  FAILEDさせる」kimi-k2.7-code型の実害が再現し得る——liveProbe:true必須はその検知線。
  //  devstral-small系は見送り: 小型コードモデルの席はローカルqwen2.5-coder:14bで充足しており
  //  「会議に無い能力」にならない。-latestエイリアスは既存Mistral 2体と同じ流儀。
  //  昇格: ルール3の基準(7日以上空けた実会議2回でFAILEDゼロ)を満たしても当面weight3据え置き
  //  （implement役内にweight1〜2の競合が居らず昇格の実益が無い。weightOfのプロバイダ一括判定の
  //  簡潔さを優先）。撤去: liveProbe2日連続失敗／実会議でimplement役として2回連続FAILED
  //  （kimi型実害の再発防止のため標準より厳しく）／カタログ消滅streak>=2 のいずれかで撤去会議へ。
  //  2026-08-13 撤去: 採用のわずか2日後、Mistral /v1/models の実測で devstral 全系列
  //  (devstral-medium-latest / devstral-2512 / devstral-latest / mistral-code-agent-latest)に
  //  deprecation: 2026-08-31T12:00:00Z が付いていることが判明（あと18日で確実に提供終了。
  //  公式ページにも deprecated 明記。無料提供は当初から期間限定と公式発表されており、
  //  採用時の裏取りで見落としていた）。上記コメントが自ら予告していた「死に枠がimplement席を
  //  先取りしてFAILEDさせるkimi-k2.7-code型の実害」が、今回は死亡日が事前に分かっている状態で
  //  確定していたため、liveProbeの事後検知(2日連続失敗)を待たず即日撤去し、下記の
  //  codestral-2508 に置き換えた。8/31まで併用する案は却下: 恒久ルール5（同役割の予備に
  //  同一プロバイダを重ね積みしない）に真正面から抵触する上、selectMembersはimplement席を
  //  1つしか取らずweight3同士のタイブレークは配列順のため、併用しても後継は一度も実会議に
  //  出られない（＝様子見の実益がゼロ）。撤去時点でdevstral自体はまだ動いていた
  //  （実測4並列4/4成功・ただし2968〜34890msと遅くバラつく）が、後継codestralが速度・安定性の
  //  実測で明確に上回るため、稼働期間を残して撤去することに損失は無い。
  //  この「期限が事前告知されて死ぬ」型は既知の死型5パターンのどれとも違う6番目の型で、
  //  唯一の事前検知可能な型。scout-models.mjs の deprecation 監視新設の直接の動機。

  // 2026-08-13 追加（devstral-mediumの後継・implementの予備）: codestral-2508。
  //  経緯は上記devstral撤去コメント参照。implement役「クラウド初のコード特化頭脳」枠を引き継ぐ。
  //  実測裏取り(2026-08-13): 4並列すべて200 OK(1207/1285/1359/1229ms)。実物のimplement役
  //  プロンプト(ROLE_DIRECTIVE+DEFAULT_FORMAT)での日本語実装レビューも200/10084〜12206ms/
  //  3052字/見出し4/4/日本語OK。同条件のdevstralは24110〜62601msだったため速度・安定性は改善。
  //  公式の位置づけは「FIM・低レイテンシのコード生成向け」でSWE-bench等の推論ベンチは非公開
  //  だが、この席の仕事はコードの自律編集ではなく『実現性レビュー』(council-roles.mjs
  //  ROLE_DIRECTIVE.implement)であり、その仕事そのものを実物プロンプトで測って合格している
  //  （別職務のベンチ非公開を理由に実測合格を却下しない）。chat/completionsは公式に対応
  //  エンドポイントとして明記＝想定外の使い方ではない。
  //  IDは固定のcodestral-2508を採用し-latestを使わない: devstralは-latestを使っていたのに
  //  中身に期限が付いていた＝エイリアスは死を防がない。一方で無通知の中身差し替わりにより
  //  「実測で裏取りした個体」と「実戦で走る個体」が食い違う害はエイリアス固有。固定IDが
  //  deprecatedになる時はdeprecationフィールド/カタログ差分として観測できる（scout側の
  //  期限監視とセットで-latestより厳密に安全）。mistral-code-latestというエイリアスは
  //  公式ドキュメント・価格ページ・changelogに記載の無い非公式名（出典は第三者のみ。
  //  "Mistral Code"は企業向け有料IDE製品名でもある）のため使用禁止。
  //  labelは必ず'mistral/codestral'とし'codestral'単体にしないこと——"codestral"は
  //  weightOfの"mistral"判定に非一致でweight1(安定クラウド本線)に誤爆し恒久ルール3違反に
  //  なることをmaster実コードで実行検証済み。roleOfに"codestral"→implementの判定行を追加
  //  （"codestral"は"coder"にも"devstral"にも"magistral"にも非一致。行が無いとgeneralist
  //  落ちしimplement席がローカル単騎に戻ることも実行検証済み）。weightOfは既存の"mistral"
  //  判定でweight3が自動適用（変更不要）。
  //  価格ページ上はPremier(有料)ティア表記だが実機では無料枠キーで呼べている＝
  //  「カタログに残ったまま呼べなくなる」型で死に得るため liveProbe:true 必須。
  //  公式が指定するdevstralの代替 mistral-medium-3-5 は不採用: 実測4並列で成功1/4
  //  (200×1・503×3)、単発の軽いプローブでも3回中2回503、実物のimplement役プロンプトでは
  //  503で回答取得不能。恒久ルール2(実機2並列以上の200 OK)を満たさない。gemini-3.5-flashの
  //  前例(2026-06-25見送り→07-04再検証で採用)に倣い恒久拒否はしない——7日以上空けた
  //  2回の再測定で2並列200 OKかつ503ゼロなら再検討可。ただし同モデルはroleOf上generalistで
  //  implementの穴を埋めず、健康でも採用動機が弱い。
  //  2026-08-16 再測定1回目: 4並列で4/4成功(1487〜2242ms・503ゼロ)。08-13の1/4から回復した
  //  ＝503は恒久的な不調ではなく時期変動だった（gemini-3.5-flashと同じパターン）。ただし
  //  再検討条件「7日以上空けた2回」に対し本日は3日後の1回目のため基準未達で、採用はしない。
  //  次の測定は2026-08-20以降（08-13から7日）。そこで2回目も2並列200 OK・503ゼロなら
  //  条件充足だが、その時点でも「roleOf上generalistでimplementの穴を埋めない＝採用動機が弱い」
  //  という上記の評価は変わらない点に注意（健康であることと、会議に足りない頭脳であることは別）。
  //  なおscoutの新着候補にmistral-medium系のエイリアス(mistral-medium/-3-5/-3.5/-3等)が
  //  毎日並ぶのは正常な挙動: alias展開は「採用中モデルの別名」を候補から除く機能であり、
  //  未採用モデルのエイリアス群は対象外（採用すれば自動的に候補から消える）。
  //  昇格: devstral同様、当面weight3据え置き（implement役内にweight1〜2の競合が居らず
  //  昇格の実益が無い）。撤去: devstralの条件を引き継ぎ標準より厳しく——liveProbe2日連続失敗／
  //  実会議でimplement役として2回連続FAILED／カタログ消滅streak>=2／deprecation付与を検知、
  //  のいずれかで撤去会議へ。
  { label: 'mistral/codestral', provider: 'mistral', rawId: 'codestral-2508', apiModel: 'codestral-2508', opts: {}, requires: ['MI'], liveProbe: true },

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

  // 2026-08-13 全プロバイダ探索の記録（devstral撤去→codestral採用と同日）: 採用ゼロで確定。
  //  サブエージェント報告を司令塔が全数叩き直した結果、以下4候補すべて見送り。
  //  - mistral/zai-glm-5-2 (aliases: glm-5-2): /v1/modelsに実在・deprecationなし・
  //    4並列200 OK(2642〜5421ms)・通常contentで返る(glm-4.7-flash型の特殊対応不要)と
  //    健康体だが、roleOfの"glm"判定でcriticになり、critic予備には既にmistral/
  //    magistral-small(同一プロバイダ・weight3)が居るため恒久ルール5に真正面から抵触。
  //    magistral-smallとの入替も却下: magistralの採用価値は速度でなく「critic予備で唯一の
  //    非DeepSeek系譜」（同エントリのコメント参照）であり、GLM系譜は既にcloudflare/
  //    glm-4.7-flashがcritic正席に居る。入替はMistral推論系譜を失いGLM系譜を重複させる
  //    ＝批判の視点多様性の純減。速度差はweightOfの既定方針（並列会議では律速に
  //    ならないため遅さで格下げしない）により判断材料にしない。owned_by:mistralaiと
  //    表示され系譜自体に不確実性があるが、GLM系譜でも自社命名でも採用理由が立たない
  //    ためどちらとも裏取り不要と判断。criticは正1+予備4+ローカルの最厚役割で、
  //    selectMembersは毎会議critic1体しか取らず、6体目の実戦投入機会も事実上無い。
  //  - gemini-3.6-flash: 3並列200 OK(2735〜4041ms)だが応答8〜25字（max_tokens 200の
  //    簡易プロンプト）で実物プロンプト未検証。roleOf=generalist・weightOfは"gemini-3"
  //    判定でweight3となり、gemini-3.5-flash(同役割・同プロバイダ・weight3予備)との
  //    重ね積み＝恒久ルール5抵触。同一プロバイダの世代違いは経路も頭脳も増やさない
  //    （「経路の冗長化と頭脳の多様化は別物」のどちらでもない）。lead転用は実物
  //    プロンプト裏取り（codestral採用時の水準）を欠くため不可。再検討条件:
  //    gemini-3.5-flashが撤去基準(429/503)を踏んだ日の後継一番手として、実物プロンプト
  //    裏取りの上で「追加でなく入替」なら可。
  //  - openrouter経由 cohere/north-mini-code:free: 2並列200 OKだが10367/12248msと遅い。
  //    致命点はCohereトライアルキーの「商用利用不可」規約がOpenRouter経由の:freeに
  //    及ぶか未確認であること。本会議は業務判断に使うためライセンス未確認は
  //    fail-closedで採用不可（恒久ルール1「公式ドキュメントで確認してから触る」と
  //    同じ姿勢。公式一次情報で商用可が確認できたら再検討可）。性能面でも実装席は
  //    selectMembersが1つしか取らず、openrouter判定のweight3はmistral/codestralと
  //    同重み・配列順後置で一度も実会議に出られない＝採用の実益もゼロ。
  //  - nvidia/minimax-m3: サブエージェントは708〜816msでlead本命と推したが、司令塔の
  //    再測定で2並列0/2（両方429）。恒久ルール2（実機2並列以上の200 OK）不適合で採用不可。
  //    gemini-3.5-flashの前例（2026-06-25見送り→07-04再検証で採用）に倣い恒久拒否は
  //    しない: 7日以上空けた再測定で2並列200 OKならlead予備候補として再検討可。
  //    leadは今も最弱役割のため、健康でありさえすれば採用動機がある唯一の候補。
  //  lead上限問題は本探索では未解決（nemotron-3-super-120bも31秒で実用外）。lead正規は
  //  nvidia/nemotron-3-ultra-550bのまま変更なし。
  //  教訓: サブエージェントの実測報告は今回、1件が10倍超の乖離（610ms報告→実測10秒台）、
  //  1件が生死逆（lead本命と推薦→実測429×2）だった。実測数値は司令塔の叩き直しを経ない
  //  限り採否の根拠にしない（「会議は素材であって結論ではない」の計測版）。
];
