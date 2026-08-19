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
import { LINEUP } from './council-lineup.mjs';

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

// ── 質向上スイッチ（2026-06-22 追加・既定は従来動作のまま＝全OFF相当）──────────
// いずれもエンジン（モデルの地頭）は変えず「議論の回し方」を改善する。副作用は時間増と
// 重いローカルの再呼び出しによるTOリスク増。デグレ時は env を外せば即・従来動作に戻る。
//   COUNCIL_QUALITY=1   … 下の4つをまとめてON（推奨プリセット）
//   COUNCIL_SAMPLES=N   … ④各メンバーをN回サンプリングし最長回答を採用（既定1=従来）
//   COUNCIL_CRITICS=N   … ③批判役を最大N体召集（既定1）。多視点で穴を拾う
//   COUNCIL_REVISE=1    … ①批判を受けて、指摘された側が2巡目で答えを修正する
//   COUNCIL_SYNTH=1     … ②統括(lead)役が全回答を読んで最後に1案へ統合する
// 2026-07-04 会議品質向上設計: SAMPLES は「回数で稼ぐ」施策で費用対効果が低いと判定し、
// QUALITY時の既定を2→1に変更（諮問結果: 冗長サンプリングより1発で深い出力を狙う方が
// TPD/レート制限下で効率的）。明示指定 COUNCIL_SAMPLES=N は退避弁として存続。
const QUALITY = process.env.COUNCIL_QUALITY === '1';
const SAMPLES = Math.max(1, Number(process.env.COUNCIL_SAMPLES) || 1);
const CRITICS = Math.max(1, Number(process.env.COUNCIL_CRITICS) || (QUALITY ? 2 : 1));
const REVISE = process.env.COUNCIL_REVISE === '1' || QUALITY;
// 2026-08-16: SYNTH(②統合)を既定ONに反転（退避弁 COUNCIL_SYNTH=0 で従来動作）。
//  根拠: 統合は「全員の回答を1案に束ねる」会議の最終成果物であり、+1コールで得られる
//  費用対効果が最も高い。従来は QUALITY を明示した会議でしか走らず、84件の実績では
//  30件がQUALITY痕跡を持ちながら統合がJSONに残ったのは10件だけだった——原因は
//  「統合が一発勝負でリトライ無し・失敗しても無言」という欠陥（2026-08-13に修正済み。
//  TPM 429なら待って再試行→priority次点へフォールバック→全滅時は明示ログ）。
//  反転のゲート（Fable設計の基準）: 修正後のQUALITY実会議2回で統合が2/2成立すること。
//  実測: 2回とも groq/gpt-oss-120b が統合を成立させ「成功 6/6」（歴史値は6/12＝50%）。
//  なお CRITICS(批判2体)・REVISE(2巡目)・MAX_MEMBERS までを含む QUALITY 全体の既定化は
//  まだ行わない: 1会議あたりのトークン消費が概ね2倍になりTPD枯渇のリスクがあるため、
//  本反転の運用実績（record.meta.events の tpd-exhausted 件数）を見てから判断する
//  （「1つ直したら測ってから次」）。
const SYNTH = process.env.COUNCIL_SYNTH !== '0' || QUALITY;
// 統合役を「最強クラウド」に固定するか（2026-07-04設計・既定ON）。0で従来のlead選出に戻す。
const SYNTH_STRONG = process.env.COUNCIL_SYNTH_STRONG !== '0';
// ②統合の出力指定（council-roles の DEFAULT_FORMAT と同じ4ブロックを短文で示す）。
const DEFAULT_FORMAT_HINT = '「結論／根拠／反論・リスク／具体案」';
// 2026-07-03 設計: QUALITY時はCRITICS=2が2席使うため want 側が痩せないよう既定+1(5)。
const MAX_MEMBERS = Number(process.env.COUNCIL_MAX_MEMBERS) || (QUALITY ? 5 : 4);

const G = process.env.GROQ_API_KEY, N = process.env.NVIDIA_API_KEY, O = process.env.OPENROUTER_API_KEY, E = process.env.GEMINI_API_KEY;
// SambaNova Cloud（OpenAI互換）。2026-07-31追加: Free Tierは支払い方法未登録時に自動適用され
// カード登録不要。ただしMiniMax-M2.7のように「カタログには残るが402で無料枠対象外」という
// glm-5.2型の劣化パターンがあり得るため、採用エントリにはliveProbe必須（council-lineup.mjs参照）。
const SN = process.env.SAMBANOVA_API_KEY;
// Mistral AI La Plateforme（OpenAI互換）。2026-08-05追加: 無料枠はカード登録不要で、
// 実機で6モデル200・2並列200を裏取り済み（council-lineup.mjs のエントリコメント参照）。
// 月次クォータ枯渇時の挙動（429で止まるか課金に移るか）がAPI側から判別できないため、
// 採用エントリには liveProbe 必須。
const MI = process.env.MISTRAL_API_KEY;
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

// ── TPD(1日トークン上限)枯渇のセッション内検知（2026-07-04 追加）──────────────
// 背景: 実機で groq/llama-3.3-70b-versatile が「Limit 100000, Used 99486... tokens per day (TPD)」
//   で429 FAILEDする事例を確認。同日中は何度リトライしても回復しないため、検知したら「本セッション」
//   の以降のラウンド・敗者復活の対象から外す。翌日はプロセス再起動で自然にリセットされるため
//   フラグは永続化しない（永続化すると枯渇解消後も除外され続ける事故になる）。
// 注意: TPM(1分あたり上限)は数十秒〜1分で回復するため、TPDと区別してセッション除外の
//   対象にしない（実機確認: "tokens per minute (TPM)" は誤検知しやすく、TPD専用の文言で絞る）。
const exhaustedLabels = new Set();
function isTpdExhaustedError(message) {
  return /tokens per day|\bTPD\b/i.test(String(message || ''));
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
    if (!r.ok || j.error) {
      const msg = 'HTTP ' + r.status + ' ' + (j.error?.message || JSON.stringify(j).slice(0, 120));
      if (r.status === 429 && isTpdExhaustedError(msg)) {
        throw Object.assign(new Error(msg), { tpdExhausted: true });
      }
      throw new Error(msg);
    }
    const msg = j?.choices?.[0]?.message;
    // reasoning系モデル(glm-4.7-flash等)は content が null で reasoning フィールドに
    // 中身を返すことがある(2026-07-04 実機確認)。content優先だが、無ければreasoningで救う。
    const content = msg?.content || msg?.reasoning_content || msg?.reasoning || '';
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
const SNV = 'https://api.sambanova.ai/v1/chat/completions';
const MIS = 'https://api.mistral.ai/v1/chat/completions';
// Cloudflare Workers AI の OpenAI 互換エンドポイント（アカウントIDをパスに含む）。
const CF_URL = CF_ACC ? `https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/ai/v1/chat/completions` : '';
// rawId = プロバイダ側の実モデルID（起動時ライブ実在チェックで /models と突き合わせる用。任意）。
// provider = 実在チェックのグループ（'groq'|'gemini'|'ollama' のみ検証対象。他は listing が無い/不安定なので素通し）。
// run はTPD枯渇検知でラップする: HTTP 429のtpdExhaustedエラーを検知したら exhaustedLabels に
// 記録して1行報告し、そのまま投げ直す（本セッションの以降のラウンド/敗者復活選定は
// exhaustedLabels を見て除外する側の責務。ここでは記録だけ行う・永続化はしない）。
const push = (label, kind, run, rawId = '', provider = '') => {
  const wrapped = async (p, s) => {
    try {
      return await run(p, s);
    } catch (e) {
      if (e?.tpdExhausted && !exhaustedLabels.has(label)) {
        exhaustedLabels.add(label);
        console.error(`[TPD枯渇] ${label} を本セッション除外（${String(e.message).slice(0, 100)}）`);
        noteEvent('tpd-exhausted', { label });
      }
      throw e;
    }
  };
  allMembers.push({ label, role: roleOf(label), kind, run: wrapped, rawId, provider });
};

// council-lineup.mjs の LINEUP をここで実行可能な run 関数に変換して push する。
// 2026-07-16 リファクタ（HANDOFF-council-scout-design.md Phase 0）: 個別の
// push(...) 呼び出し列を LINEUP データ + このループに置き換えた。挙動は不変
// （requires/provider/rawId/apiModel/opts/timeoutMs は元のpush引数と1:1対応）。
const ENV_FLAGS = { G, N, O, E, CF, CF_ACC, SN, MI };
const PROVIDER_RUN = {
  groq: (entry) => (p, s) => openaiChat(GROQ, G, entry.apiModel, p, s, entry.opts, entry.timeoutMs || undefined),
  gemini: (entry) => (p, s) => geminiChat(entry.apiModel, p, s, entry.timeoutMs || undefined),
  nvidia: (entry) => (p, s) => openaiChat(NV, N, entry.apiModel, p, s, entry.opts, entry.timeoutMs || undefined),
  cloudflare: (entry) => (p, s) => openaiChat(CF_URL, CF, entry.apiModel, p, s, entry.opts, entry.timeoutMs || undefined),
  openrouter: (entry) => (p, s) => openaiChat(OR, O, entry.apiModel, p, s, entry.opts, entry.timeoutMs || undefined),
  sambanova: (entry) => (p, s) => openaiChat(SNV, SN, entry.apiModel, p, s, entry.opts, entry.timeoutMs || undefined),
  mistral: (entry) => (p, s) => openaiChat(MIS, MI, entry.apiModel, p, s, entry.opts, entry.timeoutMs || undefined),
};
// openaiChat/geminiChat の timeoutMs 既定引数を上書きしないよう、未指定時は
// 呼び出し側の既定値に委ねる（下の runFor が entry.timeoutMs 未設定なら省略する）。
function runFor(entry) {
  const build = PROVIDER_RUN[entry.provider];
  if (!build) throw new Error(`unknown provider in council-lineup: ${entry.provider}`);
  if (!entry.timeoutMs) {
    // xxxChat の既定タイムアウトを使わせるため、明示引数を渡さない薄いラッパーにする。
    if (entry.provider === 'groq' || entry.provider === 'nvidia' || entry.provider === 'cloudflare' || entry.provider === 'openrouter' || entry.provider === 'sambanova' || entry.provider === 'mistral') {
      const url = { groq: GROQ, nvidia: NV, cloudflare: CF_URL, openrouter: OR, sambanova: SNV, mistral: MIS }[entry.provider];
      const key = { groq: G, nvidia: N, cloudflare: CF, openrouter: O, sambanova: SN, mistral: MI }[entry.provider];
      return (p, s) => openaiChat(url, key, entry.apiModel, p, s, entry.opts);
    }
    if (entry.provider === 'gemini') return (p, s) => geminiChat(entry.apiModel, p, s);
  }
  return build(entry);
}
for (const entry of LINEUP) {
  const enabled = entry.requires.every((k) => Boolean(ENV_FLAGS[k]));
  if (!enabled) continue;
  // provider が実在チェック対象('groq'|'gemini')の場合のみ rawId/provider を渡す
  // （meeting.mjs の verifyLiveModels は provider が groq/gemini/ollama のときだけ効く）。
  const verifiable = entry.provider === 'groq' || entry.provider === 'gemini';
  push(entry.label, 'cloud', runFor(entry), verifiable ? entry.rawId : '', verifiable ? entry.provider : '');
}
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
  // 2026-07-03 棚卸し: hermes3:8b(役割未定のまま無価値・fastはクラウドで充足) を削除。
  'gemma4:latest', 'qwen2.5-coder:14b',
];
const localModels = (process.env.MEETING_LOCAL_MODELS || LOCAL_DEFAULT.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);
for (const m of localModels) {
  // provider='ollama' で起動時ライブ実在チェックに参加させる（下記 fetchLiveModelIds 参照）。
  // rawId=モデル名そのもの（Ollamaは1台構成でIDのゆらぎが無いためlabelと同じでよい）。
  push(`local/${m}`, 'local', (p, s) => ollamaChat(m, p, s), m, 'ollama');
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
// 2026-07-03 設計: Ollama の生死判定は groq/gemini の実在チェックとは意味論が逆になる。
//   groq/gemini: null(検証不能)=素通し・除外しない / Set(検証可能)=一覧に無ければ除外。
//   ollama:      到達不能=Ollamaが起動していない=ローカル全メンバーを丸ごと除外すべき状況。
// そのため fetchLiveModelIds の null 分岐を流用せず、ollama 専用の生死フラグを別に持つ。
/** Ollama の /api/tags に2秒timeoutで疎通確認する。生きていれば true。 */
async function isOllamaAlive() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}
/** allMembers から、live 一覧に無い(=幻覚/廃止)クラウドメンバーを警告除去する。 */
async function verifyLiveModels() {
  if (!VERIFY_MODELS) return;
  const providers = [...new Set(allMembers.map(m => m.provider).filter(Boolean).filter(p => p !== 'ollama'))];
  const live = new Map();
  const hasOllamaMembers = allMembers.some(m => m.provider === 'ollama');
  const [, ollamaAlive] = await Promise.all([
    Promise.all(providers.map(async p => { live.set(p, await fetchLiveModelIds(p)); })),
    hasOllamaMembers ? isOllamaAlive() : Promise.resolve(true),
  ]);
  let removed = 0;
  if (hasOllamaMembers && !ollamaAlive) {
    const before = allMembers.length;
    for (let i = allMembers.length - 1; i >= 0; i--) {
      if (allMembers[i].provider === 'ollama') allMembers.splice(i, 1);
    }
    const droppedCount = before - allMembers.length;
    removed += droppedCount;
    console.error(`[Ollama生死] http://127.0.0.1:11434 に到達不能 → local ${droppedCount}体を除外（クラウドのみで縮退運用）`);
  }
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

// 2026-07-03 設計: 分類器専任のllama-3.1-8b-instant。1語JSONを返すだけの仕事にfast主力の
// TPD(1日トークン上限)を使うのは浪費（2026-07-04実測でllama-3.3-70bがTPD枯渇した一因）。
// 正規メンバー(allMembers)には入れない＝動的ルーティングの穴埋め候補にはならない。
//
// 2026-08-18 撤去（llama-3.1-8b-instant の専任枠）: GroqがLlama系を一斉廃止し404になった。
//  ★このとき「フォールバック鎖の2番目に生存モデル(gemini-2.5-flash)が居るのに、全ての問いが
//    generalへ落ち続ける」という症状が出た。真因はモデルの死ではなく下の classify() の構造で、
//    `classifierOnly || order...` は **GROQ_API_KEYがある限り常に左辺が真** になるため、
//    order配列（鎖）が一度も評価されなかった。＝専任モデルが死んだ瞬間、鎖は無意味な飾りになり
//    catch で general に固定される設計だった（会議のルーティングが丸ごと死ぬ単一障害点）。
//  ★教訓: フォールバック鎖の「手前に無条件の固定枠」を置くと、鎖は永久に歩かれない。
//    専任という最適化（TPD節約）のために、可用性を落としていた。
//  対処: 専任という概念自体を捨て、下の classify() を「候補を順に試し、最初に成功した1体を使う」
//    実挙動に変えた。TPD節約の当初目的は、鎖の先頭を軽量モデルにすることで達成できる。

/** 分類器: 候補を順に試し、最初に成功した1体の判定を使う。全滅時のみ general。
 *  2026-08-18改修: 従来は先頭1体に固定で、それが死ぬと鎖を歩かず general に落ち続けた。
 *  鎖の順序は「軽い順・別プロバイダを跨ぐ順」——1語のJSONを返すだけの仕事に重い主力の
 *  レート枠を使わないという当初の意図を、専任枠ではなく順序で表現する。 */
async function classify(taskText) {
  const order = ['gemini-2.5-flash', 'groq/gpt-oss-20b', 'groq/gpt-oss-120b', 'local/qwen3.5:9b'];
  const cands = order.map(l => allMembers.find(m => m.label === l)).filter(Boolean);
  if (!cands.length && allMembers.length) cands.push(allMembers[0]);
  if (!cands.length) return { category: 'general', by: '(none)', raw: '' };
  let lastErr = '';
  for (const c of cands) {
    try {
      const raw = await c.run(classifyPrompt(taskText), '');
      const category = parseCategory(raw);
      return { category, by: c.label, raw: String(raw).slice(0, 160) };
    } catch (e) {
      lastErr = String(e?.message || e).slice(0, 120);
      console.error(`[分類器] ${c.label} が失敗 → 次の候補へ（${lastErr}）`);
      noteEvent('classifier-failed', { label: c.label, error: lastErr });
    }
  }
  // 全滅時のみ general。従来はここに「1体でも死ねば」到達していた。
  noteEvent('classifier-none', { tried: cands.length });
  return { category: 'general', by: '(all failed)', raw: lastErr };
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
// 2026-08-16 追加: record を「それ単体で会議を再現・評価できる」自己記述型にする。
// 動機: council/*.json 84件を初めて解析したとき、JSONだけでは
//   「QUALITYだったのか」「統合は試みて失敗したのか、そもそも走らなかったのか」
//   「誰が召集されたのか」が一切分からず、stderrログ54件との突合が必要だった。
//   その結果「統合10回＝QUALITYがほぼ使われていない」と誤読しかけた（実際は30/84回で
//   使われており、統合の2/3が無言で消えていただけ）。記録の穴が判断を歪めた実例。
// 方針: 自動で何かを変える機構は作らない（30年後楽＝足すコードを増やさない）。
//   人間が節目に解析するための材料を、既存recordに相乗りさせるだけに留める。
const record = {
  question, mode: '', category: '', classifier: '', rounds: {}, at: new Date().toISOString(),
  meta: {
    flags: { quality: QUALITY, critics: CRITICS, revise: REVISE, synth: SYNTH, samples: SAMPLES, maxMembers: MAX_MEMBERS },
    members: [],  // 実際に召集された {label, role} （stderrにしか出ていなかった）
    events: [],   // 統合失敗/敗者復活/振替/TPD枯渇。安全網が発動したかを後から数えられる
  },
};
/** 会議中の特筆イベントを record に残す（stderr出力と対で呼ぶ）。 */
function noteEvent(type, detail) {
  try { record.meta.events.push({ type, ...detail }); } catch { /* 記録失敗で会議を止めない */ }
}

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
//
// 2026-08-16 検証（「導入以来一度も畳んでいない＝壊れているのでは」への回答）:
//  council/*.json 84件の回答ペア349組の類似度を実測したところ、**最大 0.691**（local/deepseek-r1
//  vs local/qwen2.5-coder）で、閾値0.82に一度も届いていなかった。分布は0.2台158ペアが最頻で、
//  0.6台はわずか4ペア。＝**未発動は正常**であり、会議メンバーの回答は十分に多様だったことを示す。
//  この機構が黙っていることは「重複が無い」という健全性の報告であって、故障ではない。
//  閾値0.82は保守的に過ぎるようにも見えるが、下げると「似ているが結論の違う回答」を
//  畳むリスクが出る（0.6台の4ペアは実際に結論が異なる）。実測の最大値0.691と閾値0.82の
//  間には余裕があり、この設定のままでよい。畳んだ件数は record.meta.events の type:'dedup'
//  でも数えられる（2026-08-16に計器を追加）。
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
    .replace(/[\s#>*`|:_\-—–・･。、,.()[\]{}!?！？「」【】]/g, ''); // 空白・記号を除去
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
  noteEvent('dedup', { round: label, folded: folds.length, kept: results.length - dropped.size });
  // 代表行に「畳んだ相手」を注記（記録に残す）。
  for (const f of folds) {
    const k = results.find(r => r.label === f.keep);
    if (k) k.dedupFolded = [...(k.dedupFolded || []), f.gone];
  }
  return results.filter(r => !dropped.has(r));
}

/**
 * 1件の回答テキストを、統合(SYNTH)・批判往復への同梱用に圧縮する。
 * 2026-07-04設計: 旧実装は先頭からcap文字での機械的な頭切りで、4ブロック型の回答は
 * 常に「具体案」ブロックが切り捨てられていた（結論・根拠が長いと具体案まで届かない）。
 * 見出しがある回答は「結論(全量)＋反論・リスク(先頭400字)＋具体案(先頭400字)」を優先的に
 * 抽出する（根拠ブロックは統合に最も不要なので落とす）。見出しが無い回答（critic の
 * (0)〜(3)構造や、フォーマットを外したモデル）は従来通り先頭capで丸めるが、
 * 【最重要】を含む行だけは必ず残す（capの外に落ちても末尾に追記）。
 *
 * 2026-08-16 記録（実装を試して実測で否定した仮説。同じ道を二度通らないために残す）:
 * 「根拠ブロックは統合に最も不要」という上の判断には理論上の欠陥がある——統合プロンプトは
 * 「(2)判定: どちらを採るか理由付きで決める」と要求しているのに、その判定材料である根拠を
 * 入力から消しており、根拠を見せずに根拠に基づく判定を命じている形になっている。
 * そこで「根拠ブロックのうち数値を含む行だけを200字上限で統合digestに同梱する」改修を
 * 実装し、A/Bで測ったが【効果を確認できず撤回した】。実測（統合役=groq/gpt-oss-120b・
 * 「根拠を見ないと裁けない対立」を仕込んだ同一プロンプト）:
 *   根拠なし(現状)          … 決定的な実測値の引用 0/4
 *   数値行のみ各案に付記     … 1/4  ← 採用基準(2/3以上)に届かず
 *   数値行を冒頭に集約       … 0/2（成功率自体も低下）
 *   根拠ブロック全文を同梱   … 2/2（効くが、TPM 8000超過で429の主因になるため採用不可。
 *                                 実測: 同一プロンプトで入力3600字にすると429）
 * ＝「効かせるには全文が要るが、全文はレート制限で落ちる」という板挟みで、部分同梱では
 * 埋まらない。効かない機能を入れると退避弁のenvと専用関数が永久に残る（30年後楽＝足す
 * コードを増やさない、に反する）ため、実装ごと撤回して本コメントだけを残す判断をした。
 * 再挑戦するなら「統合役をTPMの緩い別プロバイダにして全文を渡す」方向が筋（部分同梱の
 * 微調整は上記3パターンで既に潰してある）。
 */
function compressAnswer(answer, cap) {
  const text = String(answer || '');
  const m = text.match(/##\s*結論([\s\S]*?)(?:##\s*根拠|$)/);
  if (m) {
    const conclusion = text.match(/##\s*結論[\s\S]*?(?=##\s*根拠|$)/)?.[0] || '';
    const risk = text.match(/##\s*反論・リスク[\s\S]*?(?=##\s*具体案|$)/)?.[0]?.slice(0, 400) || '';
    const plan = text.match(/##\s*具体案[\s\S]*/)?.[0]?.slice(0, 400) || '';
    return [conclusion.trim(), risk.trim(), plan.trim()].filter(Boolean).join('\n');
  }
  const head = text.slice(0, cap);
  const criticalLine = text.split('\n').find(l => l.includes('【最重要】'));
  if (criticalLine && !head.includes(criticalLine)) {
    return head + '\n(【最重要】行): ' + criticalLine.trim();
  }
  return head;
}

/** 結果配列を「■ ラベル（役割）の結論: …」のダイジェストに畳む（プロンプト同梱用）。 */
function digestOf(results, cap = 700) {
  return results.filter(r => !r.error && (r.answer || '').trim())
    .map(r => `■ ${r.label}（${ROLE_LABEL[r.role] || r.role}）:\n${compressAnswer(r.answer, cap)}`)
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
    // 2026-07-04設計: 「採用/反論」の明示を義務化。旧版は批判を黙殺しても検出できなかった。
    if (REVISE && others.length) {
      const critDigest = first.filter(r => r.role === 'critic' && !r.error && (r.answer || '').trim())
        .map(r => `■ 批判（${r.label}）:\n${(r.answer || '').slice(0, 1000)}`).join('\n\n');
      if (critDigest) {
        const revisers = members.filter(m => m.role !== 'critic'
          && first.some(r => r.label === m.label && !r.error));
        console.error(`[${label}] ①2巡目: ${revisers.length}体が批判を受けて修正`);
        const revised = await runRound(revisers, question, () =>
          `【あなたの先の回答への批判】\n${critDigest}\n\n` +
          `冒頭で、批判の各指摘に対し「採用/反論」を1行ずつ明示すること。【最重要】印の指摘を最初に扱う。` +
          `反論は1文で簡潔に。そのうえで最終形の案だけを、元と同じ4ブロックの見出しで出し直すこと。`);
        for (const rv of revised) {
          const idx = first.findIndex(r => r.label === rv.label);
          if (idx >= 0 && !rv.error) first[idx] = { ...rv, ms: first[idx].ms + rv.ms, rebutted: first[idx].rebutted, revised: true };
        }
      }
    }
  }

  // 回答dedup: 統合・表示の前に「ほぼ同一の素回答」を畳む（費用ゼロの質向上・黙って消さずログ）。
  let shown = dedupResults(first, label);

  // 敗者復活（rescue 1回制・2026-07-04 追加）: 有効回答が3体未満なら、まだ召集していない
  // 安定クラウド(weight<=2)1体に同じ問いを1回だけ追加で投げる。CF予備勢のFAILED連発や
  // TPD枯渇での歩留まり低下を、追加コスト最小(1体・1回のみ)で救う。再帰はしない。
  //
  // 2026-08-16 検証（「導入以来一度も発動していない＝壊れているのでは」への回答）:
  //  council/*.json 84件を実測したところ、有効回答が3体未満だったラウンドは8件あったが、
  //  その8件すべてが 2026-06-17〜06-22 で、この機構の導入(07-04)より前だった。
  //  ＝導入後に発動条件を満たした会議は0件。**未発動は正常**であり、コードの欠陥ではない。
  //  むしろ7月以降は歩留まりが改善して条件に触れなくなったことを示している
  //  （実際、有効3体27ラウンド・有効4体44ラウンドで、2体以下は導入後ゼロ）。
  //  候補プールが空という疑いも否定済み: weight<=2は5体あり、典型的なdesign会議で
  //  4体召集した後も gemini-2.5-flash が候補として残る。
  //  今後の発動は record.meta.events の type:'rescue' で数えられる（2026-08-16に計器を追加）。
  //  もし発動したのに救えていない、という事象が出たらそのとき初めて機構を疑うこと。
  const okCount = shown.filter(r => !r.error).length;
  if (okCount < 3) {
    const usedLabels = new Set(members.map(m => m.label));
    const rescueCand = allMembers
      .filter(m => !usedLabels.has(m.label) && !exhaustedLabels.has(m.label) && weightOf(m.label) <= 2)
      .sort((a, b) => weightOf(a.label) - weightOf(b.label))[0];
    if (rescueCand) {
      console.error(`[${label}] 敗者復活: 有効回答${okCount}体のため ${rescueCand.label} に1回だけ追加依頼`);
      noteEvent('rescue', { round: label, okCount, cand: rescueCand.label });
      const rescued = await runRound([rescueCand], question);
      if (rescued[0] && !rescued[0].error) {
        shown = [...shown, rescued[0]];
      }
    }
  }

  // ② 統括(lead)が全回答を読んで1案へ統合する。
  // 2026-07-04設計: 統合役を「最強クラウド」に固定する（L1レバー）。従来は
  // routedMembers 内の lead(=local/gemma4 8B) が統合を担っており、会議で最も地頭が
  // 要る工程を最弱メンバーがやっているのが Fable との差の最大要因だった。
  // routedMembers に参加していないモデルが統合するのは問題ない（digest を読むだけの独立工程）。
  if (SYNTH) {
    let synth = null;
    // 2026-08-13: priority は下の統合チェーン（次点フォールバック）からも参照するため
    // SYNTH_STRONG ブロックの外へ引き上げた（値・順序は不変）。
    let priority = [];
    if (SYNTH_STRONG) {
      // 2026-07-14: nvidia/mistral-large-3-675bは統合失敗時にリトライが無い一発工程のため
      // 即座にpriority先頭へは入れない。QUALITY会議2回連続でFAILEDゼロなら先頭に昇格させる
      // （cloudflare/glm-4.7-flashのトライアル方式と同じ流儀）。
      // 2026-08-13: 末尾の 'cloudflare/glm-5.2' を撤去。2026-07-31にWorkers有料プラン専用化で
      // LINEUPから撤去済みのラベルで、findが永久に外れる死に要素だった（council-lineup.mjsの
      // 撤去コメント参照）。挙動は変わらないが、統合はリトライ無しの一発工程であり、
      // 候補列に「絶対に当たらない選択肢」が混ざっていること自体が次に読む人を誤らせる。
      // 2番手のcloudflare/nemotron-120bは残す: weight4でCF勢は並列FAILED実績があるものの、
      // groqがTPD枯渇した日に統合役が全滅するのを防ぐ最後の砦として機能する（順序も変えない）。
      // 2026-08-18: 'groq/llama-3.3-70b' を撤去。同日GroqのLlama一斉廃止で404になった死にラベルで、
      // 上のcloudflare/glm-5.2撤去(2026-08-13)と同じ「findが永久に外れる死に要素」。挙動は
      // 変わらないが、統合はリトライ無しの一発工程であり、絶対に当たらない選択肢を候補列に残さない。
      priority = ['groq/gpt-oss-120b', 'cloudflare/nemotron-120b', 'gemini-2.5-flash'];
      synth = priority.map(l => allMembers.find(m => m.label === l && !exhaustedLabels.has(l))).find(Boolean)
        || allMembers.find(m => m.kind === 'cloud' && !exhaustedLabels.has(m.label));
      if (synth) console.error(`[${label}] ②統合役(能力優先): ${synth.label}`);
    }
    if (!synth) synth = members.find(m => m.role === 'lead' && shown.some(r => r.label === m.label && !r.error));
    if (!synth) synth = members.find(m => shown.some(r => r.label === m.label && !r.error));
    if (synth) {
      // 2026-08-13設計（実測対応）: 統合は従来「候補1体を選んで一発・失敗は無言」だった。
      // groq gpt-oss-120bのTPM(分あたり8000)超過による429を実会議で観測しており
      // （"Limit 8000, Used 4520, Requested 7046"）、一発工程のままでは会議の最終成果物が
      // 丸ごと消える。TPMはTPDと違い60秒以内に回復する（isTpdExhaustedErrorのコメント参照）ため:
      //  (1) 筆頭候補がTPM 429のときだけ、エラー文の "try again in Xs" に従い1回だけ待って再試行する
      //      （最強頭脳を安易に手放して統合の質を下げないため。待ちは上限70秒・取れなければ65秒）。
      //  (2) それでも失敗なら priority の次点へ一発ずつフォールバック（別プロバイダ=別TPM枠なので待ち不要）。
      //  縮退入力での再試行はしない: 入力を削った統合を同格の成果物として記録するのは
      //  fail-closed 違反（「全員の回答を読んだ統合」だと後から誤認される）。同一入力でのみ再試行する。
      //  全滅時は「統合なし」を明示ログし、素の回答だけを記録する（司令塔が手動統合する既存運用へ落ちる）。
      //  従来は失敗時に無言で握り潰しており、統合が消えたことに気づけなかった。
      const chain = [];
      for (const c of [synth, ...(SYNTH_STRONG ? priority.map(l => allMembers.find(m => m.label === l && !exhaustedLabels.has(l))).filter(Boolean) : [])]) {
        if (c && !chain.some(x => x.label === c.label)) chain.push(c);
      }
      const isTpmError = (msg) => /tokens per minute|\bTPM\b/i.test(String(msg || ''));
      const tpmWaitMs = (msg) => {
        const m = String(msg || '').match(/try again in ([\d.]+)s/i);
        return Math.min(70000, m ? (Number(m[1]) + 5) * 1000 : 65000);
      };
      const all = digestOf(shown, 900); // 重複を畳んだ後の回答で統合（ノイズ・重複を統括に見せない）
      // 1.3tok/字の見積もり仮説を実会議で校正するための材料（429の Requested 値と突き合わせる）。
      console.error(`[${label}] ②統合digest ${all.length}字`);
      const synthPrompt = () =>
        `【会議メンバー全員の回答（批判・修正済み）】\n${all}\n\n` +
        `あなたは統括役。次の手順で統合すること:\n` +
        `(1)対立点の列挙: メンバー間で結論が食い違う点を箇条書きで挙げる。批判役同士の指摘が食い違う場合も対立点として挙げ、どちらが正しいか判定する。無ければ「対立なし」と書く。\n` +
        `(2)判定: 各対立点についてどちらを採るか理由付きで決める。単なる折衷は禁止。両者の前提を組み替えて両立させる第三案が実在する場合のみ、それを採ってよい。\n` +
        `(3)少数意見の検分: 多数派の前提そのものを否定する意見があれば、無視せず「採用/却下＋理由」を明示する。【最重要】印の付いた批判が最終案で解決されているかを必ず確認する。\n` +
        `(4)自己検証: 自分の統合ロジックを2文で要約し、(2)の判定と矛盾していないことを確かめてから最終案を書く。\n` +
        `最終案は ${DEFAULT_FORMAT_HINT} の4見出しで。優先順位を付け、何を捨てるかまで決める。あれもこれもにしない。`;
      for (let ci = 0; ci < chain.length; ci++) {
        const cand = chain[ci];
        console.error(`[${label}] ②統合: ${cand.label} が1案に束ねる${ci > 0 ? '（次点フォールバック）' : ''}`);
        let sres = await runRound([{ ...cand, role: 'lead' }], question, synthPrompt);
        if (sres[0]?.error && ci === 0 && isTpmError(sres[0].error)) {
          const w = tpmWaitMs(sres[0].error);
          console.error(`[${label}] ②統合: 筆頭 ${cand.label} がTPM 429 → ${Math.round(w / 1000)}秒待って同一入力で1回だけ再試行`);
          await new Promise(r => setTimeout(r, w));
          sres = await runRound([{ ...cand, role: 'lead' }], question, synthPrompt);
        }
        if (sres[0] && !sres[0].error) {
          shown.push({ ...sres[0], label: cand.label + ' [統合]', role: 'lead', ms: sres[0].ms, synthesis: true });
          break;
        }
        noteEvent('synth-failed', { round: label, cand: cand.label, error: String(sres[0]?.error || '(no result)').slice(0, 120) });
        console.error(`[${label}] ②統合失敗: ${cand.label}: ${String(sres[0]?.error || '(no result)').slice(0, 120)}`
          + (ci < chain.length - 1 ? ' → 次点へ' : ''));
        if (ci === chain.length - 1) {
          console.error(`[${label}] ②統合: 全候補失敗。統合なしで素の回答のみ記録する（司令塔が手動で統合すること）`);
          noteEvent('synth-none', { round: label, tried: chain.length });
        }
      }
    }
  }

  // 2026-08-19 追加（計器のみ・挙動は変えない）: 「召集したのに有効回答が返らなかった役割」を数える。
  //  動機: council/*.json 79件を手で掘って初めて「lead不在の会議が45件あった」と分かった。
  //  だが分解すると実害は現行lineupで1件（2026-08-04・nvidia/nemotron-3-ultra-550bのHTTP 503
  //  "Worker local total request limit reached (32/32)"・0ms即死・再発なし）だけで、
  //  残りは(a)不召集39件＝CATEGORIES.codeがleadをwantしない設計/当時leadプールが薄かった歴史、
  //  (b)召集失敗6件のうち5件はEOL撤去済みのnvidia/mistral-large-3-675b、という内訳だった。
  //  ★重要な実測: lead不在45件は**すべて2026-08-16(SYNTH既定ON)より前**。統合はrouted
  //    メンバーと独立に最強クラウドが担うようになったため、leadが1巡目で死んでも会議の
  //    最終成果物は成立する。＝救済機構を今書くのは、測定された問題がゼロの過剰実装。
  //  そこで機構は書かず、計器だけ置く。既存のnoteEvent(record.meta.events)に相乗りするので
  //  新規配線はゼロ。
  //  ★救済を設計してよい条件（これを満たすまで機構は書かない）:
  //    role-gap が missing に 'lead' を含み synthCovered:false で観測されたとき、
  //    または計器導入後に role-gap を3回観測したとき。会議は月数回しか回らないので閾値は率でなく絶対値。
  //  ★救済を書く日の置き場所の注意: runRound(487行)の中に書いてはならない。
  //    runRound は②統合チェーン(860/865行)からも role:'lead' で呼ばれており、
  //    そこに差し替え再試行を入れると統合の429リトライと二重再試行になる。
  //    置くなら council() の1巡目直後(727行の外側)で、swapToCloud(893行)を再利用する。
  //  ★この計器が見ないもの: 「そもそも召集されなかった役割」は members に居ないので missing に出ない
  //    （不召集は選抜段階の話で、現行LINEUPでは design/general/fact/writing に lead が入ることを実行確認済み）。
  //  ★r.synthesis を除外する理由（外すと計器が無意味になる）: ②統合の成功行は
  //    `role:'lead'` を付けて shown に push される(868行)。除外しないと、1巡目のleadが
  //    死んでも統合が成功した瞬間に lead が「回答済み」に見え、2026-08-04の実例が
  //    欠落ゼロと報告される。統合の成否は synthCovered で別に持つ。
  const summonedRoles = new Set(members.map(m => m.role).filter(Boolean));
  const answeredRoles = new Set(shown.filter(r => !r.error && !r.synthesis && String(r.answer || '').trim()).map(r => r.role).filter(Boolean));
  const missingRoles = [...summonedRoles].filter(r => !answeredRoles.has(r));
  if (missingRoles.length) {
    const synthCovered = shown.some(r => r.synthesis && !r.error);
    noteEvent('role-gap', {
      round: label,
      missing: missingRoles,
      failed: shown.filter(r => r.error).map(r => `${r.role || '?'}:${r.label}`),
      synthCovered,
    });
    const heavy = missingRoles.includes('lead') && !synthCovered;
    console.error(`[${label}] ⚠ 役割欠落: ${missingRoles.map(r => ROLE_LABEL[r] || r).join('/')} の有効回答なし`
      + (synthCovered ? '（統合は別頭脳で成立）' : '（統合も無し）')
      + (heavy ? ' ★統括不在かつ統合なし＝救済機構の設計を検討すること' : ''));
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
  // 2026-07-04 設計: 同点候補が複数ある場合はweight昇順(安定勢優先)で選ぶ。
  // CF予備(weight4)への振替は「他に安定勢が無い」時だけの最後の手段にする。
  const byWeight = (a, b) => weightOf(a.label) - weightOf(b.label);
  const sameRole = allMembers.filter((m) => m.kind === 'cloud' && m.role === member.role && !usedLabels.has(m.label)).sort(byWeight);
  const anyCloud = allMembers.filter((m) => m.kind === 'cloud' && !usedLabels.has(m.label)).sort(byWeight);
  const spare = sameRole[0] || anyCloud[0];
  if (!spare) { console.error(`[振替] ${member.label} の代替クラウドが無く、そのまま残す（${reason}）`); return; }
  routedMembers.splice(idx, 1, { ...spare, role: member.role });
  console.error(`[振替] ${member.label} → ${spare.label}（${ROLE_LABEL[member.role]}・理由:${reason}）`);
  noteEvent('swap', { from: member.label, to: spare.label, role: member.role, reason });
}

if (FULL && !AB) {
  record.mode = 'full';
  record.meta.members = allMembers.map(m => ({ label: m.label, role: m.role })); // routed経路と同様に残す
  await council(allMembers, '全員集合（COUNCIL_FULL）', 'full');
} else {
  const { category, by, raw } = await classify(question);
  record.mode = AB ? 'ab' : 'routed';
  record.category = category;
  record.classifier = by;
  console.error(`\n分類: category=${category}  by=${by}  (${CATEGORIES[category]?.hint || ''})`);
  if (raw) console.error(`  分類器の生出力: ${raw}`);

  // TPD枯渇済み(本セッション中に429で確認済み)のメンバーは選抜候補から外す。
  const availableLabels = allMembers.map(m => m.label).filter(l => !exhaustedLabels.has(l));
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
    // 2026-08-13 修正: 従来は label 重複しか見ておらず、コメントの意図（「違う頭脳を狙って」）に
    // 反して同一プロバイダから2体目を選んでいた。実会議で design カテゴリの召集が
    // groq 3体+nvidia 1体のとき、2体目の批判役に groq/compound（4人目のgroq）が選ばれ、
    // 既存の groq/gpt-oss-120b と同じ TPM 枠（分あたり8000）を食い合って
    // 「429 Rate limit ... Limit 8000, Used 2101, Requested 6981」で丸ごと落ちた。
    // ＝多視点のために足した1体が、レート制限で自滅して視点ゼロになっていた。
    // プロバイダ未使用のクラウドを最優先し、無ければ従来どおり label 重複回避のみで選ぶ
    // （fail-open。候補が尽きて2体目を諦めるより、同一プロバイダでも試す方がまし）。
    const usedProviders = new Set(routedMembers.map(m => m.provider).filter(Boolean));
    const cand = allMembers.find(m => m.kind === 'cloud' && !usedLabels.has(m.label) && !usedProviders.has(m.provider))
              || allMembers.find(m => m.kind === 'cloud' && !usedLabels.has(m.label))
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
  // 誰が召集されたかは従来stderrにしか出ておらず、JSONだけでは会議を再現できなかった。
  record.meta.members = routedMembers.map(m => ({ label: m.label, role: m.role }));

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
