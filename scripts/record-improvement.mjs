#!/usr/bin/env node
/**
 * record-improvement.mjs — ★実測値を台帳に書き足す【1本の口】。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★ユーザー指示(2026-08-21)「50年後楽できる設計で、どんなプログラムでも」
 *
 * ■ ★なぜ「口」を1本に決めるのか(これが50年の肝)
 *   仕組みは3層に割れる:
 *     ① 規約(不変)    … 3値exit / 過去最良比較 / 方向は宣言する
 *     ② 判定(純関数)  … improvementLedger.js（★依存ゼロ・移植はコピー1回）
 *     ③ 収集(使い捨て)… ★誰が値を書くか ← **ここだけ腐る前提**で作る
 *
 *   ★呼び手(husky / スキル / CI / 50年後の別の何か)は必ず変わる。
 *   ★変わってよいように、**契約はこのコマンド1本**に閉じる。
 *   呼び手が死んでも口が残っていれば、次の道具を繋ぐだけで済む。
 *
 * ■ ★なぜ pre-push に置かなかったか(実測にもとづく却下)
 *   .husky/pre-push は `npm run verify` を呼ぶ。これは CLAUDE.md が
 *   「Claude ターミナルでハングしやすい」と名指しで禁止しているコマンド。
 *   ★さらに構造的な問題: フックで生成物を書くと、その追記は
 *     **いま push しようとしている commit に入っていない**＝順序事故。
 *   ★このリポは同じ型を既に踏んでいる(tree-map は git add の【後】)。
 *
 * ■ ★自動で書けるのは「リポの中だけで完結する」指標に限る
 *   bundle-kb / gate-selftest … ★機械が毎回同じ条件で測れる
 *   dom-nodes 等              … ★実機の状態速報が要る＝版ごとに条件が違う
 *   ★条件の違う数字を過去最良比較に載せると、比べてはいけないものを比べる。
 *
 * ■ 使い方
 *   node scripts/record-improvement.mjs --auto            ★自動で測れる指標を記録
 *   node scripts/record-improvement.mjs --auto --dry-run  書かずに見るだけ
 *   node scripts/record-improvement.mjs --metric bundle-kb --value 1360 --source "..."
 *   node scripts/record-improvement.mjs --selftest        ★毒→赤を確認
 *
 * ■ 終了コード(3値規約)
 *   0 = 書いた / 1 = ★書けなかった(不正な入力など) / ★2 = 測れなかった
 * ───────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { IMPROVEMENT_METRICS } from '../src/lib/improvementLedger.js';
import { EXIT, runSelfTest } from './lib/instrument-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY = join(ROOT, 'src/lib/improvementHistory.js');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
function opt(name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

/** 現在の版(package.json が正本)。 */
function currentVersion() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
}

/**
 * ★自動で測れる指標だけ。
 * ★ここに足してよいのは「リポの中だけで完結し、毎回同じ条件で測れる」ものに限る。
 */
const AUTO_COLLECTORS = Object.freeze([
  {
    metric: 'bundle-kb',
    source: 'extension/dist/popup.js のファイルサイズ',
    measure() {
      const p = join(ROOT, 'extension/dist/popup.js');
      if (!existsSync(p)) return null; // ★測れなかった(0ではない)
      return Math.round(statSync(p).size / 1024);
    }
  },
  {
    metric: 'gate-selftest',
    source: 'npm run audit:gates（--selftest を持つ検査の本数）',
    measure() {
      try {
        const out = execFileSync(
          process.execPath,
          [join(ROOT, 'scripts/audit-gates.mjs'), '--json'],
          { encoding: 'utf8', timeout: 60000 }
        );
        const rows = JSON.parse(out)?.rows;
        if (!Array.isArray(rows) || rows.length === 0) return null; // ★0本は「測れなかった」
        return rows.filter((r) => r.selftest).length;
      } catch {
        return null;
      }
    }
  }
]);

/** 台帳に既にその (version, metric) があるか。 */
function alreadyRecorded(text, version, metric) {
  const re = new RegExp(
    'version:\\s*\'' + String(version).replace(/\./g, '\\.') + '\',\\s*metric:\\s*\'' + metric + '\''
  );
  return re.test(text);
}

/** ★台帳の末尾 `]);` の直前に1件足す。行末は LF を保つ。 */
function appendRecord(text, rec) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
  const noteLine = rec.note ? ',\n    note: \'' + esc(rec.note) + '\'' : '';
  const block =
    '  Object.freeze({\n'
    + '    version: \'' + esc(rec.version) + '\', metric: \'' + esc(rec.metric) + '\', value: ' + rec.value + ',\n'
    + '    source: \'' + esc(rec.source) + '\'' + noteLine + '\n'
    + '  })';
  const idx = text.lastIndexOf(']);');
  if (idx < 0) return null; // ★形が違う＝書かない(壊さない)
  const head = text.slice(0, idx).replace(/\s*$/, '');
  return head + ',\n' + block + '\n]);\n';
}

/** 1件を検証して書く。★戻り値は3値。 */
function record(rec, { dryRun = false, file = HISTORY } = {}) {
  const spec = IMPROVEMENT_METRICS.find((m) => m.id === rec.metric);
  if (!spec) {
    return {
      verdict: 'fail',
      detail: '宣言に無い指標: ' + rec.metric,
      howToFix: 'improvementLedger.js の IMPROVEMENT_METRICS に、その指標と【どちらが良いか】を先に宣言する'
    };
  }
  // ★測れなかった値を 0 として書かない（Number(null)===0 の穴を今日4回踏んだ）
  if (typeof rec.value !== 'number' || !Number.isFinite(rec.value)) {
    return {
      verdict: 'inconclusive',
      detail: rec.metric + ' を測れませんでした',
      howToFix: '測定できる状態にしてから再実行する（★0として記録してはいけません）'
    };
  }
  if (!rec.source) {
    return {
      verdict: 'fail',
      detail: rec.metric + ' に source がありません',
      howToFix: '★どこで測ったかを書く。後から検算できない数字は台帳に載せない'
    };
  }
  const text = readFileSync(file, 'utf8');
  if (alreadyRecorded(text, rec.version, rec.metric)) {
    return { verdict: 'skip', detail: rec.version + ' の ' + rec.metric + ' は記録済み' };
  }
  const next = appendRecord(text, rec);
  if (next === null) {
    return {
      verdict: 'fail',
      detail: '台帳の形が想定と違います',
      howToFix: 'improvementHistory.js の末尾が `]);` で終わっているか確認する'
    };
  }
  if (!dryRun) writeFileSync(file, next);
  return { verdict: 'wrote', detail: rec.version + ' の ' + spec.label + ' = ' + rec.value + spec.unit };
}

/* ── --selftest: ★毒を食わせ、赤が出ることを確認する ─────────────── */
if (has('--selftest')) {
  const tmp = join(ROOT, 'src/lib/.record-selftest.tmp.js');
  const seed = 'export const IMPROVEMENT_HISTORY = Object.freeze([\n]);\n';
  const cleanup = () => { try { rmSync(tmp, { force: true }); } catch { /* 復帰は best-effort */ } };
  const { ok, fails } = runSelfTest([
    {
      name: '宣言に無い指標を拒む',
      poison: () => writeFileSync(tmp, seed),
      restore: cleanup,
      isRed: () => record(
        { version: '9.9.9', metric: '★存在しない指標', value: 1, source: 's' },
        { dryRun: true, file: tmp }
      ).verdict === 'fail'
    },
    {
      name: '★測れなかった値を 0 として書かない',
      poison: () => writeFileSync(tmp, seed),
      restore: cleanup,
      isRed: () => record(
        { version: '9.9.9', metric: 'bundle-kb', value: null, source: 's' },
        { dryRun: true, file: tmp }
      ).verdict === 'inconclusive'
    },
    {
      name: '★source なしを拒む',
      poison: () => writeFileSync(tmp, seed),
      restore: cleanup,
      isRed: () => record(
        { version: '9.9.9', metric: 'bundle-kb', value: 1, source: '' },
        { dryRun: true, file: tmp }
      ).verdict === 'fail'
    },
    {
      name: '★同じ版を二重に書かない',
      poison: () => writeFileSync(
        tmp,
        'export const IMPROVEMENT_HISTORY = Object.freeze([\n'
        + '  Object.freeze({ version: \'9.9.9\', metric: \'bundle-kb\', value: 1, source: \'s\' })\n'
        + ']);\n'
      ),
      restore: cleanup,
      isRed: () => record(
        { version: '9.9.9', metric: 'bundle-kb', value: 2, source: 's' },
        { dryRun: true, file: tmp }
      ).verdict === 'skip'
    }
  ]);
  if (!ok) {
    console.error('[record-improvement] ★selftest 失敗（守りが効いていません）:');
    for (const f of fails) console.error('  - ' + f);
    process.exit(EXIT.FAIL);
  }
  console.log('[record-improvement] selftest OK（未宣言/★測れず0/source無し/二重記録 を拒む）');
  process.exit(EXIT.PASS);
}

/* ── 本番 ────────────────────────────────────────────────────── */
const dryRun = has('--dry-run');
const version = opt('--version') || currentVersion();
const results = [];

if (has('--auto')) {
  for (const c of AUTO_COLLECTORS) {
    const value = c.measure();
    results.push({
      metric: c.metric,
      ...record(
        { version, metric: c.metric, value, source: c.source, note: opt('--note') || '' },
        { dryRun }
      )
    });
  }
} else {
  const metric = opt('--metric');
  const rawValue = opt('--value');
  if (!metric) {
    console.error('[record-improvement] --metric か --auto が要ります');
    console.error('  使い方: node scripts/record-improvement.mjs --auto');
    process.exit(EXIT.FAIL);
  }
  results.push({
    metric,
    ...record(
      {
        version,
        metric,
        value: rawValue === null ? null : Number(rawValue),
        source: opt('--source') || '',
        note: opt('--note') || ''
      },
      { dryRun }
    )
  });
}

console.log('[record-improvement] 版 ' + version + (dryRun ? '（★書きません）' : ''));
let worst = EXIT.PASS;
for (const r of results) {
  const mark =
    r.verdict === 'wrote' ? '✅' : r.verdict === 'skip' ? '・' : r.verdict === 'fail' ? '🔴' : '🟡';
  console.log('  ' + mark + ' ' + r.detail);
  if (r.howToFix) console.log('     → 直し方: ' + r.howToFix);
  if (r.verdict === 'fail') worst = EXIT.FAIL;
  else if (r.verdict === 'inconclusive' && worst === EXIT.PASS) worst = EXIT.INCONCLUSIVE;
}
console.log('  ★この口が判定しないこと: 数字が正しいかは見ません（source を人が確かめてください）');
process.exit(worst);
