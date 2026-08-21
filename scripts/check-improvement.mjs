#!/usr/bin/env node
/**
 * check-improvement.mjs — ★版ごとの実測値が【退化】していないか見張る。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー指示(2026-08-21)
 *   「計器にバージョンにより改善記録つくれますか？退化させないように」
 *   「申請のときにもつかえるように」
 *
 * ■ 何をするか
 *   `src/lib/improvementHistory.js` の実測値を古い順に見て、
 *   ★**過去最良より悪い値**が現れたら赤にする。
 *   ★直前の版とだけ比べない。じわじわ悪化して元に戻るのを見逃すため。
 *
 * ■ ★方向は宣言テーブルから取る(数字から推測しない)
 *   実データに `100% → 0%`(改善) や `2回 → 13回`(改善) があった。
 *   小さいほど良いと決め打つと、★**改善を退化と誤判定して直した人を止める**。
 *
 * ■ 使い方
 *   node scripts/check-improvement.mjs             一覧
 *   node scripts/check-improvement.mjs --check     ★退化があれば exit 1
 *   node scripts/check-improvement.mjs --selftest  ★毒を入れて赤くなるか確認
 *   node scripts/check-improvement.mjs --submission 申請用の1枚を出す
 *
 * ■ 終了コード(45リポから収穫した3値規約)
 *   0 = 合格 / 1 = 測れた上での赤 / ★2 = 測れなかった(緑ではない)
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { IMPROVEMENT_HISTORY } from '../src/lib/improvementHistory.js';
import {
  IMPROVEMENT_METRICS,
  detectRegressions,
  buildSubmissionSummary,
  formatImprovementLine
} from '../src/lib/improvementLedger.js';
import { EXIT, computeExitCode, formatProbeReport, runSelfTest } from './lib/instrument-core.mjs';

const CHECK = process.argv.includes('--check');
const SELFTEST = process.argv.includes('--selftest');
const SUBMISSION = process.argv.includes('--submission');

const known = new Set(IMPROVEMENT_METRICS.map((m) => m.id));

/** 宣言に無い指標を使っている行(＝方向が決まらない＝判定不能)。 */
function undeclaredRows(history) {
  return history.filter((r) => !known.has(String(r?.metric || '')));
}

/* ── --selftest: 検知器に毒を食わせ、赤が出ることを確認する ─────────── */
if (SELFTEST) {
  const { ok, fails } = runSelfTest([
    {
      name: '退化の検知',
      // ★毒: 過去最良より悪い値を混ぜる。状態に依存しない毒にする。
      poison: () => { /* 下の isRed で合成データを使う */ },
      restore: () => {},
      isRed: () => detectRegressions([
        { version: 'a', metric: 'diag-ms', value: 5 },
        { version: 'b', metric: 'diag-ms', value: 900 }
      ]).length > 0
    },
    {
      name: '方向の宣言(大きいほど良い指標)',
      // ★「小さいほど良い」と決め打っていたら、これが赤にならない。
      poison: () => {},
      restore: () => {},
      isRed: () => detectRegressions([
        { version: 'a', metric: 'lane-repaint', value: 13 },
        { version: 'b', metric: 'lane-repaint', value: 2 }
      ]).length > 0
    },
    {
      name: '改善を退化と誤判定しない',
      poison: () => {},
      restore: () => {},
      // ★ここだけ「赤にならないこと」が合格なので反転して渡す
      isRed: () => detectRegressions([
        { version: 'a', metric: 'error-rate', value: 100 },
        { version: 'b', metric: 'error-rate', value: 0 }
      ]).length === 0
    }
  ]);
  if (!ok) {
    console.error('[check-improvement] ★selftest 失敗(検知器が効いていません):');
    for (const f of fails) console.error('  - ' + f);
    process.exit(EXIT.FAIL);
  }
  console.log('[check-improvement] selftest OK(退化を検知する / 方向を取り違えない)');
  process.exit(EXIT.PASS);
}

if (SUBMISSION) {
  /* ★申請用: 版ごとに before→after を組み立てる(同じ指標の連続する2点)。 */
  const byMetric = new Map();
  const entries = [];
  for (const r of IMPROVEMENT_HISTORY) {
    const prev = byMetric.get(r.metric);
    if (prev) entries.push({ version: r.version, metric: r.metric, before: prev.value, after: r.value, note: r.note });
    byMetric.set(r.metric, r);
  }
  console.log(buildSubmissionSummary(entries));
  process.exit(EXIT.PASS);
}

/**
 * ★いまの版が台帳に1件も無いか。
 *
 * ★fail ではなく inconclusive にする理由:
 *   記録し忘れは【測っていない】のであって【悪化した】のではない。
 *   ここを赤にすると、記録が面倒なときに"嘘の数字を入れる"動機を作る。
 *   ★この土台の規約どおり「測れなかった」は 2 で答える。
 */
function currentVersionUnrecorded(history) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const found = history.some((r) => String(r?.version || '') === version);
  return found ? null : version;
}

const undeclared = undeclaredRows(IMPROVEMENT_HISTORY);
const unrecorded = currentVersionUnrecorded(IMPROVEMENT_HISTORY);
const regressions = detectRegressions(IMPROVEMENT_HISTORY);

if (!CHECK) {
  console.log(`[check-improvement] 実測値 ${IMPROVEMENT_HISTORY.length} 件 / 指標 ${IMPROVEMENT_METRICS.length} 種`);
  const byMetric = new Map();
  for (const r of IMPROVEMENT_HISTORY) {
    const prev = byMetric.get(r.metric);
    if (prev) console.log('  ' + formatImprovementLine({ metric: r.metric, before: prev.value, after: r.value }) + `  (${r.version})`);
    byMetric.set(r.metric, r);
  }
  process.exit(EXIT.PASS);
}

/* ── --check: 3値で答える ────────────────────────────────────── */
const results = [];
if (IMPROVEMENT_HISTORY.length === 0) {
  results.push({
    probe: '改善記録', verdict: 'inconclusive', evidence: null,
    detail: '実測値が1件もありません',
    howToFix: 'src/lib/improvementHistory.js に実測値を1件足す'
  });
} else if (undeclared.length) {
  results.push({
    probe: '改善記録', verdict: 'fail',
    evidence: { 件数: IMPROVEMENT_HISTORY.length },
    detail: `宣言に無い指標が使われています: ${undeclared.map((r) => r.metric).join(', ')}`,
    howToFix: 'improvementLedger.js の IMPROVEMENT_METRICS に、その指標と【どちらが良いか】を先に宣言する',
    limitation: '数字が正しいかは判定しません。出所(source)は人が確かめてください'
  });
} else if (regressions.length) {
  results.push({
    probe: '改善記録', verdict: 'fail',
    evidence: { 件数: IMPROVEMENT_HISTORY.length, 退化: regressions.length },
    detail: regressions
      .map((r) => `${r.version} の ${r.label} が ${r.value}(過去最良 ${r.best} @${r.bestVersion})`)
      .join(' / '),
    howToFix:
      '直すか、意図した変更なら improvementHistory.js に【なぜ悪化してよいか】を note に書く'
      + '(数字を消して隠さないこと。隠すと台帳の意味が無くなります)',
    limitation: '設計の良し悪しは判定しません。過去最良より悪くなったことに気づかせるだけです'
  });
} else if (unrecorded) {
  results.push({
    probe: '改善記録', verdict: 'inconclusive',
    evidence: { 件数: IMPROVEMENT_HISTORY.length, 未記録の版: unrecorded },
    detail: `いまの版 ${unrecorded} の実測値が台帳にありません（★悪化ではなく【測っていない】）`,
    howToFix: 'npm run improvement:record を実行する（自動で測れる指標だけ入ります）',
    limitation: '★記録の有無だけを見ます。数字が正しいかは見ません'
  });
} else {
  results.push({
    probe: '改善記録', verdict: 'pass',
    evidence: { 件数: IMPROVEMENT_HISTORY.length, 指標: IMPROVEMENT_METRICS.length, 退化: 0 }
  });
}

console.log(formatProbeReport(results, { label: 'check-improvement' }));
process.exit(computeExitCode(results));
