#!/usr/bin/env node
/**
 * live-og-bake.mjs — 配信ごとの OGP カード画像(配信サムネ＋数字帯)を焼いて投入する I/O 係(v0.1.1519)。
 *
 * ■ これは何をするか(設計 §8)
 *   1. 保存済みの一覧を GET(`/api/live-ranking`)。放送中の配信を読む(`?refresh=1` は叩かない)。
 *   2. 配信ごとに:
 *        数字・文字列(0 省略・整形・名前の切り詰め・時刻ラベル)を【Node が src/lib/liveOgStats.js で決める】
 *        → 4 つの数字が全部 0 の配信は焼かない(数字帯に出すものが無い)
 *        → 配信サムネ(thumbnail.large)を fetch(取れない配信はその run で焼かない=サムネ直へ fail-soft)
 *        → plan.json に書く
 *   3. `python3 tools/og-live-compose.py plan.json outdir` を spawnSync(Python は plan の文字列を描くだけ)。
 *   4. 焼けた JPEG を base64 → 1 body にまとめて POST(`?ingest=og-image`・`x-share-key`)。
 *
 * ■ ★秘密を出さない / サムネ URL も出さない(設計 §8)
 *   viewUri / token は扱わない(サムネ URL だけ使う)。★そのサムネ URL も【ログに出さない】。
 *   ここで扱うのは「焼いた画像バイト」だけ。
 *
 * ■ ★純ロジックは src/lib にある。ここに整形式を書き直さない
 *   数字の整形・0 省略  → src/lib/liveOgStats.js(og:description と同じ正本)
 *   名前の切り詰め上限  → src/lib/liveRankingView.js の SHARE_NAME_MAX
 *
 * ■ 使い方
 *   node scripts/live-og-bake.mjs                 … 焼いて POST する(cron の本番動作)
 *   node scripts/live-og-bake.mjs --dry-run       … POST せず outdir に JPEG を残す
 *   node scripts/live-og-bake.mjs --lv lvNNNNNN   … その配信だけ
 *   node scripts/live-og-bake.mjs --limit 3       … 先頭 N 配信だけ
 *
 * ■ 終了コード
 *   0 … POST が 200 かつ stored:true(--dry-run は焼けたら 0)。
 *   1 … 焼けた枚数 0、または POST が 200 でない(::error::)。
 *
 * ■ Python の起動
 *   既定は `python3`(CI=Linux)。環境変数 OG_PYTHON で差し替えられる(ローカル Windows は `python`)。
 *
 * @module live-og-bake
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { liveOgStatItems } from '../src/lib/liveOgStats.js';
import { SHARE_NAME_MAX } from '../src/lib/liveRankingView.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const COMPOSE_PY = join(REPO_ROOT, 'tools', 'og-live-compose.py');

/** ★連絡先を名乗る(tally と同じ形・相手が止められるように)。 */
const UA = 'tsuioku-no-kirameki.com live-ranking (admin@kimito-link.com)';
/** GET 元・POST 先。環境変数で差し替えられる(検証で別環境を指せるように)。 */
const API_BASE = process.env.LIVE_RANKING_API || 'https://app.tsuioku-no-kirameki.com/api/live-ranking';
/** Python の実行コマンド(CI=python3 / ローカル Windows=python)。 */
const PYTHON = process.env.OG_PYTHON || 'python3';
/** サムネ取得 1 本の上限(tally と同じ 8s)。 */
const HTTP_TIMEOUT_MS = 8_000;
/** ピルの固定文言。 */
const PILL_TEXT = '追憶のきらめき ランキング';

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '';
};
const DRY_RUN = hasFlag('dry-run');
const ONLY_LV = String(argOf('lv') || '').trim().toLowerCase();
const LIMIT = Number(argOf('limit')) || 0;

/** 開き括弧が閉じないまま末尾に残っていたら、その括弧以降を落とす(全角（）・半角()両対応)。
 *  例「掲示板（七原君録画＆ミラー再放送」→「掲示板」。切り詰めで括弧の対応が崩れた時だけ効く。 */
function dropDanglingOpenParen(s) {
  const opens = { '（': '）', '(': ')' };
  let depth = 0;
  let lastOpenAt = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (opens[ch]) {
      if (depth === 0) lastOpenAt = i;
      depth++;
    } else if (ch === '）' || ch === ')') {
      if (depth > 0) depth--;
    }
  }
  return depth > 0 && lastOpenAt >= 0 ? s.slice(0, lastOpenAt).trimEnd() : s;
}

/** 名前を SHARE_NAME_MAX で切る(liveRankingView の trimTo と同じ流儀・…で締める)。
 *  切り詰めで開き括弧だけ残ると見栄えが悪いので、その括弧以降を落としてから…を付ける。 */
function trimName(v) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const cp = Array.from(s);
  if (cp.length <= SHARE_NAME_MAX) return s;
  const cut = dropDanglingOpenParen(cp.slice(0, SHARE_NAME_MAX - 1).join(''));
  return `${cut}…`;
}

/** JST の HH:MM 時点 ラベル(★時刻ラベルは scripts 側で作る・設計 §9)。 */
function jstTimeLabel(now) {
  const d = new Date((now || Date.now()) + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} 時点`;
}

/**
 * 1 配信ぶんの plan(描く文字列)を作る。★数字は liveOgStats(og:description と同じ正本)で決める。
 * 4 つの数字が全部 0(items が空)なら null=焼かない。
 * @param {any} live
 * @param {number} now
 * @returns {{ lv: string, streamerLine: string, timeLabel: string, statLines: string[], pillText: string }|null}
 */
function planStringsFor(live, now) {
  const items = liveOgStatItems(live);
  if (!items.length) return null; // 全 0 は焼かない(数字帯に出すものが無い)。
  const by = {};
  for (const it of items) by[it.key] = `${it.label} ${it.text}${it.unit || ''}`;
  // 行1: 来場・コメント / 行2: ギフト・広告(0 省略済み。空行は落とす)。
  const line1 = [by.watch, by.comment].filter(Boolean).join('   ');
  const line2 = [by.gift, by.ad].filter(Boolean).join('   ');
  const statLines = [line1, line2].filter(Boolean);
  const name = trimName(live && live.streamer ? live.streamer.name : '');
  const streamerLine = name ? `${name} の配信` : '';
  return {
    lv: String(live.liveId).toLowerCase(),
    streamerLine,
    timeLabel: jstTimeLabel(now),
    statLines,
    pillText: PILL_TEXT
  };
}

/** サムネ(large)を fetch してローカルに落とす。取れなければ null(その配信は焼かない)。 */
async function downloadThumb(url, outPath) {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const res = await fetch(u, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      redirect: 'follow'
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    writeFileSync(outPath, buf);
    return outPath;
  } catch {
    return null;
  }
}

/** @returns {Promise<any[]>} 保存済みの放送中一覧。読めなければ throw。 */
async function loadLives() {
  const res = await fetch(API_BASE, {
    headers: { accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`GET ${res.status}`);
  const data = await res.json();
  return data && Array.isArray(data.lives) ? data.lives : [];
}

async function main() {
  const t0 = Date.now();
  /** @type {any[]} */
  let lives = [];
  try {
    lives = await loadLives();
  } catch (e) {
    console.log(`::error::一覧を読めませんでした: ${String(e && e.message ? e.message : e)}`);
    process.exitCode = 1;
    return;
  }
  if (ONLY_LV) lives = lives.filter((l) => String(l && l.liveId || '').toLowerCase() === ONLY_LV);
  if (LIMIT > 0) lives = lives.slice(0, LIMIT);

  const workDir = mkdtempSync(join(tmpdir(), 'og-bake-'));
  const now = Date.now();

  // ★plan を作りつつサムネを落とす(全 0・サムネ取得不可はここで落ちる=焼かない)。
  const planLives = [];
  let skippedZero = 0;
  let skippedNoThumb = 0;
  for (const live of lives) {
    const strings = planStringsFor(live, now);
    if (!strings) { skippedZero += 1; continue; }
    const lv = strings.lv;
    const thumbPath = join(workDir, `${lv}.src`);
    const got = await downloadThumb(live && live.thumbnail ? live.thumbnail.large : '', thumbPath);
    if (!got) { skippedNoThumb += 1; continue; } // サムネ無しは焼かない(サムネ直へ fail-soft)。
    planLives.push({ ...strings, thumbPath, outPath: join(workDir, `${lv}.jpg`) });
  }

  if (!planLives.length) {
    console.log(JSON.stringify({ kind: 'og-bake', lives: lives.length, baked: 0, skipped: skippedZero + skippedNoThumb, skippedZero, skippedNoThumb, ms: Date.now() - t0, bytes: 0 }));
    console.log('::error::焼ける配信が 0 件でした(全 0 か、サムネを取れませんでした)');
    process.exitCode = 1;
    return;
  }

  const planPath = join(workDir, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ lives: planLives }), 'utf8');

  // ★Python(Pillow)で焼く。plan の文字列を描くだけ・数字は計算しない。
  const py = spawnSync(PYTHON, [COMPOSE_PY, planPath, workDir], { encoding: 'utf8' });
  if (py.status !== 0) {
    console.log(`::error::画像合成に失敗しました (${PYTHON} exit ${py.status}) ${String(py.stderr || '').slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }
  // Python の 1 行 JSON(どれが焼けたか)。★URL は含めない。
  const composeLog = String(py.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
  console.log(composeLog);

  // ★焼けた JPEG を base64 にして投入 body を作る。
  /** @type {Record<string, { type: string, w: number, h: number, b64: string }>} */
  const images = {};
  let totalBytes = 0;
  for (const p of planLives) {
    if (!existsSync(p.outPath)) continue; // Python が上限で捨てた=焼かない。
    const buf = readFileSync(p.outPath);
    if (!buf.length) continue;
    totalBytes += buf.length;
    images[p.lv] = { type: 'image/jpeg', w: 1200, h: 630, b64: buf.toString('base64') };
  }

  const baked = Object.keys(images).length;
  // ★1 行 JSON(Actions のログで読む唯一の記録・設計 §15-3)。★URL・トークンは含めない。
  console.log(JSON.stringify({
    kind: 'og-bake',
    lives: lives.length,
    baked,
    skipped: skippedZero + skippedNoThumb,
    skippedZero,
    skippedNoThumb,
    ms: Date.now() - t0,
    bytes: totalBytes
  }));

  if (baked === 0) {
    console.log('::error::1 枚も焼けませんでした(保存しません)');
    process.exitCode = 1;
    return;
  }

  if (DRY_RUN) {
    console.log(`焼いた JPEG は ${workDir} に残しました(--dry-run のため POST しません)`);
    return;
  }

  const key = process.env.STATUS_INGEST_KEY || '';
  if (!key) {
    console.log('::error::STATUS_INGEST_KEY がありません');
    process.exitCode = 1;
    return;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}?ingest=og-image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-share-key': key, 'user-agent': UA },
      body: JSON.stringify({ v: 1, images }),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (e) {
    console.log(`::error::POST に失敗しました: ${String(e && e.message ? e.message : e)}`);
    process.exitCode = 1;
    return;
  }
  const text = await res.text();
  console.log(`POST HTTP ${res.status} ${text.slice(0, 300)}`);
  if (res.status !== 200 || !text.includes('"stored":true')) {
    console.log(`::error::保存されませんでした (HTTP ${res.status})`);
    process.exitCode = 1;
  }
}

await main();
