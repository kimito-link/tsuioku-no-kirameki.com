/**
 * wiringTestSource — wiring テストが「関数の本体」を、置き場所に依らず取得するための正本。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか(Phase 2 の前提工事)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   popup-entry.js は 22,332行あり、initPopup(2,553行)と refresh(1,764行)に
 *   集中している。これを機能ごとに src/extension/popup/ へ抽出していきたいが、
 *   現状の wiring テストは【ファイルを直接読んで関数名で切り出す】作りなので、
 *   関数を移動した瞬間に軒並み赤くなる(2026-08-10 に実際に3件経験した)。
 *
 *   「移動のたびにテストを直す」方式は抽出コストを跳ね上げ、抽出をためらわせる
 *   = 巨大化の原因を再生産する。だから【先に壊れにくい形へ寄せてから動かす】。
 *
 *   ★断言の中身(無条件呼び出し・アンカー付き regex)は変えない。
 *     変えるのは「本文をどこから取るか」だけ＝変異検知力は落とさない。
 *
 * ★fail-closed: 見つからなければ throw する。空文字を返すと
 *   「本文が空なので全ての断言が素通り」= 最悪の恒真テストになる。
 *
 * @module wiringTestSource
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helperDir, '..', '..');
const extensionDir = path.join(repoRoot, 'src', 'extension');

/**
 * 関数本体を括弧対応で切り出す(対応する `}` まで)。
 * ★正規表現で「次の関数まで」を取る方式にしない: ネストした `}` で切れて
 *   本文が短くなり、断言が素通りする(過去に緩い切り出しで変異を素通しした)。
 * @param {string} src
 * @param {string} header 例 "function publishLaneMirror(" / "async function initPopup()"
 * @returns {string} 見つからなければ空文字
 */
export function extractFnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

/** 探索対象(先に見つかった方を採用)。Phase 2 で popup/ 配下が増えても追加不要。 */
function candidateFiles() {
  /** @type {string[]} */
  const files = [];
  const entry = path.join(extensionDir, 'popup-entry.js');
  if (fs.existsSync(entry)) files.push(entry);
  // src/extension/popup/**(Phase 2 の受け皿・eslint に max-lines 2000 で予約済み)
  const popupDir = path.join(extensionDir, 'popup');
  /** @param {string} dir */
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js') && !name.includes('.test.')) files.push(full);
    }
  };
  walk(popupDir);
  return files;
}

/**
 * 関数名から本体を取る。popup-entry.js → src/extension/popup/** の順に探す。
 *
 * @param {string} fnName 例 "publishLaneMirror"
 * @param {{ async?: boolean, export?: boolean }} [opts] 宣言の形(既定は両方を試す)
 * @returns {string} 関数本体(必ず非空)
 * @throws {Error} どこにも無い / 本体が空のとき(★黙って緑にしない)
 */
export function resolveEntryFnSource(fnName, opts = {}) {
  const name = String(fnName || '').trim();
  if (!name) throw new Error('resolveEntryFnSource: 関数名が空です');
  // 宣言の書き方は複数あるので、実在しうる形を順に試す。
  const headers = [
    `export async function ${name}(`,
    `export function ${name}(`,
    `async function ${name}(`,
    `function ${name}(`
  ];
  if (opts.async === true) headers.unshift(`async function ${name}(`);
  for (const file of candidateFiles()) {
    const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    for (const header of headers) {
      const body = extractFnBody(src, header);
      if (body) return body;
    }
  }
  throw new Error(
    `resolveEntryFnSource: 関数 ${name} が見つかりません` +
      `(popup-entry.js と src/extension/popup/** を探索済み)。` +
      '関数名の変更・削除か、探索対象の追加漏れを疑ってください。'
  );
}

/**
 * 関数が「どのファイルに居るか」を返す(移設の進捗確認・診断用)。
 * @param {string} fnName
 * @returns {string} リポジトリ相対パス。見つからなければ空文字
 */
export function locateEntryFn(fnName) {
  const name = String(fnName || '').trim();
  if (!name) return '';
  const headers = [
    `export async function ${name}(`,
    `export function ${name}(`,
    `async function ${name}(`,
    `function ${name}(`
  ];
  for (const file of candidateFiles()) {
    const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (headers.some((h) => src.includes(h))) {
      return path.relative(repoRoot, file).replace(/\\/g, '/');
    }
  }
  return '';
}
