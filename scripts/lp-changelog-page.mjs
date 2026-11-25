#!/usr/bin/env node
/**
 * 紹介ページの「更新履歴（全版）」tsuioku-no-kirameki/changelog.html を changelog から書き直す。
 *   node scripts/lp-changelog-page.mjs          … 書き直す
 *   node scripts/lp-changelog-page.mjs --check  … 古ければ exit 1
 * npm run build からも呼ぶ（版を上げて build すれば自動でそろう）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXTENSION_CHANGELOG } from '../src/lib/changelog.js';
import { EXTENSION_CHANGELOG_ARCHIVE } from '../src/lib/changelog-archive.js';
import { renderLpChangelogPage } from '../src/lib/lpChangelogPage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LP_CHANGELOG_PAGE_PATH = resolve(ROOT, 'tsuioku-no-kirameki/changelog.html');

export function buildLpChangelogPageHtml() {
  return renderLpChangelogPage({
    entries: [...EXTENSION_CHANGELOG, ...EXTENSION_CHANGELOG_ARCHIVE]
  });
}

/** @returns {boolean} 書き直したら true */
export function writeLpChangelogPage() {
  const html = buildLpChangelogPageHtml();
  const prev = existsSync(LP_CHANGELOG_PAGE_PATH) ? readFileSync(LP_CHANGELOG_PAGE_PATH, 'utf8') : '';
  if (prev === html) return false;
  writeFileSync(LP_CHANGELOG_PAGE_PATH, html);
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--check')) {
    const prev = existsSync(LP_CHANGELOG_PAGE_PATH) ? readFileSync(LP_CHANGELOG_PAGE_PATH, 'utf8') : '';
    if (prev !== buildLpChangelogPageHtml()) {
      console.error('tsuioku-no-kirameki/changelog.html が changelog と違います。node scripts/lp-changelog-page.mjs（または npm run build）で書き直してください。');
      process.exit(1);
    }
    console.log('changelog.html は最新です');
  } else {
    console.log(writeLpChangelogPage() ? 'changelog.html を書き直しました' : 'changelog.html は最新です');
  }
}
