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
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'node:fs';
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
    // 無料枠のみ対象。
    // ★2026-08-29 修正: 従来は「pricingが全て"0"」も無料とみなしていたが、
    //  **OpenRouterのpricing表示は当てにならない**。実測で `~z-ai/glm-latest` は
    //  pricing {prompt:"0", completion:"0"} と表示されながら、実際に呼ぶと
    //  usage.cost=0.0002906 が計上された（残高が実際に減る）。この日の日報は
    //  それを新着候補の筆頭として推薦しており、鵜呑みにすれば無料前提の会議に
    //  課金モデルが混入するところだった（恒久ルール1「card-free無料枠を公式で確認」違反）。
    //  一方 `:free` サフィックス付きは実測で usage.cost=0 を確認済み
    //  （採用中の nvidia/nemotron-3-ultra-550b-a55b:free で確認）。
    //  よって **:free サフィックスのみを信頼**する。pricing="0" だけの根拠は捨てる。
    //  なお `~` で始まるIDは「常に最新版を指すエイリアス」（12件存在）。11件は価格が
    //  明示されているので従来ロジックでも除外されていた。危険なのは0表示の1件だけだった。
    const free = (j.data || []).filter((m) => /:free$/.test(m.id || ''));
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
// 2026-08-19 補足: OCR系は候補選抜(EXCLUDE_RE)で除外するようにした。「フィルタは不要」は
// カタログ取得層の話であり今も維持（健康診断・差分計算の分母は全量のまま）。候補層は
// 元からEXCLUDE_REで非チャット(embed/whisper/tts等)を落としており、ocr追加はその抜けの補完。
async function listMistral() {
  if (!MI) return { ok: false, models: [], error: '未設定' };
  try {
    const r = await fetch('https://api.mistral.ai/v1/models', {
      headers: { Authorization: 'Bearer ' + MI }, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    const models = (j.data || []).map((m) => m.id);
    // 2026-08-13 追加: deprecation（提供終了予告）を拾う。devstral-mediumが「カタログにも
    // 実疎通にも異常が無いまま、期限だけが事前告知されて死ぬ」6番目の死型を実証したため
    // （既存の2系統=カタログ照合/liveProbeはどちらも事後型で、この型には終了当日まで
    // 緑を報告し続ける設計だった）。deprecationフィールドはMistralで実在を確認した
    // 観測事実であり、他プロバイダの/modelsに同種フィールドがあるかは不明。確認できた
    // プロバイダから個別に足す（liveProbe導入時と同じ「実証されたものにだけ付ける」流儀）。
    // 無いプロバイダを「期限なし」と誤読しないよう、日報側で監視対象の分母を必ず明示する。
    // -latestエイリアスのエントリにも中身のdeprecationが載ることを実測で確認済み
    // （devstral-medium-latest自体に期限が付いていた）＝rawIdが-latestの既存2体もこの監視で
    // カバーされる（固定ID化の改修は不要）。
    const deprecations = {};
    for (const m of (j.data || [])) {
      if (m.deprecation) deprecations[m.id] = { at: m.deprecation, replacement: m.deprecation_replacement_model || null };
    }
    // 2026-08-13 追加: aliasesも返す（下記の採用済み判定のalias展開用）。フィールドを
    // 持たないプロバイダは返さなくてよい（受け側がfail-openで素通しする）。
    const aliasGroups = (j.data || [])
      .map((m) => [m.id, ...(m.aliases || [])])
      .filter((g) => g.length > 1);
    return { ok: true, models, deprecations, aliasGroups };
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
    // ★2026-08-31 修正: 失敗時は**エラー本文**をsnippetに載せる。
    //  従来は choices[0].message.content だけを見ており、非200のときは choices が無いので
    //  **snippetが常に空**だった。その結果「有料化疑い」の判定(paid plan等の文字列マッチ)は
    //  導入以来一度も発火し得なかった＝死んだ判定だった。実際 2026-08-31 に
    //  mistral-large-latest が 403 tier_not_allowed になった日、日報は何も警告しなかった。
    //  プロバイダごとにエラー形が違うので順に拾う（Mistral/OpenAI系は error.message か
    //  トップレベル message、Cloudflare は errors[].message）。
    const text = r.ok
      ? (j?.choices?.[0]?.message?.content || j?.choices?.[0]?.message?.reasoning_content || '')
      : (j?.error?.message || j?.message || j?.errors?.[0]?.message || JSON.stringify(j).slice(0, 200));
    return { status: r.status, ms, snippet: String(text).slice(0, 200) };
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
// 2026-08-19: ocr を追加。mistral-ocr系7件(実体3グループ)が候補として溜まり、1日5枠しか
// 無いプローブ枠を燃やした実測を受けて（OCRはchat/completions対象の頭脳ではなく会議
// メンバーに成り得ない。INTEREST_REが"mistral"部分一致で拾ってしまうため除外側で止める）。
// カタログ取得(listMistral)側は従来どおり無フィルタ＝健康診断・差分計算の分母は全量のまま。
const EXCLUDE_RE = /embed|whisper|tts|audio|guard|rerank|vision|clip|image|sdxl|flux|moderation|ocr/i;
const INTEREST_RE = /llama|qwen|deepseek|nemotron|glm|kimi|mistral|gemma|gpt-oss|command|phi/i;

function estimateParamsB(modelId) {
  const m = String(modelId).match(/(\d+)b/i);
  return m ? Number(m[1]) : 0;
}
/**
 * 未採用候補をaliasグループ単位で1件に折りたたむ（2026-08-19追加）。
 * adoptedRawIdsのalias展開(2026-08-13)は「採用中モデルの別名」しか除けず、未採用モデル同士の
 * 別名重複は全部候補に残る設計だった。実害(2026-08-19実測): mistral-mediumの別名6件が
 * 新着候補5枠を全部埋め、同日のプローブ5回がすべて同一モデルに燃えた。pending22件の実体は
 * 8グループしかなく、本来検討すべき未検討グループが永久に順番待ちになる構造。
 * 代表IDは「候補内に実在するID」のうち日付入り固定ID(-2508/-2604等)を優先し、複数あれば
 * 最新を選ぶ: -latestエイリアスは死を防がず(devstral-medium-latest自体に期限が付いていた
 * 実測・2026-08-13)、無通知の中身差し替えで「プローブした個体」と「採用検討する個体」が
 * 食い違う害だけが残るため(codestral採用時の固定ID推奨と同じ流儀)。固定IDが無いグループは
 * pending最古(元の並び順先頭)を残す。グループ全体からでなく候補内から代表を選ぶのは、
 * 濾過済みのIDを候補へ再注入しないため(fail-closed)。
 * aliasGroupsを返すのは現状mistralのみ。返さないプロバイダの候補は素通し
 * (adopted側のalias展開と同じfail-open)。mistralの取得に失敗した日はグループ情報が無く
 * 折りたたみ不能だが、pendingは前回実行の書き込み時点で既に代表のみへ収縮済みのため
 * 再膨張しない(fresh側も取得失敗日はdiffs不成立で増えない)。
 * @param {Array<{provider:string,modelId:string}>} candidates フィルタ済み候補（pending+新着）
 * @param {Object} fetchResults プロバイダ別の一覧取得結果
 * @returns {Array<{provider:string,modelId:string,aliasCount:number}>} グループ代表のみの候補列
 */
function collapseAliasCandidates(candidates, fetchResults) {
  // id→所属グループ(Set)。Mistralの/v1/modelsは同一モデルの各エントリがそれぞれ自分視点の
  // aliases列を返すため、同じモデルのグループが部分集合として複数回現れる。重なったら合流する。
  const groupOf = {}; // provider -> Map(id -> Set)
  for (const [provider, result] of Object.entries(fetchResults)) {
    const map = new Map();
    for (const group of (result.aliasGroups || [])) {
      const merged = new Set(group);
      for (const id of group) for (const x of (map.get(id) || [])) merged.add(x);
      for (const id of merged) map.set(id, merged);
    }
    groupOf[provider] = map;
  }
  const isFixedId = (id) => /-\d{4}$/.test(id); // 日付入り固定ID(-2508等)の緩い判定
  const kept = [];               // グループ代表（候補の元の並び順を保つ）
  const byGroup = new Map();     // グループSet(参照) -> keptのindex
  for (const c of candidates) {
    const group = groupOf[c.provider]?.get(c.modelId);
    if (!group) { kept.push({ ...c, aliasCount: 1 }); continue; } // グループ情報なし＝素通し
    const idx = byGroup.get(group);
    if (idx === undefined) {
      byGroup.set(group, kept.length);
      kept.push({ ...c, aliasCount: 1 });
      continue;
    }
    const cur = kept[idx];
    const n = cur.aliasCount + 1;
    // 代表の入れ替え: 固定IDが非固定IDに勝つ。固定ID同士は新しい方(文字列比較で大きい方)が勝つ。
    if ((isFixedId(c.modelId) && !isFixedId(cur.modelId)) ||
        (isFixedId(c.modelId) && isFixedId(cur.modelId) && c.modelId > cur.modelId)) {
      kept[idx] = { ...c, aliasCount: n };
    } else {
      cur.aliasCount = n;
    }
  }
  return kept;
}

function isCandidateWorthy(modelId) {
  if (EXCLUDE_RE.test(modelId)) return false;
  const params = estimateParamsB(modelId);
  return params >= 70 || INTEREST_RE.test(modelId);
}

// ── state.json の読み書き ──────────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { firstRun: true, catalogs: {}, deprecations: {}, adoptedHealth: {}, pendingCandidates: [], lastRunAt: null };
  }
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    console.error('[scout] state.json が壊れています。初回シードとして扱います。');
    return { firstRun: true, catalogs: {}, deprecations: {}, adoptedHealth: {}, pendingCandidates: [], lastRunAt: null };
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
  // 2026-08-13 追加: 提供終了予告の保持。catalogsと同じくfail-closed（取得失敗日は前回値を
  // そのまま残す）。catalogs側の配列形式は差分計算が依存しているので触らず、別マップで持つ。
  const newDeprecations = { ...(state.deprecations || {}) };
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
    // deprecationsを返さないプロバイダ（現状mistral以外の6社）は空オブジェクトになる。
    // 「フィールドが無い＝期限なし」と誤読しないよう、日報の見出しに監視対象の分母を出す。
    newDeprecations[name] = result.deprecations || {};
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
    const snippet = String(probe.snippet || '');
    // ★2026-08-31: 課金要求(=無料枠から外れた)は **初回で即警告**する。
    //  従来は streak>=2 一律で、2026-08-31 に mistral-large-latest が
    //  403 "This model is not available in your subscription tier" (tier_not_allowed)
    //  になった日、streak=1 のため**日報に一切出なかった**（司令塔が手で叩いて発見）。
    //  429(容量枯渇)は待てば戻るので2日連続を待つ意味があるが、402/403の課金要求は
    //  **待っても戻らない**うえ、放置すると会議のたびに必ず落ちる死に枠が席を占める。
    //  区別して即出しする。tier_not_allowed / subscription tier も判定語に追加
    //  （従来の paid plan / workers free plan だけでは Mistral の文言を拾えなかった）。
    const paywalled = /paid plan|workers free plan|tier_not_allowed|subscription tier/i.test(snippet)
      || probe.status === 402;
    if (paywalled || streak >= 2) {
      const kind = paywalled ? '有料化(無料枠から外れた)' : '疎通不能';
      healthAlerts.push({ label: entry.label, streak, probeStatus: probe.status, kind: 'live', liveKind: kind, snippet: snippet.slice(0, 80) });
    }
  }

  // 3c. 提供終了予告チェック（2026-08-13追加・期限監視の対応プロバイダ: mistralのみ）。
  // カタログ照合(3)も実疎通(3b)も「既に死んだ/死にかけ」の事後検知。deprecationは
  // 唯一の事前検知シグナルで、後継の育成（昇格基準=7日以上空けた実会議2回）に必要な
  // リードタイムを確保できる。アラート閾値は設けない: Mistralの予告は今回18日前で、
  // 閾値を置くと発火時点で既に育成期間が足りない。期限が付いた時点から毎日
  // カウントダウンを出す（採用中モデルに期限が付くのは稀。毎日出てうるさいなら
  // それは対処が遅れているサインそのもの）。
  const deprecationAlerts = [];
  for (const entry of LINEUP) {
    const depMap = newDeprecations[entry.provider] || {};
    const dep = depMap[entry.rawId] || depMap[entry.apiModel];
    if (!dep) continue;
    const daysLeft = Math.ceil((Date.parse(dep.at) - Date.now()) / 86400000);
    deprecationAlerts.push({ label: entry.label, at: String(dep.at).slice(0, 10), daysLeft, replacement: dep.replacement });
  }

  // 4. 候補選抜（新着のうちヒューリスティクス通過分。pendingCandidatesと合流し上限5件）
  const adoptedRawIds = new Set(
    LINEUP.filter((e) => e.rawId).map((e) => e.rawId),
  );
  // 2026-08-13 追加: 採用済み判定をalias展開後に行う。従来はrawId文字列の単純一致のみで、
  // 採用中モデルの別名が「新着候補」として報告されていた（2026-08-13にmistral-code-agent-latest
  // =当時採用中だったdevstral-2512の別名で実際に発生し、司令塔が採用検討に時間を使った実害）。
  // Mistralはalias IDを今後も鋳造し続けるため、初出のたびに同じ時間が燃える。
  // プロバイダごとにaliasesフィールドの有無が違うため、listXxxがaliasGroupsを返した場合のみ
  // 展開する（返さない6プロバイダは挙動不変のfail-open）。
  for (const result of Object.values(fetchResults)) {
    for (const group of (result.aliasGroups || [])) {
      if (group.some((id) => adoptedRawIds.has(id))) {
        for (const id of group) adoptedRawIds.add(id);
      }
    }
  }
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
  // 2026-08-13: alias展開は新着(diff.added)だけでなく、既にpendingへ溜まった持ち越し分にも
  // 効かせる。pendingは差分検知の時点で採用済みでなかったものが積まれ続けるため、後から
  // 採用したモデルの別名が居座り、毎日プローブされ推奨アクションにも出てしまう
  // （実際にcodestral-2508の採用直後、その別名 mistral-code-latest が推奨に出続けた）。
  const allCandidates = [...pending, ...freshCandidates.filter(
    (c) => !pending.some((p) => p.provider === c.provider && p.modelId === c.modelId),
  )].filter((c) => !adoptedRawIds.has(c.modelId))
    // 2026-08-13: 提供終了予告が付いているモデルは候補から外す。実際に本日、撤去したばかりの
    // devstralの別名(mistral-code-agent-latest・deprecation 2026-08-31)が推奨アクションに
    // 「採用すべきか」として出てきた——司令塔が今日踏んだ罠(期限付きモデルの採用)を、
    // scoutが毎日勧め続ける構造になっていた。期限付きを新規に採用する理由は無い。
    .filter((c) => !((newDeprecations[c.provider] || {})[c.modelId]));
  // 2026-08-19: ヒューリスティクスをpendingの持ち越し分にも遡及適用する。EXCLUDE_REを後から
  // 強化しても(今回のocr追加)、既にpendingへ積まれた分には効かず居座り続けるため
  // (adoptedRawIdsのalias展開をpendingにも効かせた2026-08-13の判断と同じ構図)。
  const worthyCandidates = allCandidates.filter((c) => isCandidateWorthy(c.modelId));
  // 2026-08-19: 未採用候補同士のalias重複排除（詳細はcollapseAliasCandidatesのコメント参照）。
  // 既存フィルタの後に置くこと必須——先に折りたたむと、deprecation付きの別名が代表に選ばれ得る。
  const grouped = collapseAliasCandidates(worthyCandidates, fetchResults);
  const toProbe = grouped.slice(0, 5);
  const carryOver = grouped.slice(5);

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
    catalogCheckedCount, liveProbeCheckedCount, outOfScopeCount, deprecationAlerts,
    meetingStats: summarizeMeetingRecords(30),
  });

  if (DRY_RUN) {
    console.log(brief);
    process.exit(0);
  }

  // 7. state更新（成功分のみ反映済みの newCatalogs をそのまま採用）
  const newState = {
    firstRun: false,
    catalogs: newCatalogs,
    deprecations: newDeprecations,
    adoptedHealth: health,
    // aliasCountは実行のたびにaliasGroupsから再計算されるため、stateには持たせない
    // (スキーマを増やさない。書き込むのは折りたたみ後の代表のみ＝取得失敗日の再膨張防止)。
    pendingCandidates: carryOver.map(({ provider, modelId }) => ({ provider, modelId })),
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
/**
 * 実会議の記録(council/*.json)から直近N日のメンバー別 発言数/失敗数 を集計する（2026-08-16追加）。
 * 動機: 84件の実績が「あるのに誰も見ていない」状態で、その間 groq/compound が
 * 9回中9回失敗し続けていた（会議のたびに必ず落ちる死に枠が現役で在籍していた）。
 * 日報に毎日1表出しておけば、次の「死に枠」は撤去済みモデルのノイズに埋もれず見つかる。
 * 直近30日で切る理由: 全期間集計だと撤去済みメンバー（qwen3.5-122b 24%等）が上位を占めて
 * 現役の異常が霞むため（実際84件の失敗36件はその過半が撤去済みメンバー由来だった）。
 * 何も自動では変えない——判断材料を人間に出すだけ（既存healthAlertsと同じ流儀）。
 * @param {number} days 集計対象の日数
 */
function summarizeMeetingRecords(days = 30) {
  // 2026-08-25: 直下(人間が名付けた正式記録)に加えて council/auto/(meeting.mjsの自動記録)も見る。
  //  それまでは直下だけを見ており、--out を付けた会議しか記録されないため最新が2026-08-04で
  //  止まっていた。auto/ の導入で毎回の会議が残るようになったのでここも2階層見る。
  //  再帰はしない: 深さを増やすと将来どこかのサブディレクトリを巻き込む事故が起きるため、
  //  「直下」と「auto」の2つだけを固定で見る。
  const dirs = [join(REPO_ROOT, 'council'), join(REPO_ROOT, 'council', 'auto')].filter((d) => existsSync(d));
  if (!dirs.length) return { total: 0, rows: [], files: 0 };
  const since = Date.now() - days * 86400000;
  const byLabel = {};
  let total = 0, files = 0;
  for (const dir of dirs) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let j;
    try { j = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    // recordのat（ISO文字列）で期間を絞る。at が無い旧形式はファイル更新時刻で代用。
    const at = Date.parse(j.at || '') || (() => { try { return statSync(join(dir, f)).mtimeMs; } catch { return 0; } })();
    if (!at || at < since) continue;
    files++;
    for (const key of Object.keys(j.rounds || {})) {
      for (const r of (j.rounds[key] || [])) {
        if (!r || !r.label) continue;
        // 「[統合]」等の付与ラベルは素のメンバー名に寄せる（同一モデルの実績を分断しない）。
        const label = String(r.label).replace(/\s*\[[^\]]+\]\s*$/, '');
        byLabel[label] = byLabel[label] || { n: 0, ng: 0 };
        byLabel[label].n++; total++;
        if (r.error) byLabel[label].ng++;
      }
    }
  }
  }
  // 2026-08-21追加: 現行LINEUPに実在するメンバーだけを表に出す。
  //  動機: 直近30日で切っても「窓の内側で撤去された」メンバーは残り続ける。実際この日の
  //  日報は groq/compound（08-16撤去）を失敗率100%、groq/llama-3.3-70b（08-18撤去）を
  //  0%で堂々と載せていた。どちらも既に居ないので、読んだ人間は実在しない異常を追いかける。
  //  ＝「集計は正しいが対象が撤去済み」型の誤診。この型は今回で5回目なので、人間が毎回
  //  突き合わせるのをやめ、ツール側で構造的に潰す。
  //  落とすのでなく retired フラグを付けて件数だけ残す: 黙って消すと「集計に出ない＝健康」
  //  と読める偽の安心が生まれるため（fail-closed の流儀。撤去済みだと明記して除外する）。
  const liveLabels = new Set(LINEUP.map((m) => m.label));
  const all = Object.entries(byLabel)
    .map(([label, v]) => ({ label, n: v.n, ng: v.ng, rate: v.n ? v.ng / v.n : 0, retired: !liveLabels.has(label) }))
    .sort((a, b) => b.rate - a.rate || b.n - a.n);
  const rows = all.filter((r) => !r.retired);
  const retiredCount = all.length - rows.length;
  return { total, rows, files, retiredCount };
}

function buildBrief({ date, isFirstRun, fetchStatus, healthAlerts, probedCandidates, referenceCounts, carryOverCount, newCatalogs, catalogCheckedCount, liveProbeCheckedCount, outOfScopeCount, deprecationAlerts, meetingStats }) {
  const lines = [];
  lines.push(`# Council Scout 日報 — ${date}`, '');

  if (isFirstRun) {
    const total = Object.values(newCatalogs).reduce((sum, arr) => sum + (arr?.length || 0), 0);
    lines.push('## 初回実行', `初回: ${total}件をベースライン登録しました。次回以降、差分だけ報告します。`, '');
  }

  // 2026-07-31追加: 「✅ 消滅疑いなし」は「監視している範囲では」という限定付きの主張。
  // 分母（カタログ照合・実疎通・対象外の内訳）を必ず明示する（緑の報告には分母を付ける）。
  // 2026-08-13追加: 期限監視(deprecation)の分母も出す。現状mistralの/v1/modelsだけが
  // deprecationフィールドを返すことを実測で確認済みで、他6プロバイダは「期限なし」ではなく
  // 「未確認」である。この区別を消さないために監視対象プロバイダ名を明示する。
  lines.push(`## 採用中ラインナップ健康診断（${LINEUP.length}体: カタログ照合${catalogCheckedCount}・実疎通${liveProbeCheckedCount}・対象外${outOfScopeCount}・期限監視はmistralのみ）`);
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
  // 提供終了予告（事前検知）。公式指定の代替はあくまで参考——恒久ルール2の実機裏取りを
  // 経ずに採用してはならない（mistral-medium-3-5が公式代替なのに503頻発だった実例あり）。
  for (const a of (deprecationAlerts || [])) {
    lines.push(`- ⏳ ${a.label}: 提供終了予告 ${a.at}（あと${a.daysLeft}日）${a.replacement ? `。公式代替: ${a.replacement}（未検証・実機裏取り必須）` : ''}。後継の採用会議へ`);
  }
  lines.push('');

  lines.push('## 新着候補（プローブ済み）');
  if (!probedCandidates.length) {
    lines.push('候補なし。');
  } else {
    lines.push('| モデル | プロバイダ | プローブ | 所感メモ欄 |', '|---|---|---|---|');
    for (const c of probedCandidates) {
      // 2026-08-19: alias集約時は代表であることを明示する（人間が別名の存在を知らずに
      // 同系IDを二重検討しないため。代表は日付固定ID優先＝プローブした個体そのものを検討できる）。
      const aliasNote = (c.aliasCount || 1) > 1 ? `（別名${c.aliasCount - 1}件を集約）` : '';
      lines.push(`| ${c.modelId}${aliasNote} | ${c.provider} | ${c.probe.status} / ${c.probe.ms}ms | （空欄＝人間用） |`);
    }
  }
  if (carryOverCount > 0) lines.push('', `未処理: ${carryOverCount}件（次回に持ち越し）`);
  lines.push('');

  const refTotal = Object.values(referenceCounts).reduce((a, b) => a + b, 0);
  if (refTotal > 0) {
    const breakdown = Object.entries(referenceCounts).filter(([, n]) => n > 0).map(([p, n]) => `${p} ${n}`).join(', ');
    lines.push(`## 新着（参考・候補基準未満）: ${refTotal}件（${breakdown}）`, '');
  }

  // 2026-08-16追加: 実会議の成績（council/*.json の直近30日）。カタログ健康診断が
  // 「呼べるか」を見るのに対し、こちらは「会議で実際に使えているか」を見る別軸。
  // groq/compoundは9回中9回413で落ちながら現役だった——カタログ上は健全だったため、
  // この軸が無いと永久に気づけない型の異常だった。
  // ★2026-08-25: 0件でも節を消さない。従来は files > 0 で節ごと出し分けており、
  //  記録が途切れると「実会議の成績」という見出しが**丸ごと消える**＝読んだ人間は
  //  異常なしと誤読する（最悪の消え方）。実際、--out 無しの会議が記録されないため
  //  最新記録が2026-08-04で止まり、2026-09-03にこの節が消える寸前だった。
  //  計器が死んだことは、メンバーが死んだことの次に重い。必ず見えるように出す。
  if (meetingStats && meetingStats.files > 0) {
    lines.push(`## 実会議の成績（直近30日・${meetingStats.files}会議 / ${meetingStats.total}発言）`);
    lines.push('| メンバー | 発言 | 失敗 | 失敗率 |', '|---|---|---|---|');
    for (const r of meetingStats.rows.filter((x) => x.n >= 3).slice(0, 10)) {
      lines.push(`| ${r.label} | ${r.n} | ${r.ng} | ${(r.rate * 100).toFixed(0)}% |`);
    }
    lines.push('', '※ 発言3回未満は割愛。撤去の目安は「発言10回以上で失敗率50%以上」（下の推奨アクション参照）。'
      + (meetingStats.retiredCount ? `\n※ 撤去済みメンバー${meetingStats.retiredCount}体分の実績は除外した（現行LINEUPに居ないため追いかけても意味がない）。` : ''), '');
  } else {
    lines.push('## 実会議の成績（直近30日）');
    lines.push('- ⚠ 会議記録が0件。**メンバーが健全という意味ではなく、測れていないという意味**。');
    lines.push('  meeting.mjs は council/auto/ に毎回自動保存する（COUNCIL_NO_RECORD=1 で無効化される）。');
    lines.push('  会議を実際に回していないだけなら正常。回しているのに0件なら記録側の故障を疑う。', '');
  }

  lines.push('## 取得状況');
  for (const [name, s] of Object.entries(fetchStatus)) {
    lines.push(s.ok ? `- ✅ ${name}（${s.count}件）` : `- ⚠ ${name}: ${s.error}（＝情報無し。変化無しの意味ではない）`);
  }
  lines.push('');

  lines.push('## 推奨アクション');
  // 2026-08-13: 提供終了予告を新着候補より優先する。新着は「増やす機会」だが期限は
  // 「減る確定」であり、後継育成(昇格基準=7日以上空けた実会議2回)のリードタイムを
  // 食い潰すため時間的な締切がある方を先に出す。
  // 2026-08-16: 実会議で壊れているメンバーは、期限予告と同格の「確定した損失」として
  // 新着候補より優先する（発言10回以上で失敗率50%以上＝偶然では説明できない水準）。
  const broken = (meetingStats?.rows || []).find((r) => r.n >= 10 && r.rate >= 0.5);
  if (broken) {
    lines.push(`/council-fable ${broken.label} をラインナップから外すべきか（直近30日で${broken.n}回中${broken.ng}回失敗＝${(broken.rate * 100).toFixed(0)}%。この日報 council-scout/briefs/${date}.md を地雷マップに）`);
  } else if ((deprecationAlerts || []).length > 0) {
    const d = deprecationAlerts[0];
    lines.push(`/council-fable ${d.label} の後継を決める（提供終了 ${d.at}・あと${d.daysLeft}日。この日報 council-scout/briefs/${date}.md を地雷マップに）`);
  } else if (probedCandidates.length > 0) {
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
