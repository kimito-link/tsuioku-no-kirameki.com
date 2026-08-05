#!/usr/bin/env node
/**
 * Council Scout — 会議メンバー名簿（council-lineup.mjs）の「AI社員の日課」化。
 * 設計書: HANDOFF-council-scout-design.md（Fable設計・2026-07-16）。
 *
 * 毎朝1回、5プロバイダ（Groq/Gemini/NVIDIA NIM/OpenRouter/Cloudflare Workers AI）の
 * モデルカタログを取得 → 前回スナップショット(state.json)と差分 → 新着候補だけ
 * 軽量プローブ → 日報(brief)を書いて終わる。
 *
 * 【設計の生命線】scoutは何も決めない。コードも council-lineup.mjs も一切書き換えない。
 * 書き込み先は council-scout/state.json と council-scout/briefs/*.md の2つだけ。
 * 採用判断は既存の3段構え（会議諮問→Fable設計→実装者がLINEUPを編集）に委ねる。
 *
 * 使い方:
 *   node scripts/scout-models.mjs                 # 通常実行（state/brief書き込み）
 *   node scripts/scout-models.mjs --dry-run        # state/brief に書かず stdout に出す
 *   node scripts/scout-models.mjs --probe-only <rawId>  # 手動裏取り用（1モデルだけ軽量プローブ）
 *
 * exit codes: 0=正常（プロバイダ一部失敗を含む） / 2=state・briefの書き込み自体に失敗
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINEUP } from './council-lineup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..'); // パスはスクリプト位置基準（cwd非依存）
const SCOUT_DIR = join(REPO_ROOT, 'council-scout');
const BRIEFS_DIR = join(SCOUT_DIR, 'briefs');
const STATE_PATH = join(SCOUT_DIR, 'state.json');
const LATEST_PATH = join(SCOUT_DIR, 'LATEST.md');
const LOCK_PATH = join(tmpdir(), 'council-scout.lock');
const LOCK_STALE_MS = 30 * 60 * 1000; // 30分超は陳腐化とみなして奪取

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const probeOnlyIdx = args.indexOf('--probe-only');
const PROBE_ONLY = probeOnlyIdx >= 0 ? args[probeOnlyIdx + 1] : null;

const G = process.env.GROQ_API_KEY;
const E = process.env.GEMINI_API_KEY;
const N = process.env.NVIDIA_API_KEY;
const O = process.env.OPENROUTER_API_KEY;
const CF = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACC = process.env.CLOUDFLARE_ACCOUNT_ID;
const SN = process.env.SAMBANOVA_API_KEY;
const MI = process.env.MISTRAL_API_KEY;

function todayJst() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

// ── ロック（scheduled taskの重複発火・手動実行との衝突防止）──────────────────
// 自分が取得したロックだけを解放する（他プロセスのロックを誤って消さないため）。
let lockOwned = false;
function acquireLock() {
  if (existsSync(LOCK_PATH)) {
    try {
      const info = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      const age = Date.now() - (info.at || 0);
      if (age < LOCK_STALE_MS) {
        console.error(`[scout] 既に実行中（pid=${info.pid}, ${Math.round(age / 1000)}秒前に開始）。終了します。`);
        return false;
      }
      console.error('[scout] 陳腐なロックを検出（30分超）。奪取して続行します。');
    } catch { /* 壊れたロックは奪取扱い */ }
  }
  try {
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, at: Date.now() }), 'utf8');
    lockOwned = true;
    return true;
  } catch (e) {
    console.error('[scout] ロック取得に失敗:', e.message);
    return false;
  }
}
function releaseLock() {
  if (!lockOwned) return;
  try { if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH); } catch { /* 無視 */ }
  lockOwned = false;
}
process.on('exit', releaseLock);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { releaseLock(); process.exit(130); });
}

// ── プロバイダごとの一覧APIプラグイン（§2-3・§2-1）──────────────────────────
// 戻り値は必ず {ok, models, error?}。取得失敗は「空一覧」ではなく「情報無し」として
// 呼び出し側が前回値を保持する（fail-closed。ここを混同すると全滅→全deprecated化する）。
async function listGroq() {
  if (!G) return { ok: false, models: [], error: '未設定' };
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: 'Bearer ' + G }, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, models: (j.data || []).map((m) => m.id) };
  } catch (e) { return { ok: false, models: [], error: String(e.message || e) }; }
}
async function listGemini() {
  if (!E) return { ok: false, models: [], error: '未設定' };
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${E}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, models: (j.models || []).map((m) => String(m.name).replace(/^models\//, '')) };
  } catch (e) { return { ok: false, models: [], error: String(e.message || e) }; }
}
async function listNvidia() {
  if (!N) return { ok: false, models: [], error: '未設定' };
  try {
    const r = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { Authorization: 'Bearer ' + N }, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, models: (j.data || []).map((m) => m.id) };
  } catch (e) { return { ok: false, models: [], error: String(e.message || e) }; }
}
async function listOpenRouter() {
  if (!O) return { ok: false, models: [], error: '未設定' };
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    // 無料枠のみ対象（pricingが全て"0" or idに:freeサフィックス）。
    const free = (j.data || []).filter((m) => {
      const p = m.pricing || {};
      const allZero = Object.values(p).every((v) => v === '0' || v === 0 || v === undefined);
      return allZero || /:free$/.test(m.id || '');
    });
    return { ok: true, models: free.map((m) => m.id) };
  } catch (e) { return { ok: false, models: [], error: String(e.message || e) }; }
}
async function listCloudflare() {
  if (!CF || !CF_ACC) return { ok: false, models: [], error: '未設定' };
  const models = [];
  try {
    let page = 1;
    // ページネーション（per_page=100で回す。異常な暴走を避け最大10ページで打ち切る）。
    for (; page <= 10; page++) {
      const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/ai/models/search?per_page=100&page=${page}`;
      const r = await fetch(url, {
        headers: { Authorization: 'Bearer ' + CF }, signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { ok: models.length > 0, models, error: models.length ? undefined : `HTTP ${r.status}` };
      const j = await r.json();
      const batch = (j.result || []).map((m) => m.name || m.id).filter(Boolean);
      models.push(...batch);
      if (batch.length < 100) break; // 最終ページ
    }
    return { ok: true, models };
  } catch (e) { return { ok: models.length > 0, models, error: String(e.message || e) }; }
}
// 2026-07-31 追加: SambaNova Cloud。/v1/models はOpenAI互換形式で返る。
async function listSambanova() {
  if (!SN) return { ok: false, models: [], error: '未設定' };
  try {
    const r = await fetch('https://api.sambanova.ai/v1/models', {
      headers: { Authorization: 'Bearer ' + SN }, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, models: (j.data || []).map((m) => m.id) };
  } catch (e) { return { ok: false, models: [], error: String(e.message || e) }; }
}

// 2026-08-05 追加: Mistral AI La Plateforme。/v1/models はOpenAI互換形式で返る（実機で
// 53体・うちchat系39体を確認）。埋め込み/OCR/音声(voxtral)等の非チャットモデルも同じ
// 一覧に混ざるが、健康診断はLINEUPのrawIdとの突合なのでフィルタは不要（新着候補の
// 提示時に人間が読んで判断する。同じ事情のcloudflare/nvidiaもフィルタしていない）。
async function listMistral() {
  if (!MI) return { ok: false, models: [], error: '未設定' };
  try {
    const r = await fetch('https://api.mistral.ai/v1/models', {
      headers: { Authorization: 'Bearer ' + MI }, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    return { ok: true, models: (j.data || []).map((m) => m.id) };
  } catch (e) { return { ok: false, models: [], error: String(e.message || e) }; }
}

const PROVIDERS = {
  groq: listGroq,
  gemini: listGemini,
  nvidia: listNvidia,
  openrouter: listOpenRouter,
  cloudflare: listCloudflare,
  sambanova: listSambanova,
  mistral: listMistral,
};

// ── 軽量プローブ（§2-2・実際に呼べるかの検証）────────────────────────────────
const PROBE_URL = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  cloudflare: CF_ACC ? `https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/ai/v1/chat/completions` : '',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};
const PROBE_KEY = { groq: G, nvidia: N, openrouter: O, cloudflare: CF, sambanova: SN, mistral: MI };

/** 1モデルに軽量プロンプトを1発投げ、呼べるかだけ検証する。@returns {{status:number|string, ms:number, snippet:string}} */
async function probeModel(provider, modelId) {
  const started = Date.now();
  try {
    if (provider === 'gemini') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${E}`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 8 } }),
      });
      const ms = Date.now() - started;
      const j = await r.json().catch(() => ({}));
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      return { status: r.status, ms, snippet: text.slice(0, 80) };
    }
    const url = PROBE_URL[provider];
    const key = PROBE_KEY[provider];
    if (!url || !key) return { status: 'skip(no-key)', ms: 0, snippet: '' };
    const r = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 8 }),
    });
    const ms = Date.now() - started;
    const j = await r.json().catch(() => ({}));
    const text = j?.choices?.[0]?.message?.content || j?.choices?.[0]?.message?.reasoning_content || '';
    return { status: r.status, ms, snippet: String(text).slice(0, 80) };
  } catch (e) {
    return { status: 'error', ms: Date.now() - started, snippet: String(e.message || e).slice(0, 80) };
  }
}

if (PROBE_ONLY) {
  // 手動裏取り用の最小モード（従来Fableが手で叩いていた作業の代替）。ロック不要・state不変更。
  // --provider 未指定なら LINEUP から rawId/apiModel 一致で推定、それも無ければ groq を既定にする。
  const providerIdx = args.indexOf('--provider');
  const provider = providerIdx >= 0
    ? args[providerIdx + 1]
    : (LINEUP.find((e) => e.rawId === PROBE_ONLY || e.apiModel === PROBE_ONLY)?.provider || 'groq');
  const result = await probeModel(provider, PROBE_ONLY);
  console.log(JSON.stringify({ provider, modelId: PROBE_ONLY, ...result }, null, 2));
  process.exit(0);
}

// ── ヒューリスティクス（§2-4）──────────────────────────────────────────────
const EXCLUDE_RE = /embed|whisper|tts|audio|guard|rerank|vision|clip|image|sdxl|flux|moderation/i;
const INTEREST_RE = /llama|qwen|deepseek|nemotron|glm|kimi|mistral|gemma|gpt-oss|command|phi/i;

function estimateParamsB(modelId) {
  const m = String(modelId).match(/(\d+)b/i);
  return m ? Number(m[1]) : 0;
}
function isCandidateWorthy(modelId) {
  if (EXCLUDE_RE.test(modelId)) return false;
  const params = estimateParamsB(modelId);
  return params >= 70 || INTEREST_RE.test(modelId);
}

// ── state.json の読み書き ──────────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { firstRun: true, catalogs: {}, adoptedHealth: {}, pendingCandidates: [], lastRunAt: null };
  }
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    console.error('[scout] state.json が壊れています。初回シードとして扱います。');
    return { firstRun: true, catalogs: {}, adoptedHealth: {}, pendingCandidates: [], lastRunAt: null };
  }
}
function saveState(state) {
  mkdirSync(SCOUT_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// ── メイン処理 ──────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && !acquireLock()) process.exit(0);

  const date = todayJst();
  const state = loadState();
  const isFirstRun = state.firstRun !== false && Object.keys(state.catalogs || {}).length === 0;

  // 1. 5プロバイダを並列取得
  const fetchResults = {};
  await Promise.all(
    Object.entries(PROVIDERS).map(async ([name, fn]) => { fetchResults[name] = await fn(); }),
  );

  // 2. 差分計算（成功したプロバイダのみ。失敗は前回値を保持=何もしない）
  const newCatalogs = { ...(state.catalogs || {}) };
  const diffs = {}; // provider -> {added: [], removed: []}
  const fetchStatus = {}; // provider -> {ok, count, error}
  for (const [name, result] of Object.entries(fetchResults)) {
    if (!result.ok) {
      fetchStatus[name] = { ok: false, count: (state.catalogs?.[name] || []).length, error: result.error };
      continue; // fail-closed: 前回値をそのまま newCatalogs に残す（何もしない）
    }
    const prevSet = new Set(state.catalogs?.[name] || []);
    const currSet = new Set(result.models);
    const added = result.models.filter((m) => !prevSet.has(m));
    const removed = [...prevSet].filter((m) => !currSet.has(m));
    diffs[name] = { added, removed };
    newCatalogs[name] = result.models;
    fetchStatus[name] = { ok: true, count: result.models.length };
  }

  // 3. 採用中ラインナップの健康診断（カタログ消滅の逆方向検知・§2-5）
  const health = { ...(state.adoptedHealth || {}) };
  const healthAlerts = [];
  let catalogCheckedCount = 0;
  let liveProbeCheckedCount = 0;
  let outOfScopeCount = 0;
  for (const entry of LINEUP) {
    const catalog = newCatalogs[entry.provider];
    if (!catalog || !entry.rawId) { outOfScopeCount++; continue; } // カタログ未取得 or rawId無し(検証対象外)は判定しない
    catalogCheckedCount++;
    const key = `${entry.provider}:${entry.rawId}`;
    const present = catalog.includes(entry.rawId) || catalog.includes(entry.apiModel);
    if (present) {
      if (health[key]) delete health[key]; // 復活したら欠落カウントをリセット
      continue;
    }
    const streak = (health[key]?.missingStreak || 0) + 1;
    health[key] = { missingStreak: streak, lastSeen: health[key]?.lastSeen || date };
    if (streak >= 2) {
      const probe = await probeModel(entry.provider, entry.apiModel);
      healthAlerts.push({ label: entry.label, streak, probeStatus: probe.status, kind: 'catalog' });
    }
  }

  // 3b. 実疎通チェック（liveProbe:true のエントリのみ・2026-07-31追加）。
  // カタログ照合では「一覧に存在するが実際は呼べない」劣化（有料プラン専用化等）を
  // 検知できないため、それが実証されたプロバイダ(Cloudflare)のエントリだけ毎日
  // 1回叩いて確認する。非200が2日連続で続いたらアラート（カタログ消滅と対称の閾値）。
  // 単発失敗で騒がない＝Cloudflareの並列実負荷FAILED実績(2026-06-27)を踏まえた保守設計。
  for (const entry of LINEUP) {
    if (!entry.liveProbe) continue;
    liveProbeCheckedCount++;
    const key = `${entry.provider}:${entry.apiModel}:probe`;
    const probe = await probeModel(entry.provider, entry.apiModel);
    const ok = probe.status === 200;
    if (ok) {
      if (health[key]) delete health[key];
      continue;
    }
    const streak = (health[key]?.probeFailStreak || 0) + 1;
    health[key] = { probeFailStreak: streak, lastSeen: health[key]?.lastSeen || date };
    if (streak >= 2) {
      const snippet = String(probe.snippet || '');
      const kind = /paid plan|workers free plan/i.test(snippet) ? '有料化疑い' : '疎通不能';
      healthAlerts.push({ label: entry.label, streak, probeStatus: probe.status, kind: 'live', liveKind: kind, snippet: snippet.slice(0, 80) });
    }
  }

  // 4. 候補選抜（新着のうちヒューリスティクス通過分。pendingCandidatesと合流し上限5件）
  const adoptedRawIds = new Set(
    LINEUP.filter((e) => e.rawId).map((e) => e.rawId),
  );
  const freshCandidates = [];
  const referenceCounts = {};
  if (!isFirstRun) {
    for (const [provider, diff] of Object.entries(diffs)) {
      const worthy = diff.added.filter((m) => !adoptedRawIds.has(m) && isCandidateWorthy(m));
      const rest = diff.added.filter((m) => !worthy.includes(m));
      referenceCounts[provider] = rest.length;
      freshCandidates.push(...worthy.map((m) => ({ provider, modelId: m })));
    }
  }
  const pending = state.pendingCandidates || [];
  const allCandidates = [...pending, ...freshCandidates.filter(
    (c) => !pending.some((p) => p.provider === c.provider && p.modelId === c.modelId),
  )];
  const toProbe = allCandidates.slice(0, 5);
  const carryOver = allCandidates.slice(5);

  // 5. 候補プローブ
  const probedCandidates = [];
  for (const c of toProbe) {
    const probe = await probeModel(c.provider, c.modelId);
    probedCandidates.push({ ...c, probe });
  }

  // 6. brief生成
  const brief = buildBrief({
    date, isFirstRun, fetchStatus, healthAlerts, probedCandidates,
    referenceCounts, carryOverCount: carryOver.length, newCatalogs,
    catalogCheckedCount, liveProbeCheckedCount, outOfScopeCount,
  });

  if (DRY_RUN) {
    console.log(brief);
    process.exit(0);
  }

  // 7. state更新（成功分のみ反映済みの newCatalogs をそのまま採用）
  const newState = {
    firstRun: false,
    catalogs: newCatalogs,
    adoptedHealth: health,
    pendingCandidates: carryOver,
    lastRunAt: new Date().toISOString(),
  };

  try {
    mkdirSync(BRIEFS_DIR, { recursive: true });
    writeFileSync(join(BRIEFS_DIR, `${date}.md`), brief, 'utf8');
    writeFileSync(LATEST_PATH, brief, 'utf8');
    saveState(newState);
  } catch (e) {
    console.error('[scout] state/brief の書き込みに失敗:', e.message);
    process.exit(2);
  }

  console.error(`[scout] 完了。日報: council-scout/briefs/${date}.md`);
  process.exit(0);
}

/** brief（日報）のMarkdownを組み立てる。カタログのdescription等は信頼できない入力として
 *  引用のみ・指示として解釈しない（インジェクション安全・設計書§4必須要件）。 */
function buildBrief({ date, isFirstRun, fetchStatus, healthAlerts, probedCandidates, referenceCounts, carryOverCount, newCatalogs, catalogCheckedCount, liveProbeCheckedCount, outOfScopeCount }) {
  const lines = [];
  lines.push(`# Council Scout 日報 — ${date}`, '');

  if (isFirstRun) {
    const total = Object.values(newCatalogs).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    lines.push('## 初回実行', `初回: ${total}件をベースライン登録しました。次回以降、差分だけ報告します。`, '');
  }

  // 2026-07-31追加: 「✅ 消滅疑いなし」は「監視している範囲では」という限定付きの主張。
  // 分母（カタログ照合・実疎通・対象外の内訳）を必ず明示する（緑の報告には分母を付ける）。
  lines.push(`## 採用中ラインナップ健康診断（${LINEUP.length}体: カタログ照合${catalogCheckedCount}・実疎通${liveProbeCheckedCount}・対象外${outOfScopeCount}）`);
  if (!healthAlerts.length) {
    lines.push('- ✅ 消滅疑いなし（2日連続でカタログから消えた/実疎通が失敗し続けたモデルはありません）');
  } else {
    for (const a of healthAlerts) {
      if (a.kind === 'live') {
        lines.push(`- ⚠ ${a.label}: 実疎通${a.streak}日連続失敗（${a.liveKind}）。応答: ${a.snippet}。要確認 → 外すなら会議へ`);
      } else {
        lines.push(`- ⚠ ${a.label}: カタログから${a.streak}日連続消滅。プローブ ${a.probeStatus}。要確認 → 外すなら会議へ`);
      }
    }
  }
  lines.push('');

  lines.push('## 新着候補（プローブ済み）');
  if (!probedCandidates.length) {
    lines.push('候補なし。');
  } else {
    lines.push('| モデル | プロバイダ | プローブ | 所感メモ欄 |', '|---|---|---|---|');
    for (const c of probedCandidates) {
      lines.push(`| ${c.modelId} | ${c.provider} | ${c.probe.status} / ${c.probe.ms}ms | （空欄＝人間用） |`);
    }
  }
  if (carryOverCount > 0) lines.push('', `未処理: ${carryOverCount}件（次回に持ち越し）`);
  lines.push('');

  const refTotal = Object.values(referenceCounts).reduce((a, b) => a + b, 0);
  if (refTotal > 0) {
    const breakdown = Object.entries(referenceCounts).filter(([, n]) => n > 0).map(([p, n]) => `${p} ${n}`).join(', ');
    lines.push(`## 新着（参考・候補基準未満）: ${refTotal}件（${breakdown}）`, '');
  }

  lines.push('## 取得状況');
  for (const [name, s] of Object.entries(fetchStatus)) {
    lines.push(s.ok ? `- ✅ ${name}（${s.count}件）` : `- ⚠ ${name}: ${s.error}（＝情報無し。変化無しの意味ではない）`);
  }
  lines.push('');

  lines.push('## 推奨アクション');
  if (probedCandidates.length > 0) {
    const top = probedCandidates[0];
    lines.push(`/council-fable ${top.modelId} をcouncilメンバーに採用すべきか（この日報 council-scout/briefs/${date}.md を地雷マップに）`);
  } else if (healthAlerts.length > 0) {
    lines.push(`/council-fable ${healthAlerts[0].label} をラインナップから外すべきか（この日報を地雷マップに）`);
  } else {
    lines.push('アクション不要。');
  }

  return lines.join('\n') + '\n';
}

main();
