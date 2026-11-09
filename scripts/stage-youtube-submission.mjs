// stage-youtube-submission.mjs — YouTube Live 版 Chrome ウェブストア提出用 ZIP ステージングスクリプト
//
// 使い方:
//   node scripts/stage-youtube-submission.mjs [version]
//   （version 省略時は extension-youtube/manifest.json の version を使用。manifest.json は node scripts/build-youtube-ext.mjs が manifest.standalone.json から写す）
//
// 出力:
//   build/submission-youtube-<version>/
//   build/tsuioku-no-kirameki-youtube-<version>.zip
//
// 注意:
//   - 提出（cws-publish）は行わない。パッケージ生成と健全性検証のみ。
//   - extension-youtube/src/ や不要ファイル（*.map, *.test.js, .gitkeep 等）は同梱しない。

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
export const EXT_YOUTUBE_DIR = resolve(REPO_ROOT, 'extension-youtube');
export const BUILD_DIR = resolve(REPO_ROOT, 'build');

const HTML_ASSET_REF_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gs;
const RUNTIME_PAGE_RE = /getURL\(\s*['"`]([A-Za-z0-9_\-./]+\.html)(?:[?*#][^'"`]*)?['"`]/g;
const EXTERNAL_REF_PREFIXES = [
  'http://',
  'https://',
  '//',
  'data:',
  'mailto:',
  '#',
  'javascript:',
  'blob:',
];

const EXCLUDED_PATH_PATTERNS = [
  /^src\//,
  /(?:^|\/)\./,
  /\.map$/i,
  /\.test\.js$/i,
  /\.spec\.js$/i,
  /Thumbs\.db$/i,
  /desktop\.ini$/i,
  /dev-reload-id\.txt$/i,
];

export const REQUIRED_YOUTUBE_ZIP_ENTRIES = [
  'manifest.json',
  'background.js',
  'content-chat.js',
  'sidepanel.html',
  'sidepanel.js',
  'offscreen.html',
  'offscreen.js',
];

/**
 * 提出用 manifest.json を派生させる。
 * @param {Record<string, any>} devManifest
 * @param {string} [versionOverride]
 * @returns {Record<string, any>}
 */
export function buildYoutubeSubmissionManifest(devManifest, versionOverride) {
  const m = JSON.parse(JSON.stringify(devManifest));
  if (versionOverride) {
    m.version = versionOverride;
  }
  delete m.key;

  if (Array.isArray(m.host_permissions)) {
    m.host_permissions = m.host_permissions.filter(
      (h) => (!h.includes('localhost') && !h.includes('127.0.0.1')) || h.includes(':50021'),
    );
  }
  if (Array.isArray(m.content_scripts)) {
    for (const cs of m.content_scripts) {
      if (Array.isArray(cs.matches)) {
        cs.matches = cs.matches.filter(
          (x) => !x.includes('localhost') && !x.includes('127.0.0.1'),
        );
      }
    }
  }
  return m;
}

/**
 * HTML 本文からローカル参照アセットの相対パス一覧を抽出する。
 * @param {string} htmlText
 * @returns {string[]}
 */
export function extractLocalHtmlAssetRefs(htmlText) {
  const found = new Set();
  for (const match of String(htmlText || '').matchAll(HTML_ASSET_REF_RE)) {
    const raw = (match[1] || '').trim();
    if (!raw || EXTERNAL_REF_PREFIXES.some((p) => raw.startsWith(p))) continue;
    const cleaned = raw.split('?')[0].split('#')[0].replace(/^\.\//, '');
    if (cleaned) found.add(cleaned);
  }
  return [...found].sort();
}

/**
 * JS 本文から chrome.runtime.getURL('*.html') の参照先を抽出する。
 * @param {string} jsText
 * @returns {string[]}
 */
export function extractRuntimePageRefs(jsText) {
  const found = new Set();
  for (const match of String(jsText || '').matchAll(RUNTIME_PAGE_RE)) {
    const raw = (match[1] || '').trim().replace(/^\.\//, '');
    if (raw) found.add(raw);
  }
  return [...found].sort();
}

/**
 * パスが提出物から除外すべきパターンに該当するか判定する。
 * @param {string} relPosixPath
 * @returns {boolean}
 */
export function isExcludedSubmissionPath(relPosixPath) {
  const norm = String(relPosixPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!norm) return true;
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(norm));
}

/**
 * ディレクトリ配下の全ファイルを POSIX 相対パスで列挙する。
 * @param {string} baseDir
 * @param {string} [currentDir]
 * @returns {string[]}
 */
function walkFilesPosix(baseDir, currentDir = baseDir) {
  const results = [];
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const full = resolve(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFilesPosix(baseDir, full));
    } else if (entry.isFile()) {
      const rel = relative(baseDir, full).split('\\').join('/');
      results.push(rel);
    }
  }
  return results.sort();
}

/**
 * ステージング済みファイルマップを検証する（fail-closed）。
 * @param {Map<string, Buffer>} fileMap - POSIX 相対パス -> ファイル内容 Buffer
 */
export function verifyYoutubeSubmissionFileMap(fileMap) {
  const names = new Set(fileMap.keys());

  for (const name of names) {
    if (name.includes('\\')) {
      throw new Error(`ZIP エントリ名にバックスラッシュが含まれています: ${name}`);
    }
    if (isExcludedSubmissionPath(name)) {
      throw new Error(`除外すべき開発用ファイルが提出物に含まれています: ${name}`);
    }
  }

  const missingRequired = REQUIRED_YOUTUBE_ZIP_ENTRIES.filter((req) => !names.has(req));
  if (missingRequired.length > 0) {
    throw new Error(`必須ファイルが提出物に不足しています: ${missingRequired.join(', ')}`);
  }

  const manifestRaw = fileMap.get('manifest.json')?.toString('utf8') || '{}';
  const manifest = JSON.parse(manifestRaw);
  if ('key' in manifest) {
    throw new Error('提出用 manifest.json に開発用 "key" が残っています');
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version || ''))) {
    throw new Error(`manifest.json の version 形式が不正です: ${manifest.version}`);
  }

  // manifest.json の icons / side_panel / background / content_scripts の実在確認
  const declaredFiles = new Set();
  if (manifest.background?.service_worker) {
    declaredFiles.add(String(manifest.background.service_worker).replace(/^\.\//, ''));
  }
  if (manifest.side_panel?.default_path) {
    declaredFiles.add(String(manifest.side_panel.default_path).replace(/^\.\//, ''));
  }
  for (const iconPath of Object.values(manifest.icons || {})) {
    declaredFiles.add(String(iconPath).replace(/^\.\//, ''));
  }
  for (const cs of manifest.content_scripts || []) {
    for (const jsFile of cs.js || []) {
      declaredFiles.add(String(jsFile).replace(/^\.\//, ''));
    }
    for (const cssFile of cs.css || []) {
      declaredFiles.add(String(cssFile).replace(/^\.\//, ''));
    }
  }
  const missingDeclared = [...declaredFiles].filter((f) => !names.has(f));
  if (missingDeclared.length > 0) {
    throw new Error(`manifest.json が参照するファイルが不足しています: ${missingDeclared.join(', ')}`);
  }

  // HTML のローカル参照と JS の getURL('*.html') の実在確認
  const missingRefs = [];
  for (const [name, buf] of fileMap.entries()) {
    if (name.endsWith('.html')) {
      const text = buf.toString('utf8');
      for (const ref of extractLocalHtmlAssetRefs(text)) {
        const resolvedRef = posix.normalize(posix.join(posix.dirname(name), ref));
        if (!names.has(resolvedRef)) {
          missingRefs.push(`${name} -> ${resolvedRef}`);
        }
      }
    } else if (name.endsWith('.js')) {
      const text = buf.toString('utf8');
      for (const pageRef of extractRuntimePageRefs(text)) {
        if (!names.has(pageRef)) {
          missingRefs.push(`${name} -> ${pageRef}`);
        }
      }
    }
  }
  if (missingRefs.length > 0) {
    throw new Error(`コード内参照ファイルが提出物に不足しています: ${missingRefs.join('; ')}`);
  }
}

/**
 * メモリ上のファイルマップから標準 ZIP (DEFLATE) バイナリを生成する。
 * Windows でも常に POSIX フォワードスラッシュ `/` で記録する。
 * @param {Map<string, Buffer>} fileMap
 * @returns {Buffer}
 */
export function createZipArchiveBuffer(fileMap) {
  const sortedNames = [...fileMap.keys()].sort();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const name of sortedNames) {
    if (name.includes('\\')) {
      throw new Error(`Invalid backslash in ZIP entry name: ${name}`);
    }
    const nameBuf = Buffer.from(name, 'utf8');
    const rawData = fileMap.get(name);
    const crc = crc32(rawData) >>> 0;
    const compressed = deflateRawSync(rawData, { level: 9 });
    const useDeflate = compressed.length < rawData.length;
    const payload = useDeflate ? compressed : rawData;
    const method = useDeflate ? 8 : 0;

    // Local file header (30 bytes + file name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // general purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(method, 8); // compression method
    localHeader.writeUInt16LE(0, 10); // last mod file time
    localHeader.writeUInt16LE(0x5421, 12); // last mod file date
    localHeader.writeUInt32LE(crc, 14); // crc-32
    localHeader.writeUInt32LE(payload.length, 18); // compressed size
    localHeader.writeUInt32LE(rawData.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuf, payload);

    // Central directory header (46 bytes + file name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(method, 10); // compression method
    centralHeader.writeUInt16LE(0, 12); // time
    centralHeader.writeUInt16LE(0x5421, 14); // date
    centralHeader.writeUInt32LE(crc, 16); // crc-32
    centralHeader.writeUInt32LE(payload.length, 20); // compressed size
    centralHeader.writeUInt32LE(rawData.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // disk where central directory starts
  eocd.writeUInt16LE(sortedNames.length, 8); // central directory records on this disk
  eocd.writeUInt16LE(sortedNames.length, 10); // total central directory records
  eocd.writeUInt32LE(centralDirBuf.length, 12); // size of central directory
  eocd.writeUInt32LE(offset, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

/**
 * ZIP バイナリからエントリ一覧と展開後データを読み戻す（検証用）。
 * @param {Buffer} zipBuf
 * @returns {Map<string, Buffer>}
 */
export function readZipArchiveBuffer(zipBuf) {
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= 0; i -= 1) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('ZIP EOCD シグネチャが見つかりません');
  }
  const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  const out = new Map();
  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error(`Central Directory シグネチャ不正 (index=${idx})`);
    }
    const method = zipBuf.readUInt16LE(ptr + 10);
    const expectedCrc = zipBuf.readUInt32LE(ptr + 16) >>> 0;
    const compSize = zipBuf.readUInt32LE(ptr + 20);
    const uncompSize = zipBuf.readUInt32LE(ptr + 24);
    const nameLen = zipBuf.readUInt16LE(ptr + 28);
    const extraLen = zipBuf.readUInt16LE(ptr + 30);
    const commentLen = zipBuf.readUInt16LE(ptr + 32);
    const localOffset = zipBuf.readUInt32LE(ptr + 42);
    const name = zipBuf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');

    if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Local Header シグネチャ不正 (${name})`);
    }
    const localNameLen = zipBuf.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compSlice = zipBuf.subarray(dataStart, dataStart + compSize);
    const raw = method === 8 ? inflateRawSync(compSlice) : Buffer.from(compSlice);
    if (raw.length !== uncompSize) {
      throw new Error(`展開サイズ不一致 (${name}): expected=${uncompSize}, actual=${raw.length}`);
    }
    const actualCrc = crc32(raw) >>> 0;
    if (actualCrc !== expectedCrc) {
      throw new Error(`CRC32 不一致 (${name})`);
    }
    out.set(name, raw);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * extension-youtube/ を build/submission-youtube-<version>/ にステージし、ZIP を生成・検証する。
 * @param {{ version?: string, extDir?: string, buildDir?: string }} [options]
 * @returns {{ version: string, stageDir: string, zipPath: string, entryNames: string[], zipSizeBytes: number }}
 */
export function stageYoutubeSubmission(options = {}) {
  const extDir = options.extDir || EXT_YOUTUBE_DIR;
  const buildDir = options.buildDir || BUILD_DIR;
  const manifestPath = resolve(extDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest.json が見つかりません: ${manifestPath}`);
  }
  const devManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version = options.version || devManifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(String(version || ''))) {
    throw new Error(`version は "0.1.0" の形式で指定してください (受け取った値: ${version})`);
  }

  const stageDir = resolve(buildDir, `submission-youtube-${version}`);
  if (existsSync(stageDir)) {
    rmSync(stageDir, { recursive: true, force: true });
  }
  mkdirSync(stageDir, { recursive: true });

  const allFiles = walkFilesPosix(extDir);
  const fileMap = new Map();

  for (const relPosix of allFiles) {
    if (isExcludedSubmissionPath(relPosix)) continue;
    if (relPosix === 'manifest.json') continue;
    const srcPath = resolve(extDir, relPosix);
    const dstPath = resolve(stageDir, relPosix);
    mkdirSync(dirname(dstPath), { recursive: true });
    copyFileSync(srcPath, dstPath);
    fileMap.set(relPosix, readFileSync(srcPath));
  }

  const outManifest = buildYoutubeSubmissionManifest(devManifest, version);
  const manifestText = `${JSON.stringify(outManifest, null, 2)}\n`;
  const manifestBuf = Buffer.from(manifestText, 'utf8');
  writeFileSync(resolve(stageDir, 'manifest.json'), manifestBuf);
  fileMap.set('manifest.json', manifestBuf);

  // ステージ状態の検証
  verifyYoutubeSubmissionFileMap(fileMap);

  // ZIP 生成 & 読み戻し検証
  const zipBuf = createZipArchiveBuffer(fileMap);
  const zipPath = resolve(buildDir, `tsuioku-no-kirameki-youtube-${version}.zip`);
  writeFileSync(zipPath, zipBuf);

  const readBackMap = readZipArchiveBuffer(readFileSync(zipPath));
  verifyYoutubeSubmissionFileMap(readBackMap);

  return {
    version,
    stageDir,
    zipPath,
    entryNames: [...readBackMap.keys()].sort(),
    zipSizeBytes: statSync(zipPath).size,
  };
}

// CLI 直接実行時
const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const versionArg = process.argv[2];
  const result = stageYoutubeSubmission({ version: versionArg });
  console.log(`staged:  ${result.stageDir}`);
  console.log(`zipped:  ${result.zipPath} (${result.zipSizeBytes.toLocaleString()} bytes)`);
  console.log(`entries: ${result.entryNames.length} files`);
}
