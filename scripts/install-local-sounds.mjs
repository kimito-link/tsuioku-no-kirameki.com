// install-local-sounds.mjs
//
// マイ効果音「手動取込」を不要にするローカル自動同梱スクリプト。
//
// 背景(council/pachinko-ultimate-SYNTHESIS.md §1.1・§7):
//   実物音源(D:\download\audiostock_*.mp3/wav)はライセンス上リポジトリ/Chrome Web Store に
//   同梱できない(定額ライセンスの個人利用範囲)。しかし「ユーザー自身のPC内・リポジトリ外の
//   ローカル拡張フォルダ(C:\nicolive-ext=copy:ext の展開先)へコピーする」のは配布に当たらず可。
//
// このスクリプトは:
//   1. 音源ソースディレクトリ(既定 D:\download。環境変数 NL_SOUND_SRC_DIR で上書き可)から、
//      customSoundPreset.js のプリセットに載っている No. のファイルだけを拾う。
//   2. copy:ext の展開先(既定 C:\nicolive-ext。環境変数 NL_EXT_DEST で上書き可)の
//      sound/custom/ へコピーする。
//   3. 同時に sound/custom/manifest.json を生成する: { files: { "as_204361": "audiostock_204361.mp3", ... }, count, generatedAt }
//
// ソースディレクトリが無い環境(ユーザーのPC以外・CI等)では、エラーにせず静かにスキップする。
// コピー先はリポジトリ外(git 管理外)なので、このスクリプトの実行はリポジトリに一切影響しない。
//
// 実行: npm run sounds:install (copy:ext の最後に自動連結される)
//   NL_SOUND_SRC_DIR=E:\myaudio NL_EXT_DEST=D:\myext npm run sounds:install

import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOM_SOUND_PRESET, parseAudiostockNoFromFilename, presetIdForNo } from '../src/lib/customSoundPreset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const SUPPORTED_EXTS = new Set(['.mp3', '.wav']);

/**
 * プリセットに載っている全 No. の集合を作る純関数。
 * @returns {Set<number>}
 */
export function buildPresetNoSet() {
  const set = new Set();
  for (const list of Object.values(CUSTOM_SOUND_PRESET)) {
    for (const asset of list) set.add(Number(asset.no));
  }
  return set;
}

/**
 * ソースディレクトリのファイル名一覧から、プリセットに載っている No. のファイルだけを
 *   抽出する純関数(id→ファイル名。1つの id に複数拡張子がある場合は最初に見つかった方を採用)。
 * @param {string[]} filenames
 * @param {Set<number>} presetNoSet
 * @returns {{ files: Record<string, string>, matchedCount: number, skippedCount: number }}
 */
export function selectPresetFiles(filenames, presetNoSet) {
  /** @type {Record<string, string>} */
  const files = {};
  let matchedCount = 0;
  let skippedCount = 0;
  for (const filename of filenames) {
    const ext = extname(filename).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;
    const no = parseAudiostockNoFromFilename(filename);
    if (no === null || !presetNoSet.has(no)) {
      skippedCount += 1;
      continue;
    }
    const id = presetIdForNo(no);
    if (files[id]) continue; // 既に採用済み(拡張子違いの重複)
    files[id] = filename;
    matchedCount += 1;
  }
  return { files, matchedCount, skippedCount };
}

/**
 * manifest.json の中身を組み立てる純関数。
 * @param {Record<string, string>} files
 * @param {number} generatedAt
 * @returns {{ files: Record<string, string>, count: number, generatedAt: number }}
 */
export function buildManifest(files, generatedAt) {
  return { files, count: Object.keys(files).length, generatedAt };
}

async function main() {
  const srcDir = process.env.NL_SOUND_SRC_DIR ? resolve(process.env.NL_SOUND_SRC_DIR) : resolve('D:\\download');
  const extDestDir = process.env.NL_EXT_DEST ? resolve(process.env.NL_EXT_DEST) : resolve('C:\\nicolive-ext');
  const outDir = join(extDestDir, 'sound', 'custom');

  if (!existsSync(srcDir)) {
    console.log(`[install-local-sounds] 音源ソースディレクトリが見つからないためスキップします: ${srcDir}`);
    return;
  }
  if (!existsSync(extDestDir)) {
    console.log(`[install-local-sounds] 拡張の展開先が見つからないためスキップします: ${extDestDir}(先に npm run copy:ext を実行してください)`);
    return;
  }

  let filenames;
  try {
    filenames = readdirSync(srcDir).filter((f) => {
      try {
        return statSync(join(srcDir, f)).isFile();
      } catch {
        return false;
      }
    });
  } catch (e) {
    console.log(`[install-local-sounds] ソースディレクトリの読み取りに失敗したためスキップします: ${e && e.message ? e.message : e}`);
    return;
  }

  const presetNoSet = buildPresetNoSet();
  const { files, matchedCount, skippedCount } = selectPresetFiles(filenames, presetNoSet);

  if (matchedCount === 0) {
    console.log(`[install-local-sounds] プリセット該当ファイルが見つからなかったためスキップします(${srcDir})。`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const filename of Object.values(files)) {
    copyFileSync(join(srcDir, filename), join(outDir, filename));
  }

  const manifest = buildManifest(files, Date.now());
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n✅ ローカル音源を自動同梱しました(${matchedCount}本・skip=${skippedCount})`);
  console.log(`   ソース: ${srcDir}`);
  console.log(`   展開先: ${outDir}`);
  console.log('   リポジトリには一切コピーしていません(git管理外)。\n');

  void REPO_ROOT; // 予約(将来リポジトリ相対パスが必要になった場合用)
}

// このファイルが直接実行された場合のみ main() を走らせる(テストから import した場合は走らせない)。
const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((e) => {
    console.error('[install-local-sounds] 失敗しました:', e && e.message ? e.message : e);
    process.exit(1);
  });
}
