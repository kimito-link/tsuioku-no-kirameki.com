#!/usr/bin/env node
/**
 * meeting-roles.mjs — meeting.mjs の役割注入版。
 *
 * COUNCIL-HOWTO.md の「効いている仕掛け 1. 役割の個別注入」を実際に配線する。
 * 既存 meeting.mjs は council-roles.mjs を読み込んでおらず、素のお題を全員に同文で
 * 投げるだけ（役割が効かない）。本スクリプトは council-roles.mjs の buildSystem() で
 * メンバーごとに役割別 system を組み立て、各APIの system 機構に載せて投げる。
 *
 * - お題本文（user）は全員同じ。役割の差は system だけで付ける（批判役=穴を必ず1つ等）。
 * - お題が独自フォーマット（4ブロック等）を指定している場合、buildSystem は DEFAULT_FORMAT を
 *   足さない（taskSpecifiesFormat で自動判定）。今回のお題は4ブロックを明記済み。
 *
 * 使い方:
 *   node scripts/meeting-roles.mjs path/to/question.txt [--out answers.json]
 * env:
 *   GROQ_API_KEY / NVIDIA_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY（あるものだけ参加）
 *   MEETING_LOCAL_MODELS=csv（ローカルモデル上書き）
 *   OLLAMA_HOST / OLLAMA_TIMEOUT_MS
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSystem, ROLE_LABEL, roleOf } from './council-roles.mjs';

const args = process.argv.slice(2);
let question = '';
let outPath = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outPath = args[++i] || '';
  else if (!question && args[i] && !args[i].startsWith('--')) question = readFileSync(args[i], 'utf8');
}
if (!question.trim()) {
  console.error('質問が空です。node scripts/meeting-roles.mjs <file> [--out ...] を渡してください。');
  process.exit(1);
}

const G = process.env.GROQ_API_KEY, N = process.env.NVIDIA_API_KEY, O = process.env.OPENROUTER_API_KEY, E = process.env.GEMINI_API_KEY;
let OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
if (!/^https?:\/\//.test(OLLAMA)) OLLAMA = 'http://' + OLLAMA;
OLLAMA = OLLAMA.replace('0.0.0.0', '127.0.0.1');

/** 役割別 system を組む。お題が型を指定済みなら DEFAULT_FORMAT は自動で足されない。 */
function systemFor(label) {
  return buildSystem({ modelName: label, taskText: question }).system;
}

/** OpenAI互換チャット（system + user）。 */
async function openaiChat(label, url, key, model, extra = {}, timeoutMs = 150000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemFor(label) }, { role: 'user', content: question }],
        max_tokens: 1600, temperature: 0.6, ...extra,
      }),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('HTTP ' + r.status + ' ' + (j.error?.message || JSON.stringify(j).slice(0, 120)));
    const msg = j?.choices?.[0]?.message;
    const content = msg?.content || '';
    if (!content) throw new Error('empty content (reasoning_len=' + String(msg?.reasoning_content || msg?.reasoning || '').length + ')');
    return content;
  } finally { clearTimeout(timer); }
}

/** Gemini（systemInstruction + user）。 */
async function geminiChat(label, model, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${E}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemFor(label) }] },
        contents: [{ parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.6 },
      }),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('HTTP ' + r.status + ' ' + (j.error?.message || '').slice(0, 120));
    const t = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!t) throw new Error('empty');
    return t;
  } finally { clearTimeout(timer); }
}

/** ollama /api/generate（system + prompt）。 */
async function ollamaChat(label, model, timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS) || 180000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, system: systemFor(label), prompt: question, stream: false, think: false, options: { temperature: 0.6, num_predict: 1600 } }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return (j.response || '').trim();
  } finally { clearTimeout(timer); }
}

/** @type {{label:string, run:()=>Promise<string>}[]} */
const members = [];
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const NV = 'https://integrate.api.nvidia.com/v1/chat/completions';
const OR = 'https://openrouter.ai/api/v1/chat/completions';
if (G) members.push({ label: 'groq/gpt-oss-120b', run: () => openaiChat('groq/gpt-oss-120b', GROQ, G, 'openai/gpt-oss-120b', { reasoning_effort: 'low' }) });
if (G) members.push({ label: 'groq/llama-3.3-70b', run: () => openaiChat('groq/llama-3.3-70b', GROQ, G, 'llama-3.3-70b-versatile') });
if (N) members.push({ label: 'nvidia/qwen3.5-122b', run: () => openaiChat('nvidia/qwen3.5-122b', NV, N, 'qwen/qwen3.5-122b-a10b', { chat_template_kwargs: { thinking: false } }) });
if (E) members.push({ label: 'gemini-2.5-flash', run: () => geminiChat('gemini-2.5-flash', 'gemini-2.5-flash') });
if (O) members.push({ label: 'openrouter/gpt-oss-120b', run: () => openaiChat('openrouter/gpt-oss-120b', OR, O, 'openai/gpt-oss-120b:free', { reasoning_effort: 'low' }) });

const LOCAL_DEFAULT = ['gpt-oss:20b', 'qwen3.5:9b', 'qwen3:14b', 'deepseek-r1:14b', 'gemma4:31b', 'qwen2.5:14b', 'hermes3:8b'];
const localModels = (process.env.MEETING_LOCAL_MODELS || LOCAL_DEFAULT.join(','))
  .split(',').map(s => s.trim()).filter(Boolean);
for (const m of localModels) {
  members.push({ label: `local/${m}`, run: () => ollamaChat(`local/${m}`, m) });
}

console.error(`会議メンバー ${members.length}体（役割注入ON）に並列で問い合わせ中...`);
for (const m of members) console.error(`  - ${m.label}  → 役割: ${ROLE_LABEL[roleOf(m.label)]}`);
console.error('');

const t0 = Date.now();
const settled = await Promise.allSettled(members.map(async m => {
  const s = Date.now();
  const answer = await m.run();
  return { label: m.label, role: roleOf(m.label), roleLabel: ROLE_LABEL[roleOf(m.label)], ms: Date.now() - s, answer };
}));

const results = settled.map((r, i) => r.status === 'fulfilled'
  ? r.value
  : { label: members[i].label, role: roleOf(members[i].label), roleLabel: ROLE_LABEL[roleOf(members[i].label)], ms: 0, answer: '', error: String(r.reason?.message || r.reason).slice(0, 200) });

for (const r of results) {
  console.log('\n' + '='.repeat(72));
  console.log(`### ${r.label}  [${r.roleLabel}]  (${r.ms}ms)${r.error ? '  [FAILED: ' + r.error + ']' : ''}`);
  console.log('='.repeat(72));
  console.log(r.answer || '(no answer)');
}
console.error(`\n--- 完了 ${Date.now() - t0}ms ・ 成功 ${results.filter(r => !r.error).length}/${results.length} ---`);

if (outPath) {
  writeFileSync(outPath, JSON.stringify({ question, results, at: new Date().toISOString() }, null, 2), 'utf8');
  console.error('保存: ' + outPath);
}
