#!/usr/bin/env node
/**
 * council-trial.mjs — 会議メンバー候補を「本番と同じ条件」で一斉に試す使い捨て計器。
 *
 * 役割: 各プロバイダのカタログから「名簿(LINEUP)に居ない新顔」を拾い、今の名簿メンバーと
 *       同じ問いを本番条件（OpenAI互換: max_tokens 1600 / temperature 0.6、Gemini: maxOutputTokens 8192）
 *       で1回ずつ投げ、速さ・本文の長さ・空返答かどうかを記録する。
 * 使い方（tsuioku-no-kirameki.com のリポ直下で）:
 *   Invoke-Expression (node scripts/council-env.mjs --ps | Out-String)
 *   node scripts/council-trial.mjs --out council-trial.json   (--only groq,gemini で絞れる)
 * なぜ要るか: scout-models.mjs の --probe-only は "hi" / max_tokens 8 の疎通確認だけで、
 *   「推論で上限を使い切って本文が空」になる推論モデルを見分けられない（10/28 に実証）。
 * 何もしない: 名簿・コードは書き換えない。キーの値は出力しない。
 */
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPO = path.resolve(arg('--repo', '.'));
const OUT = path.resolve(arg('--out', 'council-trial.json'));
const ONLY = arg('--only', ''); // 例: --only groq,gemini
const MODELS = arg('--models', ''); // 例: --models mistral:mistral-large-4,gemini:gemini-3.8-flash（指定時はカタログ探索をせずこれだけ試す）
const DELAY = Number(arg('--delay', '1500')); // 同じプロバイダへ続けて投げる間隔(ms)。Mistral は 429 を踏むので 20000 以上
const TIMEOUT = Number(arg('--timeout', '120000'));
const REPEAT = Number(arg('--repeat', '1')); // 安定性を見るなら 2〜3

const { LINEUP } = await import(pathToFileURL(path.join(REPO, 'scripts/council-lineup.mjs')).href);

const env = process.env;
const K = {
  groq: env.GROQ_API_KEY, nvidia: env.NVIDIA_API_KEY, openrouter: env.OPENROUTER_API_KEY,
  gemini: env.GEMINI_API_KEY, cf: env.CF_WORKERS_AI_TOKEN || env.CLOUDFLARE_API_TOKEN,
  cfAcc: env.CLOUDFLARE_ACCOUNT_ID, sambanova: env.SAMBANOVA_API_KEY, mistral: env.MISTRAL_API_KEY,
};
const redact = (s) => { let t = String(s); for (const v of Object.values(K)) if (v && v.length > 6) t = t.split(v).join('***'); return t; };

const SYSTEM = 'あなたは開発会議のメンバーです。日本語で、結論→理由→懸念の順に、具体的に答えてください。';
const PROMPT = [
  'お題: 個人開発のWebアプリで、AI機能(有料API)の無料枠を「ログインした人に1日5回」にする案があります。',
  '(1) この案の一番の弱点を1つ挙げてください。',
  '(2) 弱点をふさぐ具体策を2つ、実装の手順つきで出してください。',
  '(3) あなたの案が間違っている可能性があるとしたら、どこですか。',
  '400〜800字で。',
].join('\n');

const EXCLUDE = /embed|whisper|tts|guard|safety|ocr|rerank|parse|clip|translate|reward|moderation|voxtral|lyria|banana|imagen|veo|image|audio|live|aqa|vision|vlm|detector|calibration|retriever|nvclip|vila|neva|kosmos|fuyu|deplot|starcoder|codegemma|codellama|llama2|yi-large|dbrx|sea-lion|zamba|minitron|chatqa|recurrentgemma|gemma-2b|phi-3|mixtral|mistral-7b|granite-3\.0|granite-34b|granite-8b|palmyra|riva|cosmos|bolt|melotts|distil|stable|flux|lucid|phoenix|dreamshaper|resnet|detr|m2m|bart|bge|smart-turn|deepgram|aura|nova-3|mistral-small-3\.1|llamaguard|prompt-guard/i;

const lineupIds = new Set(LINEUP.flatMap((e) => [e.rawId, e.apiModel]).filter(Boolean));

async function j(url, init = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs || 20000) });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return { status: r.status, body };
}

// ── カタログ（新顔の発見） ──
async function catalog() {
  const out = { groq: [], gemini: [], nvidia: [], openrouter: [], cloudflare: [], sambanova: [], mistral: [] };
  const notes = {};
  const safe = async (name, fn) => { try { out[name] = await fn(); } catch (e) { notes[name] = redact(e.message || e); } };
  await Promise.all([
    safe('groq', async () => K.groq ? ((await j('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + K.groq } })).body.data || []).map((m) => m.id) : []),
    safe('gemini', async () => K.gemini ? ((await j(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${K.gemini}`)).body.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, '')).filter((id) => /^gemini-([3-9]|\d\d)/.test(id)) : []),
    // NIM の /v1/models は「呼べる一覧」ではない（council-lineup.mjs の注記）。新しい系統だけ明示で試す。
    // 2026-11-11: 404 になった kimi-k2.6・nemotron-3-super を外し、/v1/models で見つけた新顔を足した。
    //  /v1/models の created は全件同じ固定値（1993-04-26）で公開日では絞れない＝この一覧は名前を見て手で足す。
    safe('nvidia', async () => ['mistralai/mistral-large-4-1t-a52b', 'z-ai/glm-5.3-flash', 'stepfun-ai/step-5-preview',
      'minimaxai/minimax-m3.1-flash', 'meta/muse-glimmer-30b', 'poolside/laguna-xs-2.1',
      'nvidia/nemotron-3.5-bolt-e4b', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', 'google/gemma-4-31b-it', 'moonshotai/kimi-k3.1-pro']),
    // OpenRouter は :free だけを信頼する（pricing=0 表示は課金された実例あり）。
    safe('openrouter', async () => ((await j('https://openrouter.ai/api/v1/models')).body.data || []).map((m) => m.id).filter((id) => /:free$/.test(id))),
    safe('cloudflare', async () => {
      if (!K.cf || !K.cfAcc) return [];
      const all = [];
      for (let p = 1; p <= 10; p++) {
        const r = await j(`https://api.cloudflare.com/client/v4/accounts/${K.cfAcc}/ai/models/search?per_page=100&page=${p}`, { headers: { Authorization: 'Bearer ' + K.cf } });
        const b = r.body.result || []; all.push(...b); if (b.length < 100) break;
      }
      return all.filter((m) => /text generation/i.test(m.task?.name || ''))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .map((m) => m.name);
    }),
    safe('sambanova', async () => K.sambanova ? ((await j('https://api.sambanova.ai/v1/models', { headers: { Authorization: 'Bearer ' + K.sambanova } })).body.data || []).map((m) => m.id) : []),
    safe('mistral', async () => K.mistral ? ((await j('https://api.mistral.ai/v1/models', { headers: { Authorization: 'Bearer ' + K.mistral } })).body.data || [])
      .filter((m) => m.capabilities?.completion_chat !== false && !m.deprecation).map((m) => m.id) : []),
  ]);
  return { out, notes };
}

const ENDPOINT = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  cloudflare: () => `https://api.cloudflare.com/client/v4/accounts/${K.cfAcc}/ai/v1/chat/completions`,
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};
const KEYOF = { groq: 'groq', nvidia: 'nvidia', openrouter: 'openrouter', cloudflare: 'cf', sambanova: 'sambanova', mistral: 'mistral' };

async function probe(provider, model, extra = {}) {
  const t0 = Date.now();
  try {
    if (provider === 'gemini') {
      const r = await j(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${K.gemini}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, timeoutMs: TIMEOUT,
        body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], systemInstruction: { parts: [{ text: SYSTEM }] }, generationConfig: { maxOutputTokens: 8192, temperature: 0.6 } }),
      });
      const c = r.body?.candidates?.[0];
      const text = c?.content?.parts?.map((p) => p.text).join('') || '';
      return fin(provider, model, t0, r.status, text, c?.finishReason || '', 0, r.status !== 200 ? r.body?.error?.message : '');
    }
    const url = typeof ENDPOINT[provider] === 'function' ? ENDPOINT[provider]() : ENDPOINT[provider];
    const r = await j(url, {
      method: 'POST', timeoutMs: TIMEOUT,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + K[KEYOF[provider]] },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: PROMPT }], max_tokens: 1600, temperature: 0.6, ...extra }),
    });
    const ch = r.body?.choices?.[0];
    const msg = ch?.message || {};
    const reasoning = msg.reasoning_content || msg.reasoning || '';
    const err = r.status !== 200 ? (r.body?.error?.message || r.body?.errors?.[0]?.message || r.body?.message || r.body?.detail || JSON.stringify(r.body).slice(0, 200)) : '';
    const content = Array.isArray(msg.content) ? msg.content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('') : String(msg.content || '');
    return fin(provider, model, t0, r.status, content, ch?.finish_reason || '', String(reasoning).length, err, r.body?.usage?.cost);
  } catch (e) {
    return fin(provider, model, t0, 0, '', '', 0, e.message || String(e));
  }
}
function fin(provider, model, t0, status, text, finish, reasoningLen, err, cost) {
  const ms = Date.now() - t0;
  const cut = /length|MAX_TOKENS/i.test(finish);
  const verdict = status !== 200 ? 'ERR' : !text.trim() ? (reasoningLen ? 'EMPTY(推論のみ)' : 'EMPTY') : cut ? 'CUT(途中切れ)' : 'OK';
  const rec = { provider, model, status, ms, verdict, len: text.length, finish, reasoningLen, cost: cost ?? null, err: redact(err || '').slice(0, 220), sample: text.slice(0, 700) };
  console.log(`${verdict.padEnd(14)} ${String(status).padEnd(4)} ${String(ms).padStart(6)}ms len=${String(text.length).padStart(5)} ${provider}/${model}${err ? '  ' + rec.err.slice(0, 100) : ''}`);
  return rec;
}

const { out: cat, notes } = MODELS ? { out: {}, notes: {} } : await catalog();
const want = (p) => !ONLY || ONLY.split(',').includes(p);

// 新顔（名簿に無いもの）
const fresh = {};
for (const [p, ids] of Object.entries(cat)) {
  let list = ids.filter((id) => !lineupIds.has(id) && !EXCLUDE.test(id));
  if (p === 'cloudflare') list = list.slice(0, 20);
  if (p === 'groq') list = list.filter((id) => !/^groq\/compound/.test(id)); // compound は撤去済みの経緯あり（名簿の注記）
  fresh[p] = list;
}
// 今の名簿メンバー（比較の基準）
const current = LINEUP.map((e) => ({ provider: e.provider, model: e.apiModel, extra: { ...(e.opts || {}) }, label: e.label }));

const jobs = {};
if (MODELS) for (const spec of MODELS.split(',')) {
  const [p, ...rest] = spec.split(':'); const id = rest.join(':');
  const cur = current.find((c) => c.provider === p && c.model === id);
  (jobs[p] ||= []).push(cur ? { ...cur, kind: 'current' } : { provider: p, model: id, extra: {}, kind: 'new' });
  if (!cur && /deepseek|qwen3|glm|kimi|nemotron|step|minimax|magistral|reason|think/i.test(id) && p !== 'gemini') jobs[p].push({ provider: p, model: id, extra: { chat_template_kwargs: { enable_thinking: false } }, kind: 'new(推論オフ)' });
  if (!cur && /gpt-oss/i.test(id)) jobs[p].push({ provider: p, model: id, extra: { reasoning_effort: 'low' }, kind: 'new(effort=low)' });
}
if (!MODELS) for (const c of current) if (want(c.provider) && c.provider !== 'anthropic') (jobs[c.provider] ||= []).push({ ...c, kind: 'current' });
if (!MODELS) for (const [p, ids] of Object.entries(fresh)) if (want(p)) for (const id of ids) {
  // 推論モデルは「推論オフ」と「既定」の両方を試す（v4.1-flash は enable_thinking=false 必須だった）
  (jobs[p] ||= []).push({ provider: p, model: id, extra: {}, kind: 'new' });
  if (/deepseek|qwen3|glm|kimi|nemotron|step|minimax|magistral|reason|think/i.test(id) && p !== 'gemini')
    jobs[p].push({ provider: p, model: id, extra: { chat_template_kwargs: { enable_thinking: false } }, kind: 'new(推論オフ)' });
  if (/gpt-oss/i.test(id)) jobs[p].push({ provider: p, model: id, extra: { reasoning_effort: 'low' }, kind: 'new(effort=low)' });
}

console.log('カタログ取得失敗:', JSON.stringify(notes));
console.log('新顔の数:', JSON.stringify(Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, v.length]))));

// プロバイダごとに直列、プロバイダ同士は並列（レート制限を踏まない）
const results = (await Promise.all(Object.entries(jobs).map(async ([p, list]) => {
  const rs = [];
  for (const job of list) for (let i = 0; i < REPEAT; i++) {
    const r = await probe(p, job.model, job.extra);
    rs.push({ ...r, kind: job.kind, label: job.label || null, extra: job.extra, try: i + 1 });
    await new Promise((s) => setTimeout(s, DELAY));
  }
  return rs;
}))).flat();

writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), catalog: cat, fresh, notes, results }, null, 2));
const ok = results.filter((r) => r.kind !== 'current' && r.verdict === 'OK').sort((a, b) => a.ms - b.ms);
console.log('\n=== 新顔で OK だったもの（速い順） ===');
for (const r of ok) console.log(`${String(r.ms).padStart(6)}ms len=${r.len} ${r.provider}/${r.model} ${r.kind}${r.cost ? ' cost=' + r.cost : ''}`);
console.log(`\n書き出し: ${OUT}`);
