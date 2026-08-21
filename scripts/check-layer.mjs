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
import { writeFileSync, unlinkSync } from 'node:fs';
import { EXIT, computeExitCode, formatProbeReport, runSelfTest } from './lib/instrument-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'src', 'lib');
const CHECK = process.argv.includes('--check');
/** ★検知器に毒を食わせて赤が出るか確かめる(45リポからの収穫)。 */
const SELFTEST = process.argv.includes('--selftest');

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
 * ★判定の正本。HTML 版(layer-map-html.mjs)もこれを import して使う
 *   ＝**二重実装しない**(ズレると「どちらが本当か」で必ず事故る)。
 *
 * @param {string} [dir] 走査するディレクトリ(既定 src/lib)
 * @returns {{ name: string, kinds: string[] }[]} 非純粋なファイル(名前順)
 */
export function scanLibPurity(dir = LIB) {
  /** @type {{ name: string, kinds: string[] }[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.js') || name.endsWith('.test.js')) continue;
    const p = join(dir, name);
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
export const IMPURE_BASELINE = new Set([
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

/**
 * ★例外を「種類」でまとめ、**なぜ lib に置くのか**を書く。
 *
 * ★名前を41個並べても人は読めない。**種類と理由**があって初めて意味を持つ
 *   ([[instrument-must-name-the-cause-2026-08-01]] と同じ考え)。
 * ★HTML 版(docs/layer-map.html)はこの表で章立てする。
 */
export const IMPURE_REASONS = /** @type {Record<string,{group:string,why:string}>} */ ({});
{
  /** @param {string} group @param {string} why @param {string[]} files */
  const g = (group, why, files) => {
    for (const f of files) IMPURE_REASONS[f] = { group, why };
  };
  g('DOM を組み立てる', '5画面(popup/venue/comeview/status/web版)が同じ見た目を作るため。ここに無いと5箇所にコピーが増える。', [
    'avatarPartsComposer.js', 'chikuranHeaderDom.js', 'commentPostDom.js',
    'inlineBelowWideRowInsert.js', 'laneDomSelfMeasure.js', 'laneTickProbe.js',
    'mirrorSanitize.js', 'paintTopSupportRankStyleIntoElement.js', 'panelWakeCurtainDom.js',
    'personTileDom.js', 'reportCommentsTableSection.js', 'supportGrowthAvatarLoad.js',
    'supporterRankingDom.js', 'venueDomCensus.js', 'videoCapture.js', 'watchCelebrationOverlay.js'
  ]);
  g('HTML を作る', '出力先が複数(レポート / プレビュー)なので、組み立てを1箇所に置く。', [
    'marketingChartsHtml.js', 'mediaKitHtml.js'
  ]);
  g('保存する', '書き手が複数コンテキスト(content / offscreen / SW)にまたがる。正本を1つにするため。', [
    'broadcastSessionSummaryDb.js', 'broadcastSessionSummaryFlush.js', 'commentDb.js',
    'customSoundStore.js', 'diagnosticRingStore.js', 'globalBackfillQueue.js',
    'reportPreviewPublish.js', 'thumbDb.js'
  ]);
  g('通信する', '外部APIの作法(認証・リトライ・形)を1箇所に閉じ込めるため。', [
    'kokenGiftHistoryFetchClient.js', 'liveviewErrorReport.js', 'officialEventDomBundle.js',
    'statusMindmapModel.js', 'voicevoxClient.js'
  ]);
  g('音・映像を鳴らす', 'ブラウザAPI(Audio / メディア)そのものが機能の本体なので切り離せない。', [
    'bgmDirector.js', 'effectSoundPlayer.js', 'reportCompleteVoice.js', 'scoreCountUp.js',
    'voiceComment.js', 'voiceInputDevices.js'
  ]);
  g('計測・診断', '測る対象がブラウザの状態そのもの(スレッド停止・エラー・ストレージ)。', [
    'consoleErrorBuffer.js', 'devMonitorTrendSession.js', 'globalFetchRateLimiter.js',
    'interceptVisitorProbeDebug.js', 'mainThreadBlockerBoot.js', 'nameplateToggleBoot.js',
    'nicoCommentPanelAssetLauncher.js', 'watchPopupLoadDiagnostics.js'
  ]);
}

/*
 * ★ここから下は CLI として実行されたときだけ走る。
 *   import されたとき(HTML版が判定を借りるとき)に prosess.exit しないようにする。
 */
const isCli = process.argv[1] && process.argv[1].endsWith('check-layer.mjs');
if (!isCli) { /* import 用途: 何もしない */ } else {

const impure = scanLibPurity();
const names = impure.map((r) => r.name);
const added = names.filter((n) => !IMPURE_BASELINE.has(n));
const total = readdirSync(LIB).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')).length;

/*
 * ★--selftest: 検知器に毒を食わせ、赤が出ることを確認する(45リポからの収穫)。
 *   収穫元: soushin-suggest.link/scripts/blank-map.mjs:556
 *   ★これまで私は【毎回手で】変異テストをしていた。手作業は忘れる。
 *   ★仕掛けの生死は「サボると赤くなるか」で決まるので、
 *     検知器自身が赤くなれることを機械で確かめる。
 */
if (SELFTEST) {
  const probeFile = join(LIB, '__selftest_probe__.js');
  const { ok, fails } = runSelfTest([
    {
      name: '純粋性の検知',
      // ★毒: I/O を使う一時ファイルを置く。状態に依存しない毒にする
      //   (収穫元の失敗記録: 特定項目の状態に依存した selftest は、その項目を
      //    実装した瞬間に壊れた)。
      poison: () => writeFileSync(probeFile, 'export const x = () => document.title;\n'),
      restore: () => { try { unlinkSync(probeFile); } catch { /* 既に無い */ } },
      isRed: () => scanLibPurity().some((r) => r.name === '__selftest_probe__.js')
    },
    {
      name: '文字列の誤検出よけ',
      // ★毒の逆: 文字列の中に書いても【赤にしてはいけない】。
      //   これが壊れると誤検出だらけになり、検査が信用されず死ぬ。
      poison: () => writeFileSync(probeFile, "export const s = 'document.title は文字列';\n"),
      restore: () => { try { unlinkSync(probeFile); } catch { /* 既に無い */ } },
      // ★ここだけ「赤にならないこと」が合格なので反転して渡す
      isRed: () => !scanLibPurity().some((r) => r.name === '__selftest_probe__.js')
    }
  ]);
  if (!ok) {
    console.error('[check-layer] ★selftest 失敗(検知器が効いていません):');
    for (const f of fails) console.error('  - ' + f);
    process.exit(EXIT.FAIL);
  }
  console.log('[check-layer] selftest OK(毒を入れると赤くなる / 文字列は誤検出しない)');
  process.exit(EXIT.PASS);
}

if (!CHECK) {
  console.log(`[check-layer] src/lib ${total} ファイル中、純粋 ${total - impure.length} / 非純粋 ${impure.length}`);
  for (const r of impure) {
    const mark = IMPURE_BASELINE.has(r.name) ? ' ' : '★新規';
    console.log(`  ${mark} ${r.name.padEnd(42)} ${r.kinds.join(' ')}`);
  }
  process.exit(EXIT.PASS);
}

/*
 * ★3値の終了コードで答える(0=合格 / 1=赤 / ★2=測れなかった)。
 *   収穫元: soushin-suggest.link/scripts/blank-map.mjs:17
 *   ★「測れなかった」を緑に混ぜない。走査0件は【緑ではない】。
 */
const results = [];
if (total === 0) {
  results.push({
    probe: 'src/lib の純粋性',
    verdict: 'inconclusive',
    evidence: null,
    detail: '走査対象が0件でした(src/lib が見つからない/空)',
    howToFix: 'src/lib の場所を確認してください'
  });
} else if (added.length) {
  results.push({
    probe: 'src/lib の純粋性',
    verdict: 'fail',
    evidence: { 走査: total, 非純粋: impure.length, 新規: added.length },
    detail: `純粋でないファイルが増えました: ${added.join(', ')}`,
    howToFix:
      'I/O を呼び出し側(entry)へ移して lib には判定だけ残す。'
      + 'どうしても lib に置くなら IMPURE_BASELINE に【理由を1行添えて】追記する',
    limitation:
      '設計の良し悪しは判定しません。「純粋でないものが増えた」ことに気づかせるだけです'
  });
} else {
  // ★根拠(evidence)を必ず添える。根拠なき pass は自動で inconclusive へ降格される。
  results.push({
    probe: 'src/lib の純粋性',
    verdict: 'pass',
    evidence: { 走査: total, 純粋: total - impure.length, 例外: impure.length }
  });
}

console.log(formatProbeReport(results, { label: 'check-layer' }));
process.exit(computeExitCode(results));

} // ← CLI ブロックの終わり
