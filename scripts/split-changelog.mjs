// scripts/split-changelog.mjs — changelog.js を直近20版(本体)と旧版(archive)に分割
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src/lib/changelog.js');

const content = fs.readFileSync(src, 'utf8');

// EXTENSION_CHANGELOG 配列の開始位置を探す
const arrayStart = content.indexOf('export const EXTENSION_CHANGELOG = Object.freeze([');
if (arrayStart === -1) throw new Error('EXTENSION_CHANGELOG が見つかりません');

// 配列の中身だけ抽出
const arrayBody = content.slice(arrayStart + 'export const EXTENSION_CHANGELOG = Object.freeze(['.length);

// Object.freeze({ version: ... }) のブロックを分割
// 各エントリは "  Object.freeze({" で始まる
const entries = [];
let depth = 0;
let current = '';
let inArray = false;

for (let i = 0; i < arrayBody.length; i++) {
  const ch = arrayBody[i];
  if (!inArray && arrayBody.slice(i, i + 14) === '  Object.freeze') {
    inArray = true;
  }
  if (inArray) {
    current += ch;
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        entries.push(current.trim().replace(/,$/, ''));
        current = '';
        inArray = false;
      }
    }
  }
}

console.log(`全エントリ数: ${entries.length}`);

// 直近20版と旧版に分割
const RECENT = 20;
const recentEntries = entries.slice(0, RECENT);
const archiveEntries = entries.slice(RECENT);

console.log(`直近${RECENT}版: ${recentEntries.length}件`);
console.log(`アーカイブ: ${archiveEntries.length}件`);

// compareSemver 関数を取り出す（配列の後）
const semverFn = content.slice(content.indexOf('\nexport function compareSemver'));

// changelog.js（直近20版のみ）を書き直す
const newChangelog = `/**
 * 拡張の更新履歴データと semver 比較ヘルパ。
 * 直近${RECENT}バージョンのみ同梱（旧版は changelog-archive.js）。
 *
 * 設計（0.1.12 D: 更新履歴 popup 表示）:
 *   ・version 文字列・日付・概要・項目配列を JSON-like なデータ構造で保持。
 *   ・popup-entry.js が <details id="changelogPanel"> の中身として描画する。
 *   ・各項目は HTML を含まずプレーンテキスト。
 *
 * @typedef {{
 *   version: string,
 *   date: string,
 *   summary: string,
 *   items: readonly string[]
 * }} ChangelogEntry
 */

/** @type {readonly ChangelogEntry[]} */
export const EXTENSION_CHANGELOG = Object.freeze([
  ${recentEntries.join(',\n  ')}
]);
${semverFn}`;

fs.writeFileSync(src, newChangelog, 'utf8');
console.log(`changelog.js を ${recentEntries.length}版に削減して書き直しました`);

// changelog-archive.js（旧版）を生成
const archiveContent = `/**
 * 追憶のきらめき 更新履歴アーカイブ（v0.1.663 以前）。
 * changelog.js の直近${RECENT}版に収まらない旧版をここに保管。
 * popup では通常読み込まれない（将来の「全履歴を見る」機能用）。
 *
 * @typedef {import('./changelog.js').ChangelogEntry} ChangelogEntry
 */

/** @type {readonly ChangelogEntry[]} */
export const EXTENSION_CHANGELOG_ARCHIVE = Object.freeze([
  ${archiveEntries.join(',\n  ')}
]);
`;

const archivePath = path.join(root, 'src/lib/changelog-archive.js');
fs.writeFileSync(archivePath, archiveContent, 'utf8');
console.log(`changelog-archive.js を ${archiveEntries.length}版で生成しました`);

// 行数確認
const newLines = newChangelog.split('\n').length;
const archiveLines = archiveContent.split('\n').length;
console.log(`\nchangelog.js: ${newLines}行 (削減前: 5376行)`);
console.log(`changelog-archive.js: ${archiveLines}行`);
