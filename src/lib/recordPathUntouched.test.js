import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 記録(コメント保存)の経路に触れていないことの機械ゲート(2026-10-08・設計 docs/handoff/stable-update-model-DESIGN.md §C-7)。
 *   表示・鏡・診断の経路を直す版が、記録の心臓部(コメント保存)を巻き込まないようにする。
 *   ①記録の関数本体の指紋を baseline に固定(変わったら赤。意図して変えるときは人が baseline を更新する)
 *   ②新規・変更する lib が記録系の storage キーを参照しない
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** header から始まる関数の本体(対応する波括弧まで)を返す。見つからなければ ''。 */
function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let depth = 0;
  let started = false;
  // 引数の既定値(opts = {})の波括弧を本体と取り違えない: 本体の開き括弧は「) {」
  const open = src.indexOf(') {', i);
  for (let j = open < 0 ? src.indexOf('{', i) : open + 2; j < src.length; j += 1) {
    const c = src[j];
    if (c === '{') { depth += 1; started = true; }
    else if (c === '}') { depth -= 1; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

/** 32bit の2種ハッシュ+長さ(laneMirrorWriteGate.js の fingerprint と同型)。 */
function fingerprint(s) {
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = (Math.imul(h2, 33) + c) | 0;
  }
  return `${s.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}

const RECORD_FUNCTIONS = [
  ['src/extension/content-entry.js', 'async function bufferRowsToTail('],
  ['src/extension/content-entry.js', 'async function flushBatchViaTail('],
  ['src/extension/content-entry.js', 'async function persistCommentRowsImpl(']
];

describe('記録(コメント保存)の関数本体は baseline から変わっていない', () => {
  const baselinePath = path.join(root, '.record-path-baseline.json');
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
  for (const [rel, header] of RECORD_FUNCTIONS) {
    const name = header.replace(/^async function /, '').replace(/\($/, '');
    it(`${name} の指紋が baseline と一致する`, () => {
      const body = fnBody(read(rel), header);
      expect(body.length, `${name} の本体が取れていない(関数名の変更?)`).toBeGreaterThan(200);
      expect(fingerprint(body)).toBe(baseline[name]);
    });
  }
});

describe('本設計で新規・変更する lib は記録系の storage キーを参照しない', () => {
  const recordKeyRe = /nls_ctail_|nls_comments_|nls_cchunk_|nls_csummary_|nls_cdb_summary_/;
  for (const rel of ['src/lib/panelMetricsRequestPolicy.js']) {
    it(`${rel} は記録系キーを参照しない`, () => {
      const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code).not.toMatch(recordKeyRe);
    });
    it(`${rel} は storage / chrome に触れない(判定だけ)`, () => {
      const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code).not.toMatch(/\bchrome\b|\.storage\b|\bindexedDB\b/);
    });
  }
});
