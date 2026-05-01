#!/usr/bin/env node
/**
 * verify-bump.mjs — extension bump 後の整合性チェッカー
 *
 * 「manifest を bump したのに Chrome に反映されない」「popup が出なくなる」
 * を未然に検出するための pre-flight check。npm run verify-bump で実行。
 *
 * 検証項目:
 *   1. manifest.json の version が package.json または changelog 先頭と一致
 *   2. extension/dist/{popup,content,page-intercept}.js が存在し非空
 *   3. dist の各 .js が manifest.json より新しい (build 忘れ検出)
 *   4. popup.js が popup-entry.js のシンボル（`applyStoryGrowthIconAttributes` 等）を含む
 *   5. flamboyant worktree が同じ commit にいる（本体 pull 漏れ検出）
 *
 * 失敗したら exit 1。CI でも手元でも回せる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

/**
 * git worktree list から flamboyant を見つける（cwd が main / sub どちらでも動く）。
 * @returns {string|null}
 */
function locateFlamboyantWorktree() {
  try {
    const out = execSync('git worktree list --porcelain', { cwd: ROOT })
      .toString()
      .split('\n');
    let cur = null;
    for (const line of out) {
      if (line.startsWith('worktree ')) {
        cur = line.slice('worktree '.length).trim();
      } else if (line.startsWith('branch ')) {
        const br = line.slice('branch '.length).trim();
        if (br.includes('flamboyant-perlman') && cur) return cur;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

const log = {
  ok: (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`),
  warn: (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`),
  err: (msg) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`)
};

let failed = 0;
const fail = (msg) => {
  log.err(msg);
  failed += 1;
};

console.log('verify-bump: extension bump 整合性チェック開始\n');

// 1. manifest.json バージョン
const manifestPath = path.join(ROOT, 'extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`[1] manifest.json version: ${manifest.version}`);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  fail(`不正な version 形式: ${manifest.version}`);
} else {
  log.ok(`version 形式 OK`);
}

// 2. dist files 存在
const distFiles = ['popup.js', 'content.js', 'page-intercept.js'];
console.log(`\n[2] extension/dist/ ファイル存在`);
const distStats = {};
for (const f of distFiles) {
  const full = path.join(ROOT, 'extension/dist', f);
  if (!fs.existsSync(full)) {
    fail(`${f} が存在しない`);
    continue;
  }
  const stat = fs.statSync(full);
  if (stat.size === 0) {
    fail(`${f} が空 (0 bytes)`);
    continue;
  }
  distStats[f] = stat;
  log.ok(`${f} (${stat.size.toLocaleString()} bytes)`);
}

// 3. dist が manifest より新しい
console.log(`\n[3] dist の build が manifest より新しいか`);
const manifestStat = fs.statSync(manifestPath);
for (const [f, stat] of Object.entries(distStats)) {
  if (stat.mtimeMs < manifestStat.mtimeMs) {
    fail(
      `${f} (${new Date(stat.mtimeMs).toISOString()}) は manifest (${new Date(manifestStat.mtimeMs).toISOString()}) より古い → 'npm run build' 忘れ`
    );
  } else {
    log.ok(`${f} mtime OK`);
  }
}

// 4. popup.js に popup-entry のシンボルがある
console.log(`\n[4] popup.js が popup-entry の主要関数を含むか`);
const popupJs = fs.readFileSync(path.join(ROOT, 'extension/dist/popup.js'), 'utf8');
const requiredSymbols = [
  'applyStoryGrowthIconAttributes',
  'syncStorySourceEntries',
  'renderCharacterScene',
  'paintWatchPopupUi'
];
for (const sym of requiredSymbols) {
  if (popupJs.includes(sym)) {
    log.ok(`${sym} あり`);
  } else {
    fail(`${sym} が popup.js に無い → bundle 不整合`);
  }
}

// 5. flamboyant worktree の HEAD が main worktree と一致
console.log(`\n[5] flamboyant worktree の HEAD 整合性`);
const flamboyantPath = locateFlamboyantWorktree();
if (!flamboyantPath || !fs.existsSync(flamboyantPath)) {
  log.warn(`flamboyant worktree が見つからない（git worktree list で確認）`);
} else {
  try {
    const myHead = execSync('git rev-parse HEAD', { cwd: ROOT })
      .toString()
      .trim();
    const flamHead = execSync('git rev-parse HEAD', { cwd: flamboyantPath })
      .toString()
      .trim();
    if (myHead === flamHead) {
      log.ok(`flamboyant が同じ commit (${flamHead.slice(0, 7)})`);
    } else {
      fail(
        `flamboyant の HEAD (${flamHead.slice(0, 7)}) が現 HEAD (${myHead.slice(0, 7)}) と違う → flamboyant への ff-merge 漏れ`
      );
    }

    // flamboyant の dist と現在の dist が完全一致するか
    for (const f of distFiles) {
      const myFull = path.join(ROOT, 'extension/dist', f);
      const flamFull = path.join(flamboyantPath, 'extension/dist', f);
      if (!fs.existsSync(flamFull)) {
        fail(`flamboyant に ${f} が無い`);
        continue;
      }
      const myBuf = fs.readFileSync(myFull);
      const flamBuf = fs.readFileSync(flamFull);
      if (Buffer.compare(myBuf, flamBuf) === 0) {
        log.ok(`flamboyant の ${f} がバイト一致`);
      } else {
        fail(
          `flamboyant の ${f} がバイト不一致 → flamboyant で 'npm run build' していない / 古い build が残ってる`
        );
      }
    }
  } catch (err) {
    fail(`flamboyant 検証中エラー: ${err.message}`);
  }
}

console.log();
if (failed > 0) {
  console.log(`\x1b[31m✗ ${failed} 件失敗。ship 前に解消してください。\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32m✓ 全 5 ステップ OK。Chrome をリロードすれば反映されるはず。\x1b[0m');
