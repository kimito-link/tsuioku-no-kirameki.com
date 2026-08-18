#!/usr/bin/env node
/**
 * dump-panel-state.mjs — 実機の chrome.storage.local を吸い出して
 *   `.auth/panel-state.json`（storageState 相当）に保存する。
 *
 * ■ なぜ要るか（2026-08-10 実機で確定）
 *   サイドパネルの黒画面は【実データがある時だけ】重い初期化を通り、
 *   幕(cloak)が t+5887ms まで残る。空の storage で e2e を走らせると
 *   t+592ms で解除されてしまい、修正前でも症状が再現しない
 *   ＝「緑だから直った」と誤読する。実機の重さを持ち込むための吸い出し。
 *   （[[prove-fix-by-replaying-old-code-2026-08-09]]: 同じハーネスで
 *     修正前を再生して症状が再現して初めて緑に意味が出る）
 *
 * ■ 使い方
 *     node scripts/dump-panel-state.mjs
 *   Chrome のプロファイルを起動して拡張の storage を読むのではなく、
 *   ユーザーに「状態速報のコピー」を渡してもらう手間を避けるため、
 *   拡張の unpacked ディレクトリを読み込んだ一時プロファイルで開く。
 *
 *   ★実データはユーザーの実プロファイルにしか無いので、既定では
 *     `--user-data-dir` に実プロファイルのコピーを指定する必要がある。
 *     指定が無ければ「何も吸い出せない」ことを明示して終わる（黙って
 *     空を書かない＝空フィクスチャで緑になる事故を防ぐ）。
 *
 * ■ 出力
 *   .auth/panel-state.json （git 管理外。実データを含むのでコミット禁止）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const EXT_DIR = path.join(repoRoot, 'extension');
const OUT_DIR = path.join(repoRoot, '.auth');
const OUT_FILE = path.join(OUT_DIR, 'panel-state.json');

/**
 * 吸い出す価値のあるキーだけに絞る（全部だと数十MBになりうる）。
 *
 * ★2026-08-17: `nls_cchunk_` を追加。**コメント本体の正本はチャンク形式**
 *   (`nls_cchunk_<lv>_<seq>` + `nls_cchunk_index_<lv>`・src/lib/commentChunkStore.js)。
 *   接頭辞は `nls_comments_` と【意図的に衝突させていない】(commentChunkStore.js:16)ため、
 *   `nls_comments_` だけを列挙していた旧実装は **本体を1件も吸い出せなかった**。
 *   旧 `nls_comments_<lv>` は移行後もバックアップとして残るが新規行は入らない
 *   (commentChunkStore.js:21)＝空に近い配列だけを取って「取れた」と誤認する状態だった。
 *   ★これに気づいたきっかけ: 「匿名にサムネ/名前があるか」を実データで数えようとして、
 *     吸い出し結果に本体が無いと判明した(仕様見直し会議 2026-08-17)。
 */
const KEY_PREFIXES = [
  'nls_comments_',
  'nls_cchunk_',
  'nls_ctail_',
  'nls_summary_',
  'nls_watch_snapshot',
  'nls_nicoad_api_ranking_',
  'nls_koken_',
  'nls_lane_',
  'nls_panel_',
  'nls_inline_'
];

function parseArgs(argv) {
  const out = { userDataDir: '', maxBytes: 40 * 1024 * 1024 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--user-data-dir') out.userDataDir = String(argv[i + 1] || '');
    if (a.startsWith('--user-data-dir=')) out.userDataDir = a.slice('--user-data-dir='.length);
  }
  return out;
}

const args = parseArgs(process.argv);

if (!args.userDataDir) {
  console.error(
    [
      '実データが必要です。実プロファイルの【コピー】を指定してください:',
      '',
      '  # Chrome を閉じてから、プロファイルを複製する',
      '  cp -r "$LOCALAPPDATA/Google/Chrome/User Data" /tmp/chrome-profile-copy',
      '  node scripts/dump-panel-state.mjs --user-data-dir=/tmp/chrome-profile-copy',
      '',
      '★実プロファイルを直接渡さないこと（Chrome が起動中だとロックされ、',
      '  かつ Playwright が設定を書き換える可能性がある）。',
      '',
      '空の storage で e2e を走らせると、修正前でも症状が再現せず',
      '「緑だから直った」と誤読するため、ここでは空を書かずに終了します。'
    ].join('\n')
  );
  process.exit(2);
}

if (!fs.existsSync(EXT_DIR)) {
  console.error(`拡張ディレクトリが見つかりません: ${EXT_DIR}`);
  process.exit(1);
}

const context = await chromium.launchPersistentContext(args.userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`]
});

try {
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });

  const state = await sw.evaluate(async (prefixes) => {
    const all = await chrome.storage.local.get(null);
    /** @type {Record<string, unknown>} */
    const picked = {};
    for (const [k, v] of Object.entries(all)) {
      if (prefixes.some((p) => k.startsWith(p))) picked[k] = v;
    }
    return picked;
  }, KEY_PREFIXES);

  const json = JSON.stringify(state, null, 2);
  if (json.length > args.maxBytes) {
    console.error(`吸い出し結果が大きすぎます (${Math.round(json.length / 1024 / 1024)}MB)。`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, json);
  const keys = Object.keys(state).length;
  console.log(`[dump] ${keys} keys / ${Math.round(json.length / 1024)}KB → ${OUT_FILE}`);
  if (keys === 0) {
    console.error('★0 キーでした。拡張が動いているプロファイルを指定できていない可能性があります。');
    process.exit(3);
  }
} finally {
  await context.close();
}
