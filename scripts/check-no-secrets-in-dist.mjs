#!/usr/bin/env node
/**
 * check-no-secrets-in-dist.mjs — ビルド成果物に秘密情報が焼き込まれていないか検査する(fail-closed)。
 *
 * ★2026-08-03 の事故:
 *   status の共有キー(ingestKey = /api/status の【書き込み】認証 / viewToken = 閲覧トークン)を
 *   esbuild の define でビルドに埋め込んでいた。`extension/dist/status.js` は **git 追跡下**で
 *   **公開リポジトリに push されていた**ため、書き込み認証キーが GitHub 上で誰でも読める
 *   状態だった(CRX を展開するまでもない)。
 *
 *   v0.1.1242 で「提出ZIPのときだけ空にする」対処を入れたが、それはZIPを守るだけで、
 *   **通常ビルドの成果物を push すれば新しい鍵がまた公開される**構造は残っていた。
 *   鍵のローテーションでは根治しない。v0.1.1245 で define を全廃し、鍵は
 *   chrome.storage.local(利用者が入力)へ移した。
 *
 *   この検査は「二度と焼き込まれないこと」を機械で保証する。**人の注意力に頼らない**。
 *
 * 使い方:
 *   node scripts/check-no-secrets-in-dist.mjs          # 追跡下の dist を検査
 *   node scripts/check-no-secrets-in-dist.mjs <path>   # 任意のディレクトリを検査
 */

import fs from 'node:fs';
import path from 'node:path';

/** 検査対象。git 追跡下＝push される＝公開されうる場所。 */
const DEFAULT_DIRS = ['extension/dist', 'app/dist'];

/**
 * 「キー名: "値"」の形で、値が空でないものを秘密の焼き込みとみなす。
 * 空文字("")は「未設定」を表す正常な状態なので通す。
 */
const SECRET_FIELD_RE = /(ingestKey|viewToken|apiKey|secret|accessToken|refreshToken|clientSecret)\s*:\s*"([^"]+)"/g;

/**
 * 値そのものが秘密に見えるパターン（フィールド名に頼らない二重の網）。
 * 実際に漏れた2つの鍵の形（32文字/43文字の URL-safe 乱数）を含む。
 */
const SECRET_VALUE_RES = [
  { name: 'Google OAuth client secret', re: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: 'Google API key', re: /AIza[A-Za-z0-9_-]{30,}/ },
  { name: 'Slack token', re: /xox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

/** 誤検知を避けるための許可（変数名・型名など、値でないもの）。 */
function isBenign(value) {
  const v = String(value || '');
  if (!v) return true; // 空 = 未設定 = 正常
  if (v.length < 8) return true; // 短すぎる = 鍵ではない
  if (/^[a-z][A-Za-z0-9_]*$/.test(v) && v.length < 24) return true; // 変数名らしきもの
  return false;
}

/** @param {string} dir @returns {string[]} */
function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(p));
    else if (entry.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const dirs = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_DIRS;
/** @type {string[]} */
const findings = [];

for (const dir of dirs) {
  for (const file of listJsFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    SECRET_FIELD_RE.lastIndex = 0;
    let m;
    while ((m = SECRET_FIELD_RE.exec(text)) !== null) {
      const [, field, value] = m;
      if (isBenign(value)) continue;
      findings.push(`${file}: ${field} に値が焼き込まれています（${value.length}文字）`);
    }
    for (const { name, re } of SECRET_VALUE_RES) {
      if (re.test(text)) findings.push(`${file}: ${name} らしき文字列が含まれています`);
    }
  }
}

if (findings.length) {
  console.error('[check-no-secrets-in-dist] ビルド成果物に秘密情報が含まれています:\n');
  for (const f of findings) console.error(`  ✗ ${f}`);
  console.error(
    '\n  dist は git 追跡下＝push すると公開リポジトリで誰でも読めます。\n' +
      '  秘密はビルドに焼き込まず、chrome.storage.local(利用者が入力)へ置いてください。\n' +
      '  正本の実装: src/extension/status-entry.js の getUploadConfig / setUploadConfig\n'
  );
  process.exit(1);
}

console.log(`[check-no-secrets-in-dist] OK（検査対象: ${dirs.join(', ')}）`);
