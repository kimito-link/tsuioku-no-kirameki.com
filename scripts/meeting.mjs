#!/usr/bin/env node
/**
 * 会議ハーネス: 同じ問いを「無料クラウド4系統 + ローカル ollama 数体」に投げ、
 * 回答を集めて出力する。司令塔(Claude Code)が集約・裏取りする前提の素材集め用。
 *
 * 使い方:
 *   node scripts/meeting.mjs path/to/question.txt [--out path/to/answers.json]
 *   または node scripts/meeting.mjs --q "問い文字列"
 *
 * 2026-06-17 改修: 動的ルーティングを導入。
 *   既定では「お題を1体で分類 → そのカテゴリに効く 3〜4体だけ召集 → 批判役だけ
 *   他案を読んで1往復」する。重いローカル大物の常時起動を避け、待ち時間と歩留まりを改善。
 *   選抜は council-roles.mjs の weightOf で速度を考慮し、重いローカルは既定1体までに制限。
 *   退避弁:
 *     COUNCIL_FULL=1   … 従来どおり全メンバー召集（ルーティングを無効化）
 *     COUNCIL_AB=1     … 全員集合とルーティング選抜の両方を回して結果を並べる(新旧A/B)
 *     COUNCIL_ROLES=0  … 役割注入そのものを切る（素の問いだけ投げる従来動作）
 *     COUNCIL_MAX_HEAVY=N … 重いローカルを1ラウンドに何体まで入れるか（既定1）
 *
 * キーは User スコープ env から読む(setx 永続済)。呼ぶ側(PowerShell)が User スコープを
 * Set-Item で現プロセスに流し込んでから node を起動すること。
 *
 * 詳細・動くモデルと罠は memory/reference-free-cloud-llm-apis.md を参照。
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSystem, roleOf, ROLE_LABEL,
  classifyPrompt, parseCategory, selectMembers, CATEGORIES, weightOf,
} from './council-roles.mjs';

const args = process.argv.slice(2);
let question = '';
let outPath = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--q') question = args[++i] || '';
  else if (args[i] === '--out') outPath = args[++i] || '';
  else if (!question && args[i] && !args[i].startsWith('--')) question = readFileSync(args[i], 'utf8');
}
if (!question.trim()) {
  console.error('質問が空です。node scripts/meeting.mjs <file> か --q "..." を渡してください。');
  process.exit(1);
}

// ── 重いローカルの共有スロット（2026-06-22・並列対応へ方針転換）─────────────
// 方針: 能力重視で会議は何本でも並列に走らせてよい。ただし VRAM 12GB(RTX 4070 Ti) では
// deepseek-r1:14b≒10.3GB 級の「重いローカル」を2本同時に載せると、Ollama がロード↔アンロードを
// 往復(スワッシング)して最悪の固まりを生む。そこで「重いローカルだけ」を PC 全体で
// MAX_HEAVY_SLOTS 体までに制限する共有スロットを持つ。スロットが空いていなければ、その会議は
// 待たずに重いローカルを諦め、クラウドの強モデルへ自動で振り替える（後段の振り替えで使用）。
//   - 会議プロセスそのものは拒否しない（並列OK）。クラウドは VRAM 無関係なので無制限に並走できる。
//   - スロットはチャット/端末をまたいで共有（同じ Temp のファイル群で表現）。
//   - 退避弁: COUNCIL_MAX_HEAVY_SLOTS=N で同時許容数を変更（既定1）。0 で重いローカル全面禁止。
const HEAVY_DIR = join(tmpdir(), 'council-heavy-slots');
const MAX_HEAVY_SLOTS = Number(process.env.COUNCIL_MAX_HEAVY_SLOTS ?? 1);
const SLOT_STALE_MS = Number(process.env.COUNCIL_SLOT_STALE_MS) || 20 * 60 * 1000;
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
/** 現在有効な（生きていて陳腐でない）重いスロットの保持者数を数える。陳腐は掃除。 */
function countHeavySlots() {
  try {
    if (!existsSync(HEAVY_DIR)) { mkdirSync(HEAVY_DIR, { recursive: true }); return 0; }
    let n = 0;
    for (const f of readdirSync(HEAVY_DIR)) {
      const p = join(HEAVY_DIR, f);
      let info = {};
      try { info = JSON.parse(readFileSync(p, 'utf8')); } catch { /* 壊れ=陳腐 */ }
      const fresh = info.pid && pidAlive(info.pid) && (Date.now() - (info.at || 0) < SLOT_STALE_MS);
      if (fresh) n++; else { try { unlinkSync(p); } catch { /* 無視 */ } }
    }
    return n;
  } catch { return 0; }
}
let heavySlotPath = '';
/** 重いローカルを使ってよいか確保を試みる。確保できたら true（このプロセスがスロット保持）。 */
function tryAcquireHeavySlot() {
  if (MAX_HEAVY_SLOTS <= 0) return false;
  if (heavySlotPath) return true; // 既に保持
  if (countHeavySlots() >= MAX_HEAVY_SLOTS) return false; // 満杯 → 重いローカルは諦める
  try {
    mkdirSync(HEAVY_DIR, { recursive: true });
    const p = join(HEAVY_DIR, `slot-${process.pid}.json`);
    writeFileSync(p, JSON.stringify({ pid: process.pid, at: Date.now() }), 'utf8');
    heavySlotPath = p;
    return true;
  } catch { return false; }
}
function releaseHeavySlot() {
  if (!heavySlotPath) return;
  try { if (existsSync(heavySlotPath)) unlinkSync(heavySlotPath); } catch { /* 無視 */ }
  heavySlotPath = '';
}
process.on('exit', releaseHeavySlot);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { releaseHeavySlot(); process.exit(130); });
}

const ROLES_ON = process.env.COUNCIL_ROLES !== '0';
const FULL = process.env.COUNCIL_FULL === '1';
const AB = process.env.COUNCIL_AB === '1';
const FAST = process.env.COUNCIL_FAST === '1'; // 批判役もクラウドに回して最速化（深さより速度）
const MAX_MEMBERS = Number(process.env.COUNCIL_MAX_MEMBERS) || 4;

// ── 質向上スイッチ（2026-06-22 追加・既定は従来動作のまま＝全OFF相当）──────────
// いずれもエンジン（モデルの地頭）は変えず「議論の回し方」を改善する。副作用は時間増と
// 重いローカルの再呼び出しによるTOリスク増。デグレ時は env を外せば即・従来動作に戻る。
//   COUNCIL_QUALITY=1   … 下の4つをまとめてON（推奨プリセット）
//   COUNCIL_SAMPLES=N   … ④各メンバーをN回サンプリングし最長回答を採用（既定1=従来）
//   COUNCIL_CRITICS=N   … ③批判役を最大N体召集（既定1）。多視点で穴を拾う
//   COUNCIL_REVISE=1    … ①批判を受けて、指摘された側が2巡目で答えを修正する
//   COUNCIL_SYNTH=1     … ②統括(lead)役が全回答を読んで最後に1案へ統合する
const QUALITY = process.env.COUNCIL_QUALITY === '1';
const SAMPLES = Math.max(1, Number(process.env.COUNCIL_SAMPLES) || (QUALITY ? 2 : 1));
const CRITICS = Math.max(1, Number(process.env.COUNCIL_CRITICS) || (QUALITY ? 2 : 1));
const REVISE = process.env.COUNCIL_REVISE === '1' || QUALITY;
const SYNTH = process.env.COUNCIL_SYNTH === '1' || QUALITY;
// ②統合の出力指定（council-roles の DEFAULT_FORMAT と同じ4ブロックを短文で示す）。
const DEFAULT_FORMAT_HINT = '「結論／根拠／反論・リスク／具体案」';

const G = process.env.GROQ_API_KEY, N = process.env.NVIDIA_API_KEY, O = process.env.OPENROUTER_API_KEY, E = process.env.GEMINI_API_KEY;
// Cloudflare Workers AI（OpenAI互換）。トークン1つ＋アカウントID(公開情報)で叩ける無料枠。
// 2026-06-27 実機確認: glm-5.2 / nemotron-3-120b / kimi-k2.7-code が 200＋本文で返ることを裏取り済み。
const CF = process.env.CLOUDFLARE_API_TOKEN, CF_ACC = process.env.CLOUDFLARE_ACCOUNT_ID;
// OLLAMA_HOST は "0.0.0.0:11434" のようにスキームなしのことがある → 補う。127.0.0.1 で叩く。
let OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
if (!/^https?:\/\//.test(OLLAMA)) OLLAMA = 'http://' + OLLAMA;
OLLAMA = OLLAMA.replace('0.0.0.0', '127.0.0.1');

/** @typedef {{label:string, role:string, kind:string, run:(prompt:string, system?:string)=>Promise<string>}} Member */

/**
 * thinking 系モデル（qwen3.6-27b / qwen3-32b 等）が content に混ぜる <think>…</think> を除去する。
 * 司令塔Claudeの統合を汚さないため。閉じタグが無い片割れ（max_tokens切れ）も頭から本文を救う。
 * 2026-06-25 追加: Groq の qwen3.6-27b 実機で <think> 混入を確認したため。
 */
function stripThinking(text) {
  if (!text) return text;
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // 開きタグだけ残った場合（生成途中で切れた）は、最後の </think> 以降か、無ければ元のまま返す。
  if (/<think>/i.test(t)) {
    const close = t.lastIndexOf('</think>');
    t = close >= 0 ? t.slice(close + 8) : t.replace(/<think>[\s\S]*$/i, '');
  }
  return t.trim() || text.trim(); // 全部 think だった異常時は元を返す（空回答にしない）
}

/** OpenAI互換チャットを叩く。system 任意。 */
async function openaiChat(url, key, model, prompt, system = '', extra = {}, timeoutMs = 150000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
                            : [{ role: 'user', content: prompt }];
    const r = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages, max_tokens: 1600, temperature: 0.6, ...extra })
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('HTTP ' + r.status + ' ' + (j.error?.message || JSON.stringify(j).slice(0, 120)));
    const msg = j?.choices?.[0]?.message;
    const content = msg?.content || '';
    if (!content) throw new Error('empty content (reasoning_len=' + String(msg?.reasoning_content || msg?.reasoning || '').length + ')');
    return stripThinking(content);
  } finally { clearTimeout(timer); }
}

/** Gemini を叩く。system は systemInstruction で渡す。 */
async function geminiChat(model, prompt, system = '', timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.6 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${E}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('HTTP ' + r.status + ' ' + (j.error?.message || '').slice(0, 120));
    const t = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!t) throw new Error('empty');
    return t;
  } finally { clearTimeout(timer); }
}

/** Anthropic Messages API を叩く（OpenAI非互換: x-api-key / system別フィールド / content配列）。 */
async function anthropicChat(model, prompt, system = '', timeoutMs = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = { model, max_tokens: 1600, temperature: 0.6, messages: [{ role: 'user', content: prompt }] };
    if (system) body.system = system;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('HTTP ' + r.status + ' ' + (j.error?.message || JSON.stringify(j).slice(0, 120)));
    const t = (j?.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
    if (!t) throw new Error('empty content');
    return t;
  } finally { clearTimeout(timer); }
}

/** ollama /api/generate(stream:false)。spinner汚染を避けるため run でなく API。 */
async function ollamaChat(model, prompt, system = '', timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS) || 180000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body = {
      model, prompt, stream: false, think: false,
      options: { temperature: 0.6, num_predict: 1600 },
    };
    if (system) body.system = system;
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return (j.response || '').trim();
  } finally { clearTimeout(timer); }
}

/** 全候補メンバーを構築（このPC/キーで実際に呼べるものだけ）。 */
/** @type {Member[]} */
const allMembers = [];
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const NV = 'https://integrate.api.nvidia.com/v1/chat/completions';
const OR = 'https://openrouter.ai/api/v1/chat/completions';
// Cloudflare Workers AI の OpenAI 互換エンドポイント（アカウントIDをパスに含む）。
const CF_URL = CF_ACC ? `https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/ai/v1/chat/completions` : '';
// rawId = プロバイダ側の実モデルID（起動時ライブ実在チェックで /models と突き合わせる用。任意）。
// provider = 実在チェックのグループ（'groq'|'gemini' のみ検証対象。他は listing が無い/不安定なので素通し）。
const push = (label, kind, run, rawId = '', provider = '') =>
  allMembers.push({ label, role: roleOf(label), kind, run, rawId, provider });

if (G) push('groq/gpt-oss-120b', 'cloud', (p, s) => openaiChat(GROQ, G, 'openai/gpt-oss-120b', p, s, { reasoning_effort: 'low' }), 'openai/gpt-oss-120b', 'groq');
if (G) push('groq/llama-3.3-70b', 'cloud', (p, s) => openaiChat(GROQ, G, 'llama-3.3-70b-versatile', p, s), 'llama-3.3-70b-versatile', 'groq');
// 2026-06-22 追加（実機で応答確認済み・無料枠）:
//  - qwen3-32b: thinking付き推論モデル → 批判(critic)。ローカル deepseek の重さ無しで鋭い批判が出せる。
//  - llama-4-scout: 軽快な新顔 → 速い視点(fast)。
// ※ groq/kimi-k2 は同日プローブで access 無し（未開放/要申請）→ 不採用。
if (G) push('groq/qwen3-32b', 'cloud', (p, s) => openaiChat(GROQ, G, 'qwen/qwen3-32b', p, s), 'qwen/qwen3-32b', 'groq');
if (G) push('groq/llama-4-scout', 'cloud', (p, s) => openaiChat(GROQ, G, 'meta-llama/llama-4-scout-17b-16e-instruct', p, s), 'meta-llama/llama-4-scout-17b-16e-instruct', 'groq');
// 2026-07-01 追加（司令塔Claudeがライブ /models で実在裏取り）:
//  - groq/compound: Web検索を内蔵したエージェント型（Groq無料枠）。fact裏取りの「会議内で最新を取りに行く」担当。
//    エージェント型ゆえ通常チャットより遅い/長い → タイムアウトを広め(150s)に。役割は roleOf で generalist。
//  - groq/compound-mini: その速い版。軽い fact 確認向け。
//  ※ 同日、会議が推した "Mistral-7B-Instruct" / "Llama-3-8b-Instruct" は Groq のライブ一覧に無く【幻覚】→ 不採用。
if (G) push('groq/compound', 'cloud', (p, s) => openaiChat(GROQ, G, 'groq/compound', p, s, {}, 180000), 'groq/compound', 'groq');
if (G) push('groq/compound-mini', 'cloud', (p, s) => openaiChat(GROQ, G, 'groq/compound-mini', p, s, {}, 150000), 'groq/compound-mini', 'groq');
// 2026-06-25 追加（会議ハーネス自身で採否を合議→司令塔Claudeが実機裏取り）:
//  - qwen3.6-27b: Groq の新世代 thinking モデル。発散(diverge)。実機で <think>…</think>＋本文を返す
//    （strip後「東京」を確認済み）。openaiChat 側で <think> を除去するので本文だけが会議に乗る。
//  ※ 会議は「llama-3.3-70b-instant」を批判/速い視点に推したが【実在しない幻覚】。70Bは -versatile のみ。
//    8B級の -instant は llama-3.1-8b-instant だけ（実機で確認）。幻覚IDは採用しない。
if (G) push('groq/qwen3.6-27b', 'cloud', (p, s) => openaiChat(GROQ, G, 'qwen/qwen3.6-27b', p, s), 'qwen/qwen3.6-27b', 'groq');
// Cloudflare Workers AI（2026-06-27 実機で 200＋本文を裏取りして採用。X 一覧は鵜呑みにせず叩いて確認）。
//  - 採用基準: 会議に「無い能力」を足すものだけ。gpt-oss-120b / llama-3.3-70b は Groq 等で既出なので CF では足さない。
//  - nemotron-3-120b: どこにも無い大型の別頭脳 → 汎用(generalist)。/ai/models/search で実在確認済み。
//  - glm-5.2:        reasoning_content を別フィールドで返す強い推論 → 批判(critic)。content は既にクリーンなので stripThinking で十分。
//  - kimi-k2.7-code: コード特化 → 実装(implement)。
//  ※ いずれも openaiChat 流用可（OpenAI互換）。役割は council-roles の roleOf が label から自動付与（glm/kimi+code 用に1行追記済）。
if (CF && CF_ACC) push('cloudflare/nemotron-120b', 'cloud', (p, s) => openaiChat(CF_URL, CF, '@cf/nvidia/nemotron-3-120b-a12b', p, s));
if (CF && CF_ACC) push('cloudflare/glm-5.2', 'cloud', (p, s) => openaiChat(CF_URL, CF, '@cf/zai-org/glm-5.2', p, s));
if (CF && CF_ACC) push('cloudflare/kimi-k2.7-code', 'cloud', (p, s) => openaiChat(CF_URL, CF, '@cf/moonshotai/kimi-k2.7-code', p, s));
if (N) push('nvidia/qwen3.5-122b', 'cloud', (p, s) => openaiChat(NV, N, 'qwen/qwen3.5-122b-a10b', p, s, { chat_template_kwargs: { thinking: false } }));
if (E) push('gemini-2.5-flash', 'cloud', (p, s) => geminiChat('gemini-2.5-flash', p, s), 'gemini-2.5-flash', 'gemini');
// OpenRouter は無料枠で 429 が出やすい=予備の1票(reference-free-cloud-llm-apis.md)。
if (O) push('openrouter/gpt-oss-120b', 'cloud', (p, s) => openaiChat(OR, O, 'openai/gpt-oss-120b:free', p, s, { reasoning_effort: 'low' }));
// 司令塔 Claude(Opus 4.8) を会議の最強メンバー(統括/批判)として自動参加させる。
// 既定(プランB)は ANTHROPIC_API_KEY 無し＝このブロックは無効で、Claude はチャット側で手動統括する。
// キーを env に入れた日から自動で会議に降臨する（プランA・従量課金）。OpenAI 非互換なので専用 fetch。
const ANTHRO = process.env.ANTHROPIC_API_KEY;
const ANTHRO_MODEL = process.env.COUNCIL_CLAUDE_MODEL || 'claude-opus-4-8';
if (ANTHRO) push(`anthropic/${ANTHRO_MODEL}`, 'cloud', (p, s) => anthropicChat(ANTHRO_MODEL, p, s));
// ローカル(オフライン保険・別頭脳・無料無制限)。MEETING_LOCAL_MODELS=csv で上書き可。
const LOCAL_DEFAULT = [
  'gpt-oss:20b', 'qwen3.5:9b', 'qwen3:14b', 'deepseek-r1:14b',
  // gemma4:latest(8B) が「統括(lead)」のローカル担当。最終的な統括はチャットの Claude(Opus)が
  // 司令塔として担うため、ローカルに最重量の統括(旧 gemma4:31b≒19GB/weight9)は置かない。
  // 2026-06-22 会議ハーネスで採否を合議し、3視点一致＋実機応答確認の上で追加。
  // ※ glm-5.2:cloud は Ollama サブスク必須(無料は subscription エラー)のため不採用。
  // 2026-06-24 棚卸し: gemma4:31b(19GB/最重量・統括は latest+Opus で代替) と
  //   qwen2.5:14b(発散は qwen3/qwen3.5 の新版で代替・2ヶ月未使用) を削除し計28GB回収。
  'gemma4:latest', 'qwen2.5-coder:14b', 'hermes3:8b',
];
const localModels = (process.env.MEETING_LOCAL_MODELS || LOCAL_DEFAULT.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);
for (const m of localModels) {
  push(`local/${m}`, 'local', (p, s) => ollamaChat(m, p, s));
}

// ── 起動時ライブ実在チェック（2026-07-01 追加）────────────────────────────────
// 背景: HOWTO の最大の運用コストは「会議が幻覚モデル名を提案し、人間が毎回 /models で確認」。
//   実例2026-07-01: 会議は "Mistral-7B" / "Llama-3-8b" を Groq に足せと推したが両方とも実在せず。
// 対策: 起動時に検証可能プロバイダ(groq/gemini)の /models を1回だけ叩き、live 一覧に無い rawId の
//   クラウドメンバーを警告して除外する。listing の無い/不安定な CF・OpenRouter・NVIDIA は素通し。
//   ネットワーク不調で一覧が取れなかったプロバイダは「検証不能」として除外しない（会議は止めない）。
// 退避弁: COUNCIL_VERIFY_MODELS=0 で無効化（従来動作＝一切チェックしない）。
const VERIFY_MODELS = process.env.COUNCIL_VERIFY_MODELS !== '0';
/** groq/gemini の実在モデルID集合を取得。取れなければ null（=検証不能・除外しない）。 */
async function fetchLiveModelIds(provider) {
  try {
    if (provider === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': 'Bearer ' + G }, signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return new Set((j.data || []).map(m => m.id));
    }
    if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${E}`,
        { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return null;
      const j = await r.json();
      // name は "models/gemini-2.5-flash" 形式 → 末尾だけ取る。
      return new Set((j.models || []).map(m => String(m.name).replace(/^models\//, '')));
    }
  } catch { return null; }
  return null;
}
/** allMembers から、live 一覧に無い(=幻覚/廃止)クラウドメンバーを警告除去する。 */
async function verifyLiveModels() {
  if (!VERIFY_MODELS) return;
  const providers = [...new Set(allMembers.map(m => m.provider).filter(Boolean))];
  const live = new Map();
  await Promise.all(providers.map(async p => { live.set(p, await fetchLiveModelIds(p)); }));
  let removed = 0;
  for (let i = allMembers.length - 1; i >= 0; i--) {
    const m = allMembers[i];
    const set = m.provider && live.get(m.provider);
    if (!set) continue; // 検証不能 or 対象外 → 残す
    if (m.rawId && !set.has(m.rawId)) {
      console.error(`[実在チェック] ${m.label}（${m.rawId}）は ${m.provider} のライブ一覧に無い→除外（幻覚/廃止の可能性）`);
      allMembers.splice(i, 1);
      removed++;
    }
  }
  const okProviders = providers.filter(p => live.get(p));
  if (okProviders.length) {
    console.error(`[実在チェック] ${okProviders.join('/')} を照合。${removed ? removed + '体を除外' : '全メンバー実在OK'}`);
  }
}

/** あるメンバーに、役割注入込みの prompt/system を作って1回実行する。 */
async function askOnce(member, taskText, extraContext = '') {
  let system = '';
  if (ROLES_ON) {
    system = buildSystem({ modelName: member.label, taskText }).system;
  }
  const prompt = extraContext ? `${taskText}\n\n${extraContext}` : taskText;
  return member.run(prompt, system);
}

/**
 * ④ 2回サンプリング: SAMPLES回引いて「最も中身のある（最長の非空）」回答を採る。
 * 小型モデルは1発が外れて短いスタブを返すことがあるため、複数引いて良い方を使う。
 * SAMPLES=1（既定）なら従来どおり1回だけ。失敗(throw)は次の試行で取り返す。
 */
async function ask(member, taskText, extraContext = '') {
  if (SAMPLES <= 1) return askOnce(member, taskText, extraContext);
  const settled = await Promise.allSettled(
    Array.from({ length: SAMPLES }, () => askOnce(member, taskText, extraContext))
  );
  const oks = settled.filter(s => s.status === 'fulfilled' && (s.value || '').trim())
                     .map(s => s.value);
  if (!oks.length) {
    // 全滅なら最初の失敗を投げ直して runRound に error として拾わせる
    const firstErr = settled.find(s => s.status === 'rejected');
    throw (firstErr ? firstErr.reason : new Error('empty (all samples)'));
  }
  return oks.sort((a, b) => b.length - a.length)[0];
}

/** メンバー配列に並列で問い合わせ、結果配列を返す。 */
async function runRound(members, taskText, extraContextFor = null) {
  const settled = await Promise.allSettled(members.map(async m => {
    const s = Date.now();
    const extra = extraContextFor ? extraContextFor(m) : '';
    const answer = await ask(m, taskText, extra);
    return { label: m.label, role: m.role, ms: Date.now() - s, answer };
  }));
  return settled.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { label: members[i].label, role: members[i].role, ms: 0, answer: '', error: String(r.reason?.message || r.reason).slice(0, 200) });
}

/** 分類器: 最速の利用可能メンバー1体にカテゴリを聞く。失敗時は general。 */
async function classify(taskText) {
  const order = ['groq/llama-3.3-70b', 'gemini-2.5-flash', 'groq/gpt-oss-120b', 'local/qwen3.5:9b'];
  const classifier = order.map(l => allMembers.find(m => m.label === l)).find(Boolean) || allMembers[0];
  if (!classifier) return { category: 'general', by: '(none)', raw: '' };
  try {
    const raw = await classifier.run(classifyPrompt(taskText), '');
    return { category: parseCategory(raw), by: classifier.label, raw: raw.slice(0, 160) };
  } catch (e) {
    return { category: 'general', by: classifier.label + ' [FAILED]', raw: String(e?.message || e).slice(0, 120) };
  }
}

/** 結果配列を整形して標準出力へ。 */
function printResults(title, results) {
  console.log('\n' + '#'.repeat(72));
  console.log('# ' + title);
  console.log('#'.repeat(72));
  for (const r of results) {
    const role = ROLE_LABEL[r.role] || r.role || '';
    const tags = [r.rebutted && '反論', r.revised && '修正', r.synthesis && '統合'].filter(Boolean).join('+');
    console.log('\n' + '='.repeat(72));
    console.log(`### ${r.label}  [${role}]${tags ? '  〔' + tags + '〕' : ''}  (${r.ms}ms)${r.error ? '  [FAILED: ' + r.error + ']' : ''}`);
    console.log('='.repeat(72));
    console.log(r.answer || '(no answer)');
  }
}

// ── メイン ───────────────────────────────────────────────────────────────
const t0 = Date.now();
const record = { question, mode: '', category: '', classifier: '', rounds: {}, at: new Date().toISOString() };

if (!allMembers.length) {
  console.error('利用可能なメンバーが0体です。env キーと Ollama を確認してください。');
  process.exit(1);
}

// 幻覚/廃止モデルを起動時に自動除去（groq/gemini のみ・検証不能なら素通し・COUNCIL_VERIFY_MODELS=0で無効）。
await verifyLiveModels();
if (!allMembers.length) {
  console.error('実在チェック後に利用可能なメンバーが0体になりました。ネットワーク/キーを確認してください。');
  process.exit(1);
}

// ── 回答の重複排除（2026-07-01 追加・費用ゼロの質向上）──────────────────────
// 背景: 会議で別モデルが「ほぼ同一の回答」を出すことがある（実例 2026-07-01: groq/gpt-oss-120b と
//   groq/llama-3.3-70b が同一の表を出力）。多様性の死んだ重複に統合コストを払うのは無駄なので、
//   統合(SYNTH)・表示の前に近すぎる回答を1つへ畳む。畳んだ件数は必ずログに出す（黙って消さない）。
// 方針: エラー/統合(synthesis)/批判往復済みの重要行は畳まない。素の初回回答どうしだけを比較する。
//   類似は「正規化して単語集合の Jaccard」で測る。既定閾値0.82（保守的＝本当にそっくりな時だけ束ねる）。
// 退避弁: COUNCIL_DEDUP=0 で無効化（従来動作）。COUNCIL_DEDUP_THRESHOLD=0.9 等で厳しく/緩く。
const DEDUP_ON = process.env.COUNCIL_DEDUP !== '0';
const DEDUP_THRESHOLD = Math.min(1, Math.max(0.5, Number(process.env.COUNCIL_DEDUP_THRESHOLD) || 0.82));
/**
 * 回答テキストを「文字bigramの集合(Set)」にする。日本語は空白で区切られない＝単語split では
 * ほぼ一致せず類似度が過小評価される（実測: 単語splitだと near-dup でも 0.31 しか出ない）。
 * 文字bigram(シングル)なら日英どちらでも効き、near-dup が 0.9 台、別物が 0 近くと綺麗に分かれる
 * （2026-07-01 実データで検証）。空白・記号・全半角のゆれは正規化で吸収する。
 */
function tokenSet(text) {
  const norm = String(text || '')
    .toLowerCase()
    .normalize('NFKC')                 // 全角→半角など統一
    .replace(/[\s#>*`|:_\-—–・･。、,.()\[\]{}!?！？「」【】]/g, ''); // 空白・記号を除去
  const s = new Set();
  for (let i = 0; i < norm.length - 1; i++) s.add(norm.slice(i, i + 2));
  return s;
}
/** 2つの集合の Jaccard 類似度（0..1）。 */
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
/**
 * 近すぎる素の回答を畳む。畳まれた側は表示から外し、残す代表行に dupOf を記録してログ。
 * synthesis/error 行は対象外（重要なので常に残す）。長い回答を代表として残す。
 * @param {any[]} results
 * @param {string} label ログ用の会議ラベル
 * @returns {any[]} 表示・記録に使う配列（畳んだぶんは除去済み）
 */
function dedupResults(results, label) {
  if (!DEDUP_ON) return results;
  const eligible = results.filter(r => !r.error && !r.synthesis && (r.answer || '').trim());
  if (eligible.length < 2) return results;
  const sets = new Map(eligible.map(r => [r, tokenSet(r.answer)]));
  const dropped = new Set();
  const folds = []; // { keep, gone } ログ用
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    if (dropped.has(a)) continue;
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (dropped.has(b)) continue;
      if (jaccard(sets.get(a), sets.get(b)) >= DEDUP_THRESHOLD) {
        // 長い方(=中身が多い方)を代表として残し、短い方を畳む。
        const [keep, gone] = (a.answer.length >= b.answer.length) ? [a, b] : [b, a];
        dropped.add(gone);
        folds.push({ keep: keep.label, gone: gone.label });
        if (gone === a) break; // a 自体が畳まれたら以降の比較は無意味
      }
    }
  }
  if (!folds.length) return results;
  for (const f of folds) console.error(`[dedup] ${f.gone} は ${f.keep} とほぼ同一(≥${DEDUP_THRESHOLD})→統合前に畳む`);
  console.error(`[dedup] ${label}: ${folds.length}件を重複として畳んだ（残 ${results.length - dropped.size}/${results.length}）`);
  // 代表行に「畳んだ相手」を注記（記録に残す）。
  for (const f of folds) {
    const k = results.find(r => r.label === f.keep);
    if (k) k.dedupFolded = [...(k.dedupFolded || []), f.gone];
  }
  return results.filter(r => !dropped.has(r));
}

/** 結果配列を「■ ラベル（役割）の結論: …」のダイジェストに畳む（プロンプト同梱用）。 */
function digestOf(results, cap = 700) {
  return results.filter(r => !r.error && (r.answer || '').trim())
    .map(r => `■ ${r.label}（${ROLE_LABEL[r.role] || r.role}）:\n${(r.answer || '').slice(0, cap)}`)
    .join('\n\n');
}

/** 1ラウンド回して結果を出力・記録する共通処理。批判→（①修正）→（②統合）まで回す。 */
async function council(members, label, key) {
  console.error(`[${label}] ${members.length}体に問い合わせ中: ${members.map(m => m.label).join(', ')}`
    + (SAMPLES > 1 ? `（各${SAMPLES}回サンプリング）` : ''));
  const first = await runRound(members, question);

  // ③ 批判役（最大 CRITICS 体）が他メンバーの結論を読んで1往復（独立投票→討論の最小形）。
  const critics = members.filter(m => m.role === 'critic');
  const others = first.filter(r => !r.error && r.role !== 'critic');
  if (critics.length && others.length) {
    const digest = digestOf(others);
    const rebuttal = await runRound(critics, question, () =>
      `【他メンバーの回答（これらを読んで、最も危ういものを名指しで批判し、見落としを最低1つ挙げること）】\n${digest}`);
    for (const rb of rebuttal) {
      const idx = first.findIndex(r => r.label === rb.label);
      if (idx >= 0 && !rb.error) first[idx] = { ...rb, ms: first[idx].ms + rb.ms, rebutted: true };
    }

    // ① 反論を受けて2巡目: 批判された側（critic以外）が、批判を読んで自案を修正する。
    if (REVISE && others.length) {
      const critDigest = first.filter(r => r.role === 'critic' && !r.error && (r.answer || '').trim())
        .map(r => `■ 批判（${r.label}）:\n${(r.answer || '').slice(0, 1000)}`).join('\n\n');
      if (critDigest) {
        const revisers = members.filter(m => m.role !== 'critic'
          && first.some(r => r.label === m.label && !r.error));
        console.error(`[${label}] ①2巡目: ${revisers.length}体が批判を受けて修正`);
        const revised = await runRound(revisers, question, () =>
          `【あなたの先の回答への批判】\n${critDigest}\n\n` +
          `この批判を踏まえ、当たっている指摘は取り込んで自分の案を改訂してください。` +
          `的外れな批判には簡潔に反論してよい。最終形だけを出すこと。`);
        for (const rv of revised) {
          const idx = first.findIndex(r => r.label === rv.label);
          if (idx >= 0 && !rv.error) first[idx] = { ...rv, ms: first[idx].ms + rv.ms, rebutted: first[idx].rebutted, revised: true };
        }
      }
    }
  }

  // 回答dedup: 統合・表示の前に「ほぼ同一の素回答」を畳む（費用ゼロの質向上・黙って消さずログ）。
  let shown = dedupResults(first, label);

  // ② 統括(lead)が全回答を読んで1案へ統合する。lead不在なら最速の生存メンバーに代行させる。
  if (SYNTH) {
    let synth = members.find(m => m.role === 'lead' && shown.some(r => r.label === m.label && !r.error));
    if (!synth) synth = members.find(m => shown.some(r => r.label === m.label && !r.error));
    if (synth) {
      console.error(`[${label}] ②統合: ${synth.label} が1案に束ねる`);
      const all = digestOf(shown, 900); // 重複を畳んだ後の回答で統合（ノイズ・重複を統括に見せない）
      const sres = await runRound([{ ...synth, role: 'lead' }], question, () =>
        `【会議メンバー全員の回答（批判・修正済み）】\n${all}\n\n` +
        `あなたは統括役。上の議論を統合し、対立点はどちらを採るか理由付きで決め、` +
        `優先順位を付けた「最終1案」を ${DEFAULT_FORMAT_HINT} の形で示すこと。あれもこれもにしない。`);
      if (sres[0] && !sres[0].error) {
        shown.push({ ...sres[0], label: synth.label + ' [統合]', role: 'lead', ms: sres[0].ms, synthesis: true });
      }
    }
  }

  printResults(label, shown);
  record.rounds[key] = shown;
  const ok = shown.filter(r => !r.error).length;
  console.error(`--- [${label}] 成功 ${ok}/${shown.length} ---`);
  return shown;
}

/**
 * routedMembers 内の重いローカル member を、空きクラウドの強モデルに役割を保ったまま差し替える。
 * 空きクラウドが無ければ何もしない（重いローカルのまま＝固まりリスクは残るが会議は成立）。
 */
function swapToCloud(member, routedMembers, allMembers, reason) {
  const idx = routedMembers.indexOf(member);
  if (idx < 0) return;
  const usedLabels = new Set(routedMembers.map((m) => m.label));
  // 同役割で使える空きクラウドを優先、無ければ任意の空きクラウド（役割を引き継がせる）。
  const spare = allMembers.find((m) => m.kind === 'cloud' && m.role === member.role && !usedLabels.has(m.label))
             || allMembers.find((m) => m.kind === 'cloud' && !usedLabels.has(m.label));
  if (!spare) { console.error(`[振替] ${member.label} の代替クラウドが無く、そのまま残す（${reason}）`); return; }
  routedMembers.splice(idx, 1, { ...spare, role: member.role });
  console.error(`[振替] ${member.label} → ${spare.label}（${ROLE_LABEL[member.role]}・理由:${reason}）`);
}

if (FULL && !AB) {
  record.mode = 'full';
  await council(allMembers, '全員集合（COUNCIL_FULL）', 'full');
} else {
  const { category, by, raw } = await classify(question);
  record.mode = AB ? 'ab' : 'routed';
  record.category = category;
  record.classifier = by;
  console.error(`\n分類: category=${category}  by=${by}  (${CATEGORIES[category]?.hint || ''})`);
  if (raw) console.error(`  分類器の生出力: ${raw}`);

  const availableLabels = allMembers.map(m => m.label);
  const chosen = selectMembers(category, availableLabels, MAX_MEMBERS);
  const routedMembers = chosen.map(l => allMembers.find(m => m.label === l)).filter(Boolean);

  // COUNCIL_FAST: 批判役が重いローカル(local/)なら、空いている速いクラウドに批判役を兼任させる。
  // deepseek の深い批判より「速く一周する」ことを優先したいとき用。
  if (FAST) {
    const critic = routedMembers.find(m => m.role === 'critic');
    if (critic && critic.kind === 'local') {
      const spareCloud = allMembers.find(m => m.kind === 'cloud' && !routedMembers.includes(m));
      if (spareCloud) {
        routedMembers.splice(routedMembers.indexOf(critic), 1);
        // クラウドメンバーを「批判役」として一時上書き（role を critic に）。
        routedMembers.push({ ...spareCloud, role: 'critic' });
        console.error(`[FAST] 批判役を ${critic.label} → ${spareCloud.label} に差し替え（速度優先）`);
      }
    }
  }
  // 批判役の保証: モデル構成によっては critic が1体も召集されないことがある（例: deepseek を
  // ローカルから外した場合）。批判役は会議の核（褒め合い防止）なので、不在なら空いている
  // 安定クラウドを1体だけ批判役として立てる。クラウドも無ければ諦める（ローカルだけの構成）。
  if (!routedMembers.some(m => m.role === 'critic')) {
    const spare = allMembers.find(m => m.kind === 'cloud' && !routedMembers.includes(m))
               || allMembers.find(m => !routedMembers.includes(m));
    if (spare) {
      if (routedMembers.length >= MAX_MEMBERS) routedMembers.pop(); // 枠を1つ空ける
      routedMembers.push({ ...spare, role: 'critic' });
      console.error(`[補完] 批判役が不在のため ${spare.label} を批判役として追加`);
    } else {
      console.error('[警告] 批判役を立てられませんでした（褒め合い防止が働きません）');
    }
  }
  // ③ 批判役を CRITICS 体まで増やす（多視点で穴を拾う）。2体目は「違う頭脳」を狙って、
  // 既に居るメンバーと label が重複しない空きクラウドを critic として追加する。
  // ※ 重複判定は label で行う（補完ブロックが {...spare} のコピーを push するため、
  //   オブジェクト同一性 includes() では元メンバーを「未参加」と誤判定して同一モデルを二重召集する）。
  // 重いローカルは増やさない（TO悪化を避ける）。枠が満杯なら critic/lead 以外を1体落として空ける。
  while (CRITICS > 1 && routedMembers.filter(m => m.role === 'critic').length < CRITICS) {
    const usedLabels = new Set(routedMembers.map(m => m.label));
    const cand = allMembers.find(m => m.kind === 'cloud' && !usedLabels.has(m.label))
              || allMembers.find(m => m.kind !== 'local' && !usedLabels.has(m.label)); // ローカルは増やさない
    if (!cand) { console.error('[③多視点] 別頭脳の空きクラウドが無いため2体目の批判役は見送り'); break; }
    if (routedMembers.length >= MAX_MEMBERS) {
      const drop = routedMembers.findIndex(m => m.role !== 'critic' && m.role !== 'lead');
      if (drop < 0) break; // 落とせる枠が無い
      routedMembers.splice(drop, 1);
    }
    routedMembers.push({ ...cand, role: 'critic' });
    console.error(`[③多視点] 2体目の批判役として ${cand.label} を追加`);
  }
  // ── 重いローカルの共有スロット適用（並列で固まらせない最後の砦）──────────────
  // 召集メンバーに重いローカル(weight>=9 ≒ deepseek-r1/31b)が居る場合、PC全体のスロットを
  // 確保できたときだけ残す。確保できなければ（=別チャットの会議が既に重いローカルを使用中）、
  // その重いローカルを空きクラウドの強モデルに振り替える。これで2本目以降の会議が
  // VRAMを奪い合わず、能力はクラウド側で確保される。
  const isHeavyLocal = (m) => m.kind === 'local' && weightOf(m.label) >= 9;
  const heavies = routedMembers.filter(isHeavyLocal);
  if (heavies.length) {
    const gotSlot = tryAcquireHeavySlot();
    if (gotSlot) {
      // スロット確保成功。ただし複数の重いローカルが居るなら、1体だけ残して残りはクラウド化
      // （1スロット=重いローカル1体。VRAM 12GB に2体は載らない）。
      for (let i = 1; i < heavies.length; i++) swapToCloud(heavies[i], routedMembers, allMembers, '重いローカル過多');
      console.error(`[スロット] 重いローカル枠を確保（${heavies[0].label} をGPUで実行）`);
    } else {
      // スロット満杯。全ての重いローカルをクラウドへ振り替える。
      for (const h of heavies) swapToCloud(h, routedMembers, allMembers, 'GPUスロット満杯=並列の別会議が使用中');
      console.error('[スロット] 重いローカル枠が空かないため、重いローカルをクラウドに振り替え（固まり回避）');
    }
  }

  console.error(`召集 ${routedMembers.length}体（最大${MAX_MEMBERS}）: ${routedMembers.map(m => `${m.label}[${ROLE_LABEL[m.role]}]`).join(', ')}\n`);

  await council(routedMembers, `ルーティング選抜・${category}`, 'routed');

  if (AB) {
    console.error('\n[A/B] 比較のため全員集合も実行します...');
    await council(allMembers, '全員集合（A/B比較）', 'full');
  }
}

console.error(`\n=== 完了 ${Date.now() - t0}ms ===`);

if (outPath) {
  writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf8');
  console.error('保存: ' + outPath);
}
