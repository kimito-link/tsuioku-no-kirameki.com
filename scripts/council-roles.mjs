// @ts-check
/**
 * council-roles.mjs — 会議ハーネス共通の「役割・出力フォーマット・批判強制」定義。
 *
 * meeting.mjs（汎用会議）から読み込む。kimitolink-linktree 側にも同名の姉妹版があり、
 * あちらは UI/UX 特化（実装レビューが React/Tailwind 前提）。こちらは汎用版。
 * 役割の考え方・出力の型は両者で揃える（食い違い防止）。
 *
 * 設計の意図:
 *  - ローカル小型モデルは出力がブレやすい → 役割と型で縛ると合議の質が上がる。
 *  - 「批判担当」を明示し、最低1つ穴を指摘させる → 褒め合いで終わる会議を防ぐ。
 *  - 問い側が独自フォーマットを指定している場合はそちらを尊重する。
 */

/**
 * モデル名(または label)から役割キーを推定する。部分一致。
 * @param {string} name 例 "local/deepseek-r1:14b" / "groq/llama-3.3-70b" / "gemini-2.5-flash"
 * @returns {"critic"|"diverge"|"diverge-alt"|"implement"|"lead"|"fast"|"generalist"}
 */
export function roleOf(name) {
  const n = String(name).toLowerCase();
  // Claude/Opus は司令塔級の地頭 → 統括(lead)。会議の最終的な舵取りに最も効く。
  if (n.includes("claude") || n.includes("opus") || n.includes("sonnet")) return "lead";
  if (n.includes("deepseek-r1")) return "critic";
  // 2026-07-14 追加: NVIDIA NIM無料枠の超大型3体。実機2並列200 OK裏取り済み(会議諮問→Fable設計)。
  //  - deepseek-v4-pro: DeepSeek系。criticは既に層が厚いため予備(weight3)として批判枠の保険に。
  if (n.includes("deepseek-v4")) return "critic";
  // qwen3-32b は thinking 付き推論モデル → 批判(critic)。汎用 qwen3(発散)より先に判定する。
  if (n.includes("qwen3-32b") || n.includes("qwq")) return "critic";
  // GLM(5.2 等)は reasoning_content を別フィールドで返す強い推論モデル → 批判(critic)。
  // 2026-06-27 Cloudflare Workers AI 経由 glm-5.2 を実機確認の上で追加。
  if (n.includes("glm")) return "critic";
  // Kimi K2.7 Code 等のコード特化モデル → 実装(implement)。"code" は "coder" に一致しないため別途。
  if (n.includes("coder") || (n.includes("kimi") && n.includes("code"))) return "implement";
  // Groq compound(/-mini) は Web検索内蔵のエージェント型 → 汎用(generalist)。
  // fact カテゴリの「会議内で最新情報を取りに行く」担当。2026-07-01 ライブAPIで実在確認・2リポ同期。
  // gpt-oss 判定より先に置く（"compound" は "gpt-oss" に非一致だが、意図を明示するため上に）。
  if (n.includes("compound")) return "generalist";
  // gpt-oss-120b は批判主力级の最大クラウド → 批判(critic)。"gpt-oss" 判定より必ず前に置くこと
  // （if の先勝ちなので、順序を間違えると 120b も 20b と同じ diverge-alt に落ちてしまう）。
  // 2026-07-03 会議ハーネス設計で発覚: 従来はこの分岐が無く、gpt-oss-120b が diverge-alt 誤判定
  // されていたため、CATEGORIES のどの want にも登場せず実質不召集だった（設計バグ）。
  if (n.includes("gpt-oss-120b")) return "critic";
  // gpt-oss(20b・safeguard-20b 等) はローカル/クラウドの軽量別系統発散 → diverge-alt。
  if (n.includes("gpt-oss")) return "diverge-alt";
  if (n.includes("qwen3") || n.includes("qwen3.5")) return "diverge";
  if (n.includes("gemma4")) return "lead";
  // 2026-07-14 追加: 超大型は統括(lead)。会議のlead枠は従来local/gemma4(8B)頼みで
  // 全役割中最弱だった＝Fableとの能力ギャップが最大の箇所。ここに刺すのが本改修の本体。
  // nemotron-3-ultra-550bが正規(weight2)。
  // 2026-07-23 EOL: 当初正規採用していたmistral-large-3-675bはNVIDIA側で提供終了(410 Gone)
  // し council-lineup.mjs から撤去済み（rawIdが空だったため council-scout の健康診断が
  // 効かず発覚が8日遅れた教訓あり）。この判定行(mistral-large)は削除せず温存する——
  // LINEUPに該当labelが無ければ発火しない無害な行で、将来mistral-large-2系等を
  // 採用する際にそのまま効くため。
  // 注意: 素の"nemotron"では書かない（cloudflare/nemotron-120bは意図的にgeneralist=フォールスルー）。
  if (n.includes("mistral-large")) return "lead";
  if (n.includes("nemotron-3-ultra")) return "lead";
  // llama-4(scout/maverick) は軽快な新顔 → 速い視点。汎用 llama-3.3 と同枠。
  if (n.includes("llama-4") || n.includes("scout") || n.includes("maverick")) return "fast";
  if (n.includes("groq") || n.includes("llama-3.3")) return "fast";
  if (n.includes("gemini")) return "generalist";
  return "generalist";
}

/** 役割キー → 日本語の役割文(出力ラベル用)。 */
export const ROLE_LABEL = {
  critic: "批判・詰め（推論特化）",
  diverge: "発散アイデア（推論強）",
  "diverge-alt": "別系統の発散（OpenAI系オープン）",
  implement: "実装・実現性レビュー",
  lead: "総合・統括（最大モデル）",
  fast: "爆速の視点",
  generalist: "汎用",
};

/**
 * 役割キー → その役割にだけ刺さる system 追記文。
 * critic のみ 2026-07-04 会議品質向上設計で全面差し替え。旧版「穴を最低1つ」は
 * 浅い指摘1個で義務が満たされてしまう欠陥があった。新版は1回の生成の中で
 * 「擁護→初期評価→反証→修正指示」の4段を必須の出力順序として強制する。
 * 追加APIコールを伴わずに批判の深さを引き上げる（会議ハーネス自身への諮問で
 * 「モデルを増やす以外で質を上げる」打ち手として設計・採用）。
 * critic には DEFAULT_FORMAT を足さない（buildSystem 側で分岐。二重フォーマット指定は
 * 指示過多そのものであり、むしろ質を下げるという諮問結果を採用）。
 */
const ROLE_DIRECTIVE = {
  critic:
    "あなたの担当は『批判・詰め』です。賛成意見は不要。次の順で必ず書くこと:\n" +
    "(0)擁護: 対象の提案が最も正しく見える解釈を1文だけ書く（強い形を叩くため）。\n" +
    "(1)初期評価: それでも残る明白な弱点を具体的に指摘する。\n" +
    "(2)反証: 提案が暗黙に依拠している前提を1つ特定し、その前提が崩れる現実的な条件を示す。\n" +
    "(3)修正指示: (1)(2)を踏まえ、提案者が結論をどう変えるべきかを1〜2文で断定する。\n" +
    "最後に、指摘のうち最も重大な1つの行頭に【最重要】と印を付けること。印は必ず1つだけ。",
  diverge:
    "あなたの担当は『発散』です。無難案ではなく、他の人が思いつかない角度の案を出してください。" +
    "1つに絞らず、毛色の違う案を2つ以上出してかまいません。",
  "diverge-alt":
    "あなたの担当は『別系統の発散』です。多数派とは違う前提・違う切り口から提案してください。" +
    "ありがちな結論に流れそうなら、あえて逆張りの選択肢も1つ添えること。",
  implement:
    "あなたの担当は『実現性レビュー』です。実際に作れる/運用できるかを基準に、" +
    "手順・つまずきポイント・必要な前提まで踏み込んでください。",
  lead:
    "あなたの担当は『総合・統括』です。全体像を俯瞰し、優先順位を付けた一貫案を示してください。" +
    "あれもこれもではなく、何を捨てるかまで決めること。",
  fast: "あなたの担当は『速い視点』です。短く・要点だけ・実行可能な形で答えてください。",
  generalist: "幅広い観点から、実際に使える具体案を出してください。抽象論は避けること。",
};

/**
 * 問いが独自フォーマットを指定していないときに使う既定の出力型。
 * 2026-07-04 会議品質向上設計で「反論・リスク」「具体案」ブロックを強化。
 * 旧版は「別の正解の可能性を最低1つ」という緩い要求で検証可能性が無かった。
 * 新版は「自分が依拠する前提と、それが崩れる条件」を明示させ、具体案でその
 * 失敗シナリオへの対処を必ず含めさせる＝1回の生成の中で批判→修正が閉じる。
 * 見出しは4つのまま増やさない（digestOf・dedup・司令塔の読み取りが見出し依存のため）。
 */
export const DEFAULT_FORMAT =
  "回答は次の4ブロックの見出しを付けて、この順で書いてください:\n" +
  "## 結論（この問いへの答えを1〜2文で）\n" +
  "## 根拠（なぜそう言えるか）\n" +
  "## 反論・リスク（自分の案が失敗する最も現実的なシナリオを1つ。自分が依拠している前提と、それが崩れる条件を明示する）\n" +
  "## 具体案（実際に動く/作れる形で。上の失敗シナリオへの対処を必ず1つ含める）\n" +
  "見出しは4つのまま。増やさないこと。";

/**
 * 問い本文が既に出力フォーマットを指定しているかを雑に判定する。
 * @param {string} taskText
 */
export function taskSpecifiesFormat(taskText) {
  return /アウトプット|出力|この順で|フォーマット|出してほしい|箇条書き/.test(
    String(taskText)
  );
}

/**
 * 役割と(必要なら)既定フォーマットを足した system を組み立てる。
 * @param {object} opts
 * @param {string} [opts.baseSystem]    会議の土台 system（無くてもよい）
 * @param {string} opts.modelName       役割推定に使うモデル名/label
 * @param {string} [opts.taskText]      問い本文（フォーマット指定の有無判定用）
 * @param {boolean} [opts.addFormat]    既定フォーマットを足すか（既定 true・問いが指定済みなら自動 false）
 * @returns {{ system: string, role: string, roleLabel: string }}
 */
export function buildSystem({ baseSystem = "", modelName, taskText = "", addFormat = true }) {
  const key = roleOf(modelName);
  const directive = ROLE_DIRECTIVE[key];
  // critic は自前の(0)〜(3)構造が出力フォーマットそのもの。DEFAULT_FORMATの4ブロックを
  // 追加で強制すると二重フォーマット指定になり指示過多で質が下がる（2026-07-04設計の結論）。
  const wantFormat = addFormat && key !== "critic" && !taskSpecifiesFormat(taskText);
  const parts = [baseSystem, `【あなたの役割】${directive}`];
  if (wantFormat) parts.push(`【出力の型】\n${DEFAULT_FORMAT}`);
  return {
    system: parts.filter(Boolean).join("\n\n"),
    role: key,
    roleLabel: ROLE_LABEL[key],
  };
}

// ───────────────────────────────────────────────────────────────────────
// 動的ルーティング（2026-06-17 追加）
//
// 背景: 全お題に固定の全メンバーを並列起動していたため、重いローカル大物が
// 毎回タイムアウト脱落し、待ち時間と歩留まりが律速になっていた（実測 12体中4体落ち）。
// 対策: お題を1体で分類し、そのカテゴリに効く 3〜4体だけ召集する。賛否の役は残す。
// 退避弁: meeting.mjs 側で COUNCIL_FULL=1 を付ければ従来の全員集合に戻る。
// ───────────────────────────────────────────────────────────────────────

/**
 * お題のカテゴリ定義。
 *  - want   : このカテゴリで起こしたい役割キー（roleOf の戻り値）。優先順。
 *  - hint   : 分類が曖昧なとき人間が読んで意図を確認するための一言。
 * 「批判(critic)」は全カテゴリ共通で必ず1体入れる（褒め合い防止＝会議の核）。
 * @type {Record<string,{ want: string[], hint: string }>}
 */
export const CATEGORIES = {
  code:    { want: ["implement", "diverge", "fast"],   hint: "コード生成・実装・デバッグ・リファクタ" },
  design:  { want: ["lead", "diverge", "fast"],        hint: "設計判断・アーキテクチャ・技術選定・トレードオフ" },
  fact:    { want: ["generalist", "fast", "lead"],     hint: "事実調査・比較・最新情報・用語の意味" },
  writing: { want: ["lead", "diverge", "generalist"],  hint: "文章・コピー・要約・説明・命名" },
  // 2026-07-03 設計: diverge-alt を3番手に追加。従来は CATEGORIES のどの want にも
  // diverge-alt が登場せず、ローカル唯一の別系統発散(gpt-oss:20b)が死に役割だった。
  general: { want: ["lead", "diverge", "diverge-alt"],  hint: "上のどれにも当てはまらない一般的な相談" },
};

/** critic（批判役）は全カテゴリで必ず1体召集する。 */
export const ALWAYS_ROLES = ["critic"];

/**
 * 縮退運用の代替役割マップ（2026-07-03 追加）。
 * Ollama 停止時など、本来の役割プールが空のときにどの役割で代打を立てるかを定義する。
 * 順番に試し、最初にプールが見つかった役割で埋める。
 * @type {Record<string,string[]>}
 */
export const ROLE_FALLBACK = {
  implement: ["fast", "generalist"],
  lead: ["generalist", "fast"],
  diverge: ["diverge-alt", "generalist"],
  // 2026-07-04 追加: fast主力(llama-3.3-70b/llama-4-scout)が両方 TPD 枯渇/障害で
  // 全滅した最悪日でも、別プロバイダの generalist(gemini-2.5-flash) が代行する。
  fast: ["generalist"],
};

/**
 * メンバーの「重さ」を推定する。値が小さいほど速い＝優先。
 * 律速は重いローカル大物（毎回タイムアウト脱落するもの）なので、
 * 同じ役割ならクラウド/軽量ローカルを優先し、重いローカルは枠を絞る。
 * @param {string} label 例 "groq/llama-3.3-70b" / "local/deepseek-r1:14b"
 * @returns {number}
 */
export function weightOf(label) {
  const n = String(label).toLowerCase();
  if (!n.startsWith("local/")) {
    // 2026-07-14 追加: NIM超大型の予備層。CF勢(weight4・並列FAILED実績あり)より上、
    // 本線(weight1)とnvidia既存枠(weight2)より下。deepseekは実測5〜15秒と遅いが
    // 並列会議では律速にならないため遅さでの格下げはしない。
    if (n.includes("deepseek-v4")) return 3;
    // 実測で詰まりやすい不安定クラウドは後回し（同役割なら安定クラウドを先に選ぶ）。
    // nvidia/qwen3.5-122b は150秒タイムアウトが頻発(2026-06-17実測) → 重み2。
    // nemotron-3-ultra-550bも意図的にこの2を踏襲(2026-07-31・lead正規化に伴い予備weight3
    // から格上げ): NIM全体の「やや不安定枠」という2026-06-17実測の教訓を捨てないため、
    // 個別に軽い重みを与えない。leadにはcloud weight1が存在しないため、weight2でも
    // 事実上のlead主力になる（当初mistral-large-3-675bで採った理屈と同一。
    // そちらは2026-07-23にEOLし撤去済み・詳細はcouncil-lineup.mjsのコメント参照）。
    if (n.includes("nvidia") || n.includes("qwen3.5-122b")) return 2;
    // 2026-07-03/07-04 設計: 予備クラウド専用の reserve 層。同役割に安定勢(weight1)が
    // いる限り絶対に選ばれない（weight昇順ソートのため）。安定勢が不在/全滅した時だけ浮上する。
    //  - gpt-oss-20b: gpt-oss-120b(正規)の軽量予備。diverge-alt の穴埋め専任(下記参照)。
    //  - gemini-3系(3.5-flash等): 過去に429/503実績あり(2026-06-25)。2026-07-04再検証で
    //    安定を確認したが、preview/新顔ゆえ即正規化はせず予備に留める（昇格・降格基準は
    //    memory/council-llm-lineup-upgrade-2026-07-03.md 参照）。"gemini-3" は "gemini-2.5" に
    //    非一致（先頭一致ではなく部分一致だが "gemini-2.5-flash" に "gemini-3" は含まれない）。
    if (n.includes("gpt-oss-20b") || n.includes("gemini-3")) return 3;
    // openrouter は無料枠で429が出やすい実績→予備(weight3)。
    if (n.includes("openrouter")) return 3;
    // cloudflare 勢は会議の並列実負荷で FAILED しやすい実績(2026-06-27)→ reserve層(weight4)。
    // 同役割に安定勢(weight1〜3)がいる限り選ばれず、いなければ最後の砦として浮上する。
    if (n.includes("cloudflare")) return 4;
    return 1; // 安定クラウド（groq/gemini 本線）は速い
  }
  // ローカルは概ねサイズで遅さが決まる。実測で詰まりやすい順に重み付け。
  if (n.includes("deepseek-r1") || n.includes(":31b") || n.includes("gemma4:31b")) return 9; // 最重量(推論/大型)
  if (n.includes(":20b") || n.includes(":14b")) return 5; // 中量
  return 3; // 9b以下の軽量ローカル
}

/** ローカル最重量級（weight>=9）を1ラウンドに何体まで入れてよいか。 */
export const MAX_HEAVY_LOCAL = Number(process.env.COUNCIL_MAX_HEAVY) || 1;

/** 分類器に投げるプロンプトを組み立てる。出力は1語のJSONだけを期待。 */
export function classifyPrompt(taskText) {
  const cats = Object.entries(CATEGORIES)
    .map(([k, v]) => `- ${k}: ${v.hint}`)
    .join("\n");
  return (
    "次のお題を、下のカテゴリのどれか1つに分類してください。\n" +
    "説明は不要。JSONで {\"category\":\"<キー>\"} だけを出力すること。\n\n" +
    "【カテゴリ】\n" + cats + "\n\n" +
    "【お題】\n" + String(taskText).slice(0, 1200)
  );
}

/** 分類器の生出力から category キーを取り出す。拾えなければ general。 */
export function parseCategory(raw) {
  const text = String(raw || "");
  const m = text.match(/"category"\s*:\s*"([a-z]+)"/i);
  const got = (m && m[1] || "").toLowerCase();
  if (got && CATEGORIES[got]) return got;
  // JSONが壊れても、本文にカテゴリ名が素で出ていれば拾う
  for (const k of Object.keys(CATEGORIES)) {
    if (new RegExp("\\b" + k + "\\b", "i").test(text)) return k;
  }
  return "general";
}

/**
 * カテゴリと利用可能メンバー（label配列）から、召集するメンバー label を選ぶ。
 * want の役割を優先順に拾い、critic を必ず足す。最大 maxMembers 体。
 * 該当役がいなければ generalist/fast で穴埋めし、最低 2 体は確保する。
 * @param {string} category
 * @param {string[]} availableLabels  例 ["groq/llama-3.3-70b","local/qwen2.5-coder:14b",...]
 * @param {number} [maxMembers]
 * @returns {string[]} 召集する label の配列
 */
export function selectMembers(category, availableLabels, maxMembers = 4) {
  const cat = CATEGORIES[category] || CATEGORIES.general;
  const byRole = new Map(); // role -> [labels]（各役割内は軽い順にソート）
  for (const label of availableLabels) {
    const r = roleOf(label);
    if (!byRole.has(r)) byRole.set(r, []);
    byRole.get(r).push(label);
  }
  for (const pool of byRole.values()) pool.sort((a, b) => weightOf(a) - weightOf(b));

  const picked = [];
  let heavyCount = 0;
  const isHeavy = (l) => weightOf(l) >= 9;
  // role から1体取る。重いローカルが上限超過なら、その役割内の軽い代替を探す。
  // 戻り値: 実際に1体確保できたら true（ROLE_FALLBACK の呼び出し元で成否判定に使う）。
  const takeRole = (role) => {
    const pool = byRole.get(role);
    if (!pool || !pool.length) return false;
    let idx = 0;
    if (heavyCount >= MAX_HEAVY_LOCAL) {
      const light = pool.findIndex((l) => !isHeavy(l));
      idx = light >= 0 ? light : -1; // 軽い代替が無ければこの役割はスキップ
    }
    if (idx < 0) return false;
    const l = pool.splice(idx, 1)[0];
    if (l && !picked.includes(l)) {
      picked.push(l);
      if (isHeavy(l)) heavyCount++;
      return true;
    }
    return false;
  };
  // role から1体取る。プールが空/枯渇なら ROLE_FALLBACK の代替役割を順に試す（2026-07-03 追加）。
  // 主に Ollama 停止時など、本来の役割が丸ごと不在になる縮退運用のための救済。
  const takeRoleWithFallback = (role) => {
    if (takeRole(role)) return true;
    for (const alt of ROLE_FALLBACK[role] || []) {
      if (takeRole(alt)) return true;
    }
    return false;
  };
  // critic は必ず先に確保（重い deepseek しか居なければ1体だけ許容）
  for (const role of ALWAYS_ROLES) takeRole(role);
  for (const role of cat.want) {
    if (picked.length >= maxMembers) break;
    takeRoleWithFallback(role);
  }
  // 穴埋め: まだ枠があれば、軽い順・重いローカル上限を尊重して足す
  if (picked.length < Math.min(2, availableLabels.length)) {
    const rest = availableLabels
      .filter((l) => !picked.includes(l))
      .sort((a, b) => weightOf(a) - weightOf(b));
    for (const label of rest) {
      if (picked.length >= maxMembers) break;
      if (isHeavy(label) && heavyCount >= MAX_HEAVY_LOCAL) continue;
      picked.push(label);
      if (isHeavy(label)) heavyCount++;
    }
  }
  return picked.slice(0, Math.max(maxMembers, ALWAYS_ROLES.length));
}
