#!/usr/bin/env node
/**
 * 会議ハーネス: 同じ問いを「無料クラウド4系統 + ローカル ollama 数体」に並列で投げ、
 * 回答を集めて出力する。司令塔(Claude Code)が集約・裏取りする前提の素材集め用。
 *
 * 使い方:
 *   node scripts/meeting.mjs path/to/question.txt [--out path/to/answers.json]
 *   または node scripts/meeting.mjs --q "問い文字列"
 *
 * キーは User スコープ env から読む(setx 永続済)。Bash は古い環境を引き継ぐので、
 * このスクリプトは process.env を見るだけ。呼ぶ側(PowerShell)が User スコープを
 * Set-Item で現プロセスに流し込んでから node を起動すること。
 *
 * 詳細・動くモデルと罠は memory/reference-free-cloud-llm-apis.md を参照。
 */
import { readFileSync, writeFileSync } from 'node:fs';

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

const G = process.env.GROQ_API_KEY, N = process.env.NVIDIA_API_KEY, O = process.env.OPENROUTER_API_KEY, E = process.env.GEMINI_API_KEY;
// OLLAMA_HOST は "0.0.0.0:11434" のようにスキームなしのことがある → 補う。127.0.0.1 で叩く。
let OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
if (!/^https?:\/\//.test(OLLAMA)) OLLAMA = 'http://' + OLLAMA;
OLLAMA = OLLAMA.replace('0.0.0.0', '127.0.0.1');

/** @typedef {{label:string, run:()=>Promise<string>}} Member */

/** OpenAI互換チャットを叩く。 */
async function openaiChat(url, key, model, extra = {}, timeoutMs = 150000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: question }], max_tokens: 1600, temperature: 0.6, ...extra })
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('HTTP ' + r.status + ' ' + (j.error?.message || JSON.stringify(j).slice(0, 120)));
    const msg = j?.choices?.[0]?.message;
    const content = msg?.content || '';
    if (!content) throw new Error('empty content (reasoning_len=' + String(msg?.reasoning_content || msg?.reasoning || '').length + ')');
    return content;
  } finally { clearTimeout(timer); }
}

/** Gemini を叩く。 */
async function geminiChat(model, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${E}`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: question }] }], generationConfig: { maxOutputTokens: 2048, temperature: 0.6 } })
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error('HTTP ' + r.status + ' ' + (j.error?.message || '').slice(0, 120));
    const t = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!t) throw new Error('empty');
    return t;
  } finally { clearTimeout(timer); }
}

/** ollama /api/generate(stream:false)。spinner汚染を避けるため run でなく API。 */
async function ollamaChat(model, timeoutMs = 180000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: question, stream: false, think: false, options: { temperature: 0.6, num_predict: 1600 } })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return (j.response || '').trim();
  } finally { clearTimeout(timer); }
}

/** @type {Member[]} */
const members = [];
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const NV = 'https://integrate.api.nvidia.com/v1/chat/completions';
if (G) members.push({ label: 'groq/gpt-oss-120b', run: () => openaiChat(GROQ, G, 'openai/gpt-oss-120b', { reasoning_effort: 'low' }) });
if (G) members.push({ label: 'groq/llama-3.3-70b', run: () => openaiChat(GROQ, G, 'llama-3.3-70b-versatile') });
if (N) members.push({ label: 'nvidia/qwen3.5-122b', run: () => openaiChat(NV, N, 'qwen/qwen3.5-122b-a10b', { chat_template_kwargs: { thinking: false } }) });
if (E) members.push({ label: 'gemini-2.5-flash', run: () => geminiChat('gemini-2.5-flash') });
// OpenRouter は無料枠で 429 が出やすい=予備の1票(reference-free-cloud-llm-apis.md)。
const OR = 'https://openrouter.ai/api/v1/chat/completions';
if (O) members.push({ label: 'openrouter/gpt-oss-120b', run: () => openaiChat(OR, O, 'openai/gpt-oss-120b:free', { reasoning_effort: 'low' }) });
// ローカル(オフライン保険・別頭脳・無料無制限)。ユーザー要望「無料LLM全部使え=コスパ良く良い物」
//   に応え、インストール済みの多様な系統(gpt-oss/qwen/deepseek/gemma/hermes)を全員集合させる。
//   存在しないモデルは ollama が即エラー→該当票が FAILED になるだけ(他は止めない)。
//   MEETING_LOCAL_MODELS=csv で上書き可。既定は実機にある主要モデル。
const LOCAL_DEFAULT = [
  'gpt-oss:20b',
  'qwen3.5:9b',
  'qwen3:14b',
  'deepseek-r1:14b',
  'gemma4:31b',
  'qwen2.5:14b',
  'hermes3:8b'
];
const localModels = (process.env.MEETING_LOCAL_MODELS || LOCAL_DEFAULT.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);
for (const m of localModels) {
  members.push({ label: `local/${m}`, run: () => ollamaChat(m) });
}

console.error(`会議メンバー ${members.length}体に並列で問い合わせ中...\n`);
const t0 = Date.now();
const settled = await Promise.allSettled(members.map(async m => {
  const s = Date.now();
  const answer = await m.run();
  return { label: m.label, ms: Date.now() - s, answer };
}));

const results = settled.map((r, i) => r.status === 'fulfilled'
  ? r.value
  : { label: members[i].label, ms: 0, answer: '', error: String(r.reason?.message || r.reason).slice(0, 200) });

for (const r of results) {
  console.log('\n' + '='.repeat(72));
  console.log(`### ${r.label}  (${r.ms}ms)${r.error ? '  [FAILED: ' + r.error + ']' : ''}`);
  console.log('='.repeat(72));
  console.log(r.answer || '(no answer)');
}
console.error(`\n--- 完了 ${Date.now() - t0}ms ・ 成功 ${results.filter(r => !r.error).length}/${results.length} ---`);

if (outPath) {
  writeFileSync(outPath, JSON.stringify({ question, results, at: new Date().toISOString() }, null, 2), 'utf8');
  console.error('保存: ' + outPath);
}
