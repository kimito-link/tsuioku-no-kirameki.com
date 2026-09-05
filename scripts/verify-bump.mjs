#!/usr/bin/env node
/**
 * verify-bump.mjs — extension bump 後の整合性チェッカー
 *
 * 「manifest を bump したのに Chrome に反映されない」「popup が出なくなる」
 * を未然に検出するための pre-flight check。npm run verify-bump で実行。
 *
 * 検証項目:
 *   0. changelog/manifest/package の版番号が三者一致+先頭エントリの体裁 (v0.1.835)
 *   1. manifest.json の version が package.json または changelog 先頭と一致
 *   2. extension/dist/{popup,content,page-intercept}.js が存在し非空
 *   3. dist の各 .js が manifest.json より新しい (build 忘れ検出)
 *   4. popup.js が popup-entry.js のシンボル（`applyStoryGrowthIconAttributes` 等）を含む
 *   5. flamboyant worktree が同じ commit にいる（本体 pull 漏れ検出）
 *   6. 紹介LP の掲載【版数】が package と一致（版数表記は常に追従）
 *   7. ★紹介LP の掲載【内容】が何版ぶん止まっているか（警告のみ・載せることは強制しない）
 *
 * 失敗したら exit 1。CI でも手元でも回せる。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  judgeLpContentStaleness,
  formatLpStalenessLine
} from '../src/lib/lpContentStaleness.js';
import { execSync } from 'node:child_process';
import { EXTENSION_CHANGELOG } from '../src/lib/changelog.js';
import { checkChangelogConsistency } from '../src/lib/changelogConsistency.js';

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

// 0. changelog/manifest/package 版番号の三者一致 + 先頭エントリ体裁 (v0.1.835)
//    self-verifying loop の取り込み: 「どれか1つだけ bump し忘れ」を verify:cc 必須経路で機械照合。
//    純ロジックは src/lib/changelogConsistency.js(test 付き)。正本=council/self-verifying-loop-SYNTHESIS.md。
const manifestPath = path.join(ROOT, 'extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
console.log('[0] changelog/manifest/package 版番号の三者一致');
{
  const head = EXTENSION_CHANGELOG[0];
  const violations = checkChangelogConsistency({
    changelogVersion: head?.version,
    manifestVersion: manifest.version,
    packageVersion: pkg.version,
    headEntry: head
  });
  if (violations.length === 0) {
    log.ok(`三者一致 OK (${manifest.version})`);
  } else {
    for (const v of violations) fail(v);
  }
}

// 1. manifest.json バージョン
console.log(`\n[1] manifest.json version: ${manifest.version}`);
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

// 6. 紹介LP(tsuioku-no-kirameki/index.html) の掲載版数が package と一致 (v0.1.1210)
//    2026-08-01: LP が v0.1.1193 のまま 15 版ぶん取り残されていたのを発見。
//    「LPを最新化した」と報告した直後からまた乖離しており、手作業では再発すると判明したため
//    機械照合に載せる。
//    ★方針の分離: 「版数表記は常に追従・掲載内容は選別」。
//      診断計器のみの版を LP の機能紹介に載せない従来方針とは衝突しない(版数だけ追う)。
console.log(`\n[6] 紹介LP の掲載版数が package と一致`);
{
  const lpPath = path.join(ROOT, 'tsuioku-no-kirameki/index.html');
  if (!fs.existsSync(lpPath)) {
    log.warn('紹介LP が見つからない（tsuioku-no-kirameki/index.html）');
  } else {
    const lp = fs.readFileSync(lpPath, 'utf8');
    const want = pkg.version;
    // 「現在版」を示す 4 箇所だけを狙う。本文中の機能説明にも（v0.1.240）のような
    // 過去版の表記が多数あるため、単純な全文スキャンでは誤検知する。
    /** @type {ReadonlyArray<{ name: string, re: RegExp }>} */
    const spots = [
      { name: 'meta description', re: /<meta\s+name="description"[^>]*?（v(\d+\.\d+\.\d+)）[^>]*>/ },
      { name: 'JSON-LD softwareVersion', re: /"softwareVersion":"(\d+\.\d+\.\d+)"/ },
      {
        name: 'twitter:description',
        re: /<meta\s+name="twitter:description"[^>]*?（v(\d+\.\d+\.\d+)）[^>]*>/
      },
      { name: 'フッター', re: /追憶のきらめき v(\d+\.\d+\.\d+)/ }
    ];
    for (const spot of spots) {
      const m = lp.match(spot.re);
      if (!m) {
        fail(`LP の版数表記が見つからない: ${spot.name}（表記の形が変わった可能性）`);
      } else if (m[1] !== want) {
        fail(`LP の ${spot.name} が v${m[1]} → package の v${want} に合わせてください`);
      } else {
        log.ok(`${spot.name} v${m[1]}`);
      }
    }
  }
}

// [7] ★紹介LP の「掲載内容」が何版ぶん止まっているか
//    2026-08-23: [6](版数)は完全に一致していたのに、★本文は242版ぶん止まっていた。
//    LPを触った直近40コミットが【すべて4行だけ】＝[6]が見ている4箇所だけが動き、
//    ★機械が見ていない本文は一度も動かなかった。
//    ★ここは fail にしない。「載せないと赤」にすると LP が計器の羅列になり、
//      ユーザーに関係のない版まで載せる動機を作ってしまう（＝LPの価値が下がる）。
//      判定は src/lib/lpContentStaleness.js（純関数・19テスト・毒で赤を確認済み）。
console.log(`
[7] 紹介LP の掲載内容の鮮度（★警告のみ）`);
{
  const lpPath = path.join(ROOT, 'tsuioku-no-kirameki/index.html');
  if (!fs.existsSync(lpPath)) {
    log.warn('紹介LP が見つからない（tsuioku-no-kirameki/index.html）');
  } else {
    const verdict = judgeLpContentStaleness({
      html: fs.readFileSync(lpPath, 'utf8'),
      currentVersion: pkg.version
    });
    const line = formatLpStalenessLine(verdict);
    if (verdict.state === 'fresh') {
      log.ok(line);
    } else {
      // ★stale も unknown も warn。unknown を緑にはしない。
      for (const row of line.split('\n')) log.warn(row);
    }
  }
}

console.log();
if (failed > 0) {
  console.log(`\x1b[31m✗ ${failed} 件失敗。ship 前に解消してください。\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32m✓ 全 7 ステップ OK。Chrome をリロードすれば反映されるはず。\x1b[0m');
