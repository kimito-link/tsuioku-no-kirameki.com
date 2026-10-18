#!/usr/bin/env node
/**
 * loop-glossary-status-live.mjs — 自己改善ループの「用語集」を、拡張のコードから機械的に作る。
 *
 * 役割: ローカルAIに渡す固定の知識（症状IDの意味と「次の一手」、カードの指標の意味）を、src/lib/symptomVerdicts.js と
 *   loop-adapter-status-live.mjs の CARD_GLOSSARY から生成する。手で書くと、症状が増えたときにずれる（100年持たない）ので機械が作る。
 *   用語集はデータ（カード）ではなく知識。実測で、これが無いと小さいモデルは症状IDの意味を取り違えた（web-ios-android/_docs/SPEC-loop-propose-v1.md）。
 * 使い方: node scripts/loop-glossary-status-live.mjs            → _loop/tsuioku/glossary.txt に書く
 *         node scripts/loop-glossary-status-live.mjs --stdout   → 標準出力へ
 *   そのまま `loop-propose.mjs --glossary <このファイル>` に渡す。
 * 読むもの: out.push({ id: '…', symptom: '…', … line: '… ★次の一手: …' }) の形の定義だけ（症状名と次の一手の固定の文字列。データは含まない）。
 *   読み取れた症状の数が許可リスト(KNOWN_SYMPTOM_IDS)と食い違ったら、**書かずに止まる**（コードの書き方が変わった合図。fail-closed）。
 * 検査: 書く前に、キット正本の用語集検査（秘密・メールらしき形・4KiB 上限）を通す。見つからなければ止まる（LOOP_KIT_DIR か隣の web-ios-android）。
 * 終了コード: 0=書いた / 1=定義の読み取りが許可リストとずれた・用語集が検査に通らない / 2=検査器・入力が無い
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARD_GLOSSARY, KNOWN_SYMPTOM_IDS, PROJECT } from './loop-adapter-status-live.mjs';

/**
 * symptomVerdicts.js のソースから、症状の定義（id・症状名・次の一手）を取り出す。
 * @param {string} src
 * @returns {Array<{ id: string, symptom: string, hint: string }>}
 */
export function parseSymptomDefinitions(src) {
  const out = [];
  for (const block of src.split('out.push({').slice(1)) {
    const end = block.indexOf('});');
    const body = end === -1 ? block : block.slice(0, end);
    const id = /id:\s*'([a-z0-9-]+)'/.exec(body)?.[1];
    const symptom = /symptom:\s*'([^']+)'/.exec(body)?.[1];
    const hint = /★次の一手:\s*([^']+)'/.exec(body)?.[1]?.trim();
    if (id && symptom) out.push({ id, symptom, hint: hint ?? '' });
  }
  return out;
}

/**
 * 用語集の本文を組む。
 * @param {Array<{ id: string, symptom: string, hint: string }>} defs
 */
export function formatGlossary(defs) {
  const lines = ['【症状ID（異常のときだけ症状カードになる。次の一手は、拡張の判定コードが示す最初の確認）】'];
  for (const d of defs) lines.push(`- ${d.id}: ${d.symptom}${d.hint ? ` ／次の一手: ${d.hint}` : ''}`);
  lines.push('', '【カードのid・指標の意味】');
  for (const [k, v] of Object.entries(CARD_GLOSSARY)) lines.push(`- ${k}: ${v}`);
  return lines.join('\n') + '\n';
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const repo = resolve(here, '..');
  const src = readFileSync(process.env.LOOP_SYMPTOM_SRC || join(repo, 'src', 'lib', 'symptomVerdicts.js'), 'utf8'); // LOOP_SYMPTOM_SRC はテスト用
  const defs = parseSymptomDefinitions(src);
  const ids = defs.map((d) => d.id).sort();
  const want = [...KNOWN_SYMPTOM_IDS].sort();
  if (ids.length !== want.length || ids.some((x, i) => x !== want[i])) {
    console.error('[loop-glossary] 症状の定義の読み取りが許可リストとずれた。書かずに止まる（symptomVerdicts.js の書き方が変わったか、症状が増減した）');
    process.exit(1);
  }
  const text = formatGlossary(defs);
  const kitDir = process.env.LOOP_KIT_DIR || resolve(repo, '..', 'web-ios-android', 'templates', 'scripts');
  let assertGlossary;
  try {
    ({ assertGlossary } = await import(pathToFileURL(join(kitDir, 'lib', 'loop-propose-core.mjs')).href));
  } catch {
    console.error('[loop-glossary] 用語集の検査器が見つからない（測れていない）。LOOP_KIT_DIR に web-ios-android/templates/scripts を指定する');
    process.exit(2);
  }
  try {
    assertGlossary(text);
  } catch (e) {
    console.error('[loop-glossary] 用語集が検査に通らない: ' + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  }
  if (process.argv.includes('--stdout')) {
    process.stdout.write(text);
    return;
  }
  const dir = process.env.LOOP_OUT_DIR || join(repo, '_loop', PROJECT);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'glossary.txt');
  writeFileSync(file, text, 'utf8');
  console.log(file);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
