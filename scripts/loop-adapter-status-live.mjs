#!/usr/bin/env node
/**
 * loop-adapter-status-live.mjs — 自己改善ループの「アダプタ」: 状態速報(status:live --json)→症状カード。
 *
 * 役割: 自己改善ループ(正本: web-ios-android/_docs/DESIGN-self-improvement-loop-2026-10-18.md)の、この拡張用の入口。
 *   状態速報の中身を読んで、AIに渡してよい「症状カード」だけを _loop/tsuioku/symptoms/ に書く。機械だけで動く（AIは使わない）。
 * 使い方: node scripts/status-live.mjs --json | node scripts/loop-adapter-status-live.mjs
 *   （status-live.mjs が .env の NL_STATUS_VIEW_TOKEN で自分のクラウドから取得。この CLI は stdin を読むだけで、通信も保存もしない）
 * なぜ安全か: 速報には第三者のコメント本文・名前・ID・アイコンURLが入っている（commentTimelineMirror 等）。ここでは
 *   (1) 読むのは statusReport の「合言葉」1行（固定の症状IDだけが並ぶ。SYMPTOM_SIGNATURE_LABEL）と、generatedAt・lives の件数だけ
 *   (2) 症状IDは既知の7個の許可リストに一致したものだけ（未知のトークンは捨て、件数だけを数値で残す）
 *   (3) 出力は症状カード検査（キット正本の許可リスト）を通ったものだけ。1枚でも違反したら**何も書かない**（fail-closed）
 *   入力の文字列は、どこにも出力・保存しない。
 * 検査の正本: web-ios-android/templates/scripts/lib/symptom-card-core.mjs（コピーしない。環境変数 LOOP_KIT_DIR か、隣の web-ios-android を動的に読む。見つからなければ止まる）
 * 終了コード: 0=カードを書いた / 1=カードが検査に通らない（何も書かない） / 2=入力・検査器が無い（測れていない）
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SYMPTOM_SIGNATURE_LABEL } from '../src/lib/symptomVerdicts.js';

/** src/lib/symptomVerdicts.js が返す症状ID（7件）。ずれたら scripts/loop-adapter-status-live.test.mjs が赤になる。 */
export const KNOWN_SYMPTOM_IDS = Object.freeze([
  'thumb-white', 'avatar-all-failed', 'lane-never-rendered', 'lane-painted-zero', 'lane-heavy-race', 'panel-black', 'status-slow',
]);
export const PROJECT = 'tsuioku';
/** 速報がこの秒数より古ければ「測れていない」。status-live 自身も「5分以上古い」と警告する。 */
export const STALE_SEC = 300;

/**
 * このアダプタが出すカードの id・metrics の意味（用語集の元。loop-glossary-status-live.mjs が使う）。
 * 出す指標を増やしたら、ここにも足す（足し忘れは loop-adapter-status-live.test.js が赤にする）。
 */
export const CARD_GLOSSARY = Object.freeze({
  'status-snapshot': '状態速報の取得そのものの健全性を表すカード。症状ではなく土台の指標（ok=速報本文があり5分以内／unmeasured=速報本文が無い、または5分以上古い、生成時刻が不明で測れていない。unmeasured は異常なしの意味ではない）',
  snapshotAgeSec: '速報が生成されてからの経過秒。300を超えると古すぎて測れていない扱い',
  livesCount: '視聴中の配信タブの数',
  reportPresent: '速報本文(statusReport)があるか',
  symptomCount: 'このスナップショットで異常として列挙された症状の数',
  unknownSymptomCount: 'このアダプタの許可リストに無い症状IDの数（0でなければ、拡張側に新しい症状が増えて許可リストが古い）',
});
export const SOURCE = 'status-live-adapter';

/**
 * 状態速報(jsonBlob)から症状カードを組む（純関数）。入力の文字列はカードに一切コピーしない。
 * @param {any} blob status:live --json の出力
 * @param {{ version: string, now?: Date, buildId?: string }} ctx
 * @returns {Array<Record<string, unknown>>}
 */
export function buildCardsFromBlob(blob, ctx) {
  const now = ctx.now ?? new Date();
  const at = now.toISOString();
  const report = typeof blob?.statusReport === 'string' ? blob.statusReport : '';

  // 合言葉の行 → 既知の症状IDだけ
  const tokens = [];
  for (const line of report.split('\n')) {
    const i = line.indexOf(SYMPTOM_SIGNATURE_LABEL);
    if (i !== -1) tokens.push(...line.slice(i + SYMPTOM_SIGNATURE_LABEL.length).trim().split(/\s+/).filter(Boolean));
  }
  const found = KNOWN_SYMPTOM_IDS.filter((id) => tokens.includes(id));
  const unknownCount = new Set(tokens.filter((t) => !KNOWN_SYMPTOM_IDS.includes(t))).size;

  /** @type {Record<string, number|boolean>} */
  const common = {};
  const gen = Date.parse(String(blob?.generatedAt ?? ''));
  if (Number.isFinite(gen)) common.snapshotAgeSec = Math.max(0, Math.round((now.getTime() - gen) / 1000));
  if (Array.isArray(blob?.lives)) common.livesCount = blob.lives.length;

  const base = { schema: 1, project: PROJECT, source: SOURCE, version: ctx.version, ...(ctx.buildId ? { buildId: ctx.buildId } : {}), at };
  const cards = found.map((id) => ({ ...base, id, verdict: 'fail', metrics: { ...common } }));
  cards.push({
    ...base,
    id: 'status-snapshot',
    // 速報本文が無い・古い（STALE_SEC 超）・生成時刻が不明、のどれかなら「測れていない」。古い速報で「異常なし」と言わない（実データで、1時間前の速報が ok になっていた）
    verdict: report && common.snapshotAgeSec !== undefined && common.snapshotAgeSec <= STALE_SEC ? 'ok' : 'unmeasured',
    metrics: { ...common, reportPresent: report !== '', symptomCount: found.length, unknownSymptomCount: unknownCount },
  });
  return cards;
}

/**
 * status-live の出力から JSON 部分を取り出す（純関数）。
 * `status-live --json` は、JSONの前に人が読む見出し（「── 状態速報(生成: 59分前) ──」「⚠️ このスナップショットは…古いです」など）を付ける
 * （実データで初めて分かった）。全体が JSON ならそのまま、そうでなければ「行頭が { の行」から後ろを JSON として読む。読めなければ null。
 * 見出しの内容は使わない（捨てる）。
 * @param {string} text
 * @returns {any|null}
 */
export function extractJson(text) {
  const t = String(text ?? '');
  try {
    return JSON.parse(t);
  } catch {
    /* 見出し付き */
  }
  const m = /(^|\n){/.exec(t);
  if (!m) return null;
  try {
    return JSON.parse(t.slice(m.index + (m[1] ? 1 : 0)));
  } catch {
    return null;
  }
}

/** @param {Date} d */
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '..');
  const kitDir = process.env.LOOP_KIT_DIR || resolve(repo, '..', 'web-ios-android', 'templates', 'scripts');
  let validate;
  try {
    ({ validateSymptomCard: validate } = await import(pathToFileURL(join(kitDir, 'lib', 'symptom-card-core.mjs')).href));
  } catch {
    console.error('[loop-adapter] 症状カードの検査器が見つからない（測れていない）。環境変数 LOOP_KIT_DIR に web-ios-android/templates/scripts を指定する');
    process.exit(2);
  }
  const blob = extractJson(readFileSync(0, 'utf8'));
  if (blob === null || typeof blob !== 'object') {
    console.error('[loop-adapter] stdin から JSON を取り出せない（測れていない）');
    process.exit(2);
  }
  const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version;
  const now = new Date();
  const cards = buildCardsFromBlob(blob, { version, now });
  const bad = [];
  for (const c of cards) {
    const r = validate(c, { byteLength: Buffer.byteLength(JSON.stringify(c)) });
    if (!r.ok) for (const x of r.violations) bad.push(`${c.id} ${x.path}: ${x.rule}`);
  }
  if (bad.length > 0) {
    console.error('[loop-adapter] 症状カードが検査に通らない。何も書かない（fail-closed）');
    for (const b of bad) console.error('    ' + b);
    process.exit(1);
  }
  const dir = process.env.LOOP_OUT_DIR || join(repo, '_loop', PROJECT, 'symptoms'); // LOOP_OUT_DIR はテスト用
  mkdirSync(dir, { recursive: true });
  for (const c of cards) {
    const file = join(dir, `${stamp(now)}-${c.id}.json`);
    writeFileSync(file, JSON.stringify(c, null, 2) + '\n', 'utf8');
    console.log(file);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
