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
  if (n.includes("gpt-oss")) return "diverge-alt";
  if (n.includes("qwen3") || n.includes("qwen3.5")) return "diverge";
  if (n.includes("gemma4")) return "lead";
  // llama-4(scout/maverick) は軽快な新顔 → 速い視点。汎用 llama-3.3 と同枠。
  if (n.includes("llama-4") || n.includes("scout") || n.includes("maverick")) return "fast";
  if (n.includes("groq") || n.includes("llama-3.3") || n.includes("hermes")) return "fast";
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

/** 役割キー → その役割にだけ刺さる system 追記文。 */
const ROLE_DIRECTIVE = {
  critic:
    "あなたの担当は『批判・詰め』です。賛成意見は不要。" +
    "提案の穴・破綻・見落とし・リスクを最低1つ、必ず具体的に指摘してください。" +
    "指摘できない場合は『なぜ穴が無いと言えるか』を根拠付きで述べること。",
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

/** 問いが独自フォーマットを指定していないときに使う既定の出力型。 */
export const DEFAULT_FORMAT =
  "回答は次の4ブロックの見出しを付けて、この順で書いてください:\n" +
  "## 結論（この問いへの答えを1〜2文で）\n" +
  "## 根拠（なぜそう言えるか）\n" +
  "## 反論・リスク（自分の案の弱点や、別の正解の可能性を最低1つ）\n" +
  "## 具体案（実際に動く/作れる形で具体的に）";

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
  const wantFormat = addFormat && !taskSpecifiesFormat(taskText);
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
  general: { want: ["lead", "diverge", "fast"],        hint: "上のどれにも当てはまらない一般的な相談" },
};

/** critic（批判役）は全カテゴリで必ず1体召集する。 */
export const ALWAYS_ROLES = ["critic"];

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
    // 実測で詰まりやすい不安定クラウドは後回し（同役割なら安定クラウドを先に選ぶ）。
    // nvidia/qwen3.5-122b は150秒タイムアウトが頻発(2026-06-17実測) → 重み2。
    if (n.includes("nvidia") || n.includes("qwen3.5-122b")) return 2;
    return 1; // 安定クラウド（groq/gemini/openrouter）は速い
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
  const takeRole = (role) => {
    const pool = byRole.get(role);
    if (!pool || !pool.length) return;
    let idx = 0;
    if (heavyCount >= MAX_HEAVY_LOCAL) {
      const light = pool.findIndex((l) => !isHeavy(l));
      idx = light >= 0 ? light : -1; // 軽い代替が無ければこの役割はスキップ
    }
    if (idx < 0) return;
    const l = pool.splice(idx, 1)[0];
    if (l && !picked.includes(l)) {
      picked.push(l);
      if (isHeavy(l)) heavyCount++;
    }
  };
  // critic は必ず先に確保（重い deepseek しか居なければ1体だけ許容）
  for (const role of ALWAYS_ROLES) takeRole(role);
  for (const role of cat.want) {
    if (picked.length >= maxMembers) break;
    takeRole(role);
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
