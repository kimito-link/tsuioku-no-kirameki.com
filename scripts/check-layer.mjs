#!/usr/bin/env node
/**
 * check-layer.mjs — ★`src/lib` が「純粋ロジックの箱」であり続けることを機械で守る。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザーの要求(2026-08-21)がこの検査の出発点
 *   「AIが見ても人間が見ても分かるコード構成がほしい。
 *     他のプログラムをAIに(こう)したいと伝えても、すぐに理解できる気がします」
 *
 * ■ ★実測で分かったこと(推測ではない)
 *   `src/lib` は 719ファイル・平均37行で、**大半が既に純粋関数**だった。
 *   さらに **lib→entry の逆流 import は 0件**＝層構造は既に事実として守られている。
 *   ★つまり問題は「守られていない」ことではなく **「守られている事実がどこにも書かれていない」** こと。
 *   → 書いたもの(`src/lib/AGENTS.md`)が**腐らないように**この検査を置く。
 *
 * ■ ★なぜ dependency-cruiser を使わないか(2026-08-21 に実在調査した上での判断)
 *   層ルール+ベースラインを持つ優れたツールだが、★**パスでしか層を認識できない**。
 *   `src/lib` はフラット(サブディレクトリ2個)なので、使うには**719ファイルの移動**が要る。
 *   ★違反0・逆流0の現状で、その移動コストは見合わない。
 *   将来 lib を層別ディレクトリに整理するなら再検討する。
 *
 * ■ 掟(このリポで実際に生き残った仕掛けの形)
 *   ★**ベースライン方式**: 既存の非純粋ファイルは許容し、**新規に増えたら赤**。
 *     生き残った仕掛けは全てこの形(未記入数のラチェット/バンドル予算/storage断線検出)。
 *     死んだのは「オプトインの台帳」＝デフォルト値を用意した瞬間に死ぬ。
 *
 * ■ ★誤検出を出さないための工夫(これが無いと検査が信用されず死ぬ)
 *   1. ブロックコメント `/* … *\/` と行コメントを除く
 *   2. ★**文字列リテラルを潰す**。これが無いと
 *      `writtenBy: 'chrome.tabs.query (…)'`(statusReadPolicy.js)や
 *      changelog 本文の「chrome.downloads で…」を**実コードと誤認**する。
 *      ★実際 2026-08-21 に私はこの誤検出で2件を「違反」と誤って数えた。
 *   3. プロパティ名 `foo.document` を拾わないよう直前の `.` を除外する
 *
 * 使い方:
 *   node scripts/check-layer.mjs           一覧を出す(常に exit 0)
 *   node scripts/check-layer.mjs --check   ★ベースラインより増えていたら exit 1
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'src', 'lib');
const CHECK = process.argv.includes('--check');

/**
 * ★I/O とみなす入口。ここに載っているものは「純粋ではない」。
 * 直前が `.` や引用符でないこと(プロパティ名・文字列の一部を拾わない)を要求する。
 */
const IO_RE =
  /(?:^|[^\w.'"`])(chrome\.[a-z]\w*|fetch|localStorage|sessionStorage|indexedDB|document|window)\s*[.(]/;

/**
 * ★実コードだけを残す。コメントと文字列リテラルを潰す。
 *
 * @param {string} text
 * @returns {string}
 */
function codeOnly(text) {
  let s = text.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
  // ★文字列の中の "chrome.tabs.query" を実コードと誤認しないため潰す。
  s = s.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  s = s.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  return s;
}

/**
 * @returns {{ name: string, kinds: string[] }[]} 非純粋なファイル(名前順)
 */
function scanImpure() {
  /** @type {{ name: string, kinds: string[] }[]} */
  const out = [];
  for (const name of readdirSync(LIB)) {
    if (!name.endsWith('.js') || name.endsWith('.test.js')) continue;
    const p = join(LIB, name);
    if (!statSync(p).isFile()) continue;
    const code = codeOnly(readFileSync(p, 'utf8'));
    /** @type {Set<string>} */
    const kinds = new Set();
    for (const line of code.split('\n')) {
      const m = line.match(IO_RE);
      if (m) kinds.add(m[1]);
    }
    if (kinds.size) out.push({ name, kinds: [...kinds].sort() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * ★ベースライン: 2026-08-21 時点で非純粋だったファイル(実測)。
 *
 * ★1件ずつ実コードで確認済み。大半は「名前の通り副作用を持つ箱」
 *   (`*Dom.js` / `*Client.js` / `*Html.js` / `*Db.js` / `*Store.js` など)。
 * ★純粋にしたらこの一覧から**消してよい**(減る方向は check を通る)。
 * ★新しくここに載せたいときは、**なぜ lib に置くのか**を1行添えること。
 */
const IMPURE_BASELINE = new Set([
  // ── DOM を直接触る箱(名前で分かる) ──────────────────────────
  'avatarPartsComposer.js', 'chikuranHeaderDom.js', 'commentPostDom.js',
  'inlineBelowWideRowInsert.js', 'laneDomSelfMeasure.js', 'laneTickProbe.js',
  'mirrorSanitize.js', 'paintTopSupportRankStyleIntoElement.js', 'panelWakeCurtainDom.js',
  'personTileDom.js', 'reportCommentsTableSection.js', 'supportGrowthAvatarLoad.js',
  'supporterRankingDom.js', 'venueDomCensus.js', 'videoCapture.js',
  'watchCelebrationOverlay.js',
  // ── HTML を組み立てて window/document を見る箱 ────────────────
  'marketingChartsHtml.js', 'mediaKitHtml.js',
  // ── 保存(IndexedDB / storage)を持つ箱 ───────────────────────
  'broadcastSessionSummaryDb.js', 'broadcastSessionSummaryFlush.js', 'commentDb.js',
  'customSoundStore.js', 'diagnosticRingStore.js', 'globalBackfillQueue.js',
  'reportPreviewPublish.js', 'thumbDb.js',
  // ── 通信する箱 ──────────────────────────────────────────
  'kokenGiftHistoryFetchClient.js', 'liveviewErrorReport.js', 'officialEventDomBundle.js',
  'statusMindmapModel.js', 'voicevoxClient.js',
  // ── 音・映像の再生(ブラウザAPIが本体) ────────────────────────
  'bgmDirector.js', 'effectSoundPlayer.js', 'reportCompleteVoice.js', 'scoreCountUp.js',
  'voiceComment.js', 'voiceInputDevices.js',
  // ── 計測・診断で window/document/storage を読む箱 ──────────────
  'consoleErrorBuffer.js', 'devMonitorTrendSession.js', 'globalFetchRateLimiter.js',
  'interceptVisitorProbeDebug.js', 'mainThreadBlockerBoot.js', 'nameplateToggleBoot.js',
  'nicoCommentPanelAssetLauncher.js', 'watchPopupLoadDiagnostics.js'
]);

const impure = scanImpure();
const names = impure.map((r) => r.name);
const added = names.filter((n) => !IMPURE_BASELINE.has(n));
const total = readdirSync(LIB).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')).length;

if (!CHECK) {
  console.log(`[check-layer] src/lib ${total} ファイル中、純粋 ${total - impure.length} / 非純粋 ${impure.length}`);
  for (const r of impure) {
    const mark = IMPURE_BASELINE.has(r.name) ? ' ' : '★新規';
    console.log(`  ${mark} ${r.name.padEnd(42)} ${r.kinds.join(' ')}`);
  }
  process.exit(0);
}

if (added.length) {
  console.error('[check-layer] ★src/lib に【純粋でない】ファイルが増えました:');
  for (const n of added) {
    const r = impure.find((x) => x.name === n);
    console.error(`  - ${n} (${r ? r.kinds.join(' ') : ''})`);
  }
  console.error('');
  console.error('  src/lib は「純粋ロジックの箱」です(src/lib/AGENTS.md)。次のどれかにしてください:');
  console.error('   1. I/O を呼び出し側(entry)へ move し、lib には判定だけ残す');
  console.error('   2. どうしても lib に置くなら scripts/check-layer.mjs の');
  console.error('      IMPURE_BASELINE に【理由を1行添えて】追記する');
  process.exit(1);
}

console.log(`[check-layer] OK(純粋 ${total - impure.length} / 非純粋 ${impure.length}・ベースライン内)`);
