// scripts/split-changelog.mjs — changelog.js を直近20版(本体)と旧版(archive)に分割
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src/lib/changelog.js');

/**
 * 各エントリの開始目印。
 * ★2026-08-19: 旧実装は `slice(i, i+14)` で **15文字**のこの文字列と比較しており、
 *   **永遠に一致しなかった**(オフバイワン)。切り出しが常に0件になり、
 *   その0件で書き込んで **全1,331版を消した**(バックアップから復旧)。
 *   → 長さを取り違えない `startsWith` に統一する。
 */
const ENTRY_HEAD = '  Object.freeze';

/*
 * ★CRLF 正規化は必須(2026-08-19 に実際に踏んだ)。
 *   このリポのファイルは CRLF。スクリプトは "  Object.freeze" を探すが、
 *   改行が \r\n だと切り出しがずれて **0件** になる。
 *   0件のまま書き込むと **全1,331版が消える**(実際に消して、バックアップから復旧した)。
 */
const contentRaw = fs.readFileSync(src, 'utf8');
const content = contentRaw.replace(/\r\n/g, '\n');
/** 元の改行コードを保つ(LF で書き戻すと全行が変更扱いになる)。 */
const EOL = contentRaw.includes('\r\n') ? '\r\n' : '\n';
/** @param {string} text @returns {string} 元の改行コードへ揃えた本文 */
const toEol = (text) => (EOL === '\n' ? text : text.split('\n').join(EOL));

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
  if (!inArray && arrayBody.startsWith(ENTRY_HEAD, i)) {
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

/*
 * ★fail-closed: 切り出せていないまま書き込まない。
 *   2026-08-19、CRLF で切り出しが 0件になったのに、旧実装は**そのまま書き込み**、
 *   changelog(781版) と archive(550版) の **全1,331版を消した**
 *   (バックアップから復旧)。「0件」は正常ではなく、パーサの失敗である。
 */
if (entries.length === 0) {
  throw new Error(
    'エントリを1件も切り出せませんでした(パーサの失敗)。\n' +
      '  改行コード(CRLF/LF)やフォーマットの変更を疑ってください。\n' +
      '  ★書き込みは行いません(空で上書きすると履歴が全部消えます)。'
  );
}

// 直近20版と旧版に分割
const RECENT = 20;
const recentEntries = entries.slice(0, RECENT);
const archiveEntries = entries.slice(RECENT);

console.log(`直近${RECENT}版: ${recentEntries.length}件`);
console.log(`アーカイブ: ${archiveEntries.length}件`);

/*
 * 配列の【後ろにある関数を全部】取り出す。
 *
 * ★2026-08-19 修正: 旧実装は `compareSemver` 以降しか残さず、
 *   その手前に定義されていた **`getLatestChangelogEntry` を消していた**
 *   (テストが `is not a function` で落ちて発覚)。
 *   → 配列の閉じ括弧 `]);` の直後から**末尾まで**を丸ごと残す。
 */
const arrayEndMarker = '\n]);\n';
const arrayEndIdx = content.indexOf(arrayEndMarker, arrayStart);
if (arrayEndIdx === -1) throw new Error('EXTENSION_CHANGELOG の閉じ括弧が見つかりません');
const semverFn = content.slice(arrayEndIdx + arrayEndMarker.length);
if (!semverFn.includes('export function compareSemver')) {
  throw new Error('配列後の関数群を取り出せませんでした(compareSemver が見つからない)。中止しました。');
}
if (!semverFn.includes('export function getLatestChangelogEntry')) {
  throw new Error('getLatestChangelogEntry が失われます。中止しました。');
}

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

// ★元の改行コードで書き戻す(LF にすると全行が変更扱いになる)。
fs.writeFileSync(src, toEol(newChangelog), 'utf8');
console.log(`changelog.js を ${recentEntries.length}版に削減して書き直しました`);

/*
 * changelog-archive.js（旧版）へ **追記** する。
 *
 * ★2026-08-19 修正(実行前に発見した重大な危険):
 *   旧実装は archive を **丸ごと上書き**していた。2026-06-11 の初回実行では
 *   archive が空だったので問題にならなかったが、いま archive には
 *   **550版(0.1.7〜0.1.662)** が入っている。素で再実行すると**その550版が消える**。
 *   ＝更新履歴という正本を破壊する。
 *   → 既存の archive を読み、**新しく押し出す分を先頭に足す**(降順を保つ)。
 *
 * ★冪等性: 既に archive に在る version は足さない(二重登録を防ぐ)。
 */
const archivePath = path.join(root, 'src/lib/changelog-archive.js');
const prevArchive = fs.existsSync(archivePath) ? fs.readFileSync(archivePath, 'utf8') : '';

/** 既存 archive のエントリ本文を、changelog と同じ手順で切り出す。 */
const extractEntries = (text, marker) => {
  const start = text.indexOf(marker);
  if (start === -1) return [];
  const body = text.slice(start + marker.length);
  const out = [];
  let d = 0, cur = '', on = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (!on && body.startsWith(ENTRY_HEAD, i)) on = true;
    if (on) {
      cur += ch;
      if (ch === '(') d++;
      if (ch === ')') {
        d--;
        if (d === 0) { out.push(cur.trim().replace(/,$/, '')); cur = ''; on = false; }
      }
    }
  }
  return out;
};

/*
 * ★既存 archive の読み取りは【2つの形】に対応する(2026-08-19 に踏んだ)。
 *   旧形式: `export const EXTENSION_CHANGELOG_ARCHIVE = Object.freeze([ ... ]);`
 *   新形式: `const ARCHIVE_ENTRIES = [ ... ];`(TS2590 回避で導入)
 *   ★書き出す形を変えたのに読み取りを旧形式のままにしていたため、
 *     既存550版を「0件」と読んで **archive を空にした**(git から復旧)。
 *     ＝書き手と読み手は必ず同時に直す。
 */
const prevEntries = (() => {
  const byNew = extractEntries(prevArchive, 'const ARCHIVE_ENTRIES = [');
  if (byNew.length > 0) return byNew;
  return extractEntries(prevArchive, 'export const EXTENSION_CHANGELOG_ARCHIVE = Object.freeze([');
})();
const verOf = (s) => (s.match(/version: '([\d.]+)'/) || [])[1] || '';
const prevVers = new Set(prevEntries.map(verOf));
const incoming = archiveEntries.filter((e) => !prevVers.has(verOf(e)));
const mergedEntries = [...incoming, ...prevEntries]; // 新しい順を保つ

console.log(`archive: 既存${prevEntries.length}版 + 新規${incoming.length}版 = ${mergedEntries.length}版`);
if (prevEntries.length > 0 && mergedEntries.length < prevEntries.length) {
  throw new Error('archive が減っています(履歴の破壊)。中止しました。');
}
/*
 * ★fail-closed: 中身のある archive を「0件」と読んだら**書き込まない**。
 *   2026-08-19、書き出し形式を変えたのに読み取りマーカーを旧形式のままにしていて
 *   既存550版を0件と誤読し、archive を空にした(git から復旧)。
 *   「ファイルに中身があるのに切り出しが0件」は**常にパーサの失敗**である。
 */
if (prevArchive.includes('version:') && prevEntries.length === 0) {
  throw new Error(
    'archive に中身があるのに0件と読み取りました(パーサの失敗)。\n' +
      '  書き出し形式と読み取りマーカーの食い違いを疑ってください。\n' +
      '  ★書き込みは行いません(空で上書きすると履歴が全部消えます)。'
  );
}

const archiveContent = `/**
 * 追憶のきらめき 更新履歴アーカイブ（popup のバンドル外）。
 * changelog.js の直近${RECENT}版に収まらない旧版をここに保管する。
 *
 * ★このファイルは popup では読み込まれない（バンドルに入れない）。
 *   読み込むと 2026-08-19 に実測した「起動が1.4秒止まる」が再発する。
 *
 * ★tsconfig.json の exclude に入れてある（型検査の対象外）。
 *   1,300版を超えると tsc が TS2590
 *   "union type that is too complex to represent" で落ちるため。
 *   ここは**ロジックを持たないデータ**なので型検査の価値が無く、除外して差し支えない。
 *   (型が要る側 = changelog.js は従来どおり検査対象)
 *
 * @typedef {import('./changelog.js').ChangelogEntry} ChangelogEntry
 */

/*
 * ★型注釈を先に置いて \`Object.freeze\` の推論を避ける(2026-08-19)。
 *   1,300版を超えると tsc が
 *   \`TS2590: Expression produces a union type that is too complex to represent\`
 *   で落ちる(リテラル型の巨大な union を作ろうとするため)。
 *   → 配列を \`ChangelogEntry[]\` として先に型付けし、freeze は最後に1回だけ掛ける。
 */
/** @type {ChangelogEntry[]} */
const ARCHIVE_ENTRIES = [
  ${mergedEntries.join(',\n  ')}
];

/** @type {readonly ChangelogEntry[]} */
export const EXTENSION_CHANGELOG_ARCHIVE = Object.freeze(ARCHIVE_ENTRIES);
`;

fs.writeFileSync(archivePath, toEol(archiveContent), 'utf8');
console.log(`changelog-archive.js を ${mergedEntries.length}版で書き出しました`);

// 行数確認
const newLines = newChangelog.split('\n').length;
const archiveLines = archiveContent.split('\n').length;
console.log(`\nchangelog.js: ${newLines}行`);
console.log(`changelog-archive.js: ${archiveLines}行`);
