#!/usr/bin/env node
/**
 * check-dist-fresh.mjs — 「その tree の dist は、その tree のソースから build されたものか」。
 *
 *   --ref <rev>   : commit の tree を見る(CI・手動)
 *   --pushed      : 環境変数 PRE_PUSH_REFS(pre-push の stdin を sh で読んだもの)の
 *                   各 local sha を --ref で見る(refs が空なら HEAD にフォールバック)
 *   --index       : ステージ(これからコミットされる中身)を見る(pre-commit)
 *   (無指定)      : 作業ツリーを見る(verify:cc・手動)
 *   --selftest    : 毒→赤 / 正常→緑 が正しく判定できるかの自己診断
 *
 * ★build は走らせない。走らせると出力を捨てるか作業ツリーを汚すかしかない
 *   (pre-push は push 内容を変えられない。設計: docs/dist-fingerprint-gate-DESIGN.md C-3/C-4)。
 *
 * 使い方: npm run check:dist-fresh / npm run check:dist-fresh:selftest
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  fingerprintText,
  maskBuildId,
  judgeDistFreshness,
  FINGERPRINT_SCHEMA
} from '../src/lib/distFingerprint.js';

const ROOT = process.cwd();
const SIDECAR = '.dist-fingerprint.json';

/** @param {string} s */
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * @param {string[]} args
 * @param {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} [opt]
 */
function git(args, opt = {}) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', ...opt });
}

/**
 * @typedef {{
 *   label: string,
 *   blobsOf: (paths: string[]) => Map<string,string>,
 *   read: (p: string) => string|null
 * }} TreeSource
 *
 * ★blobsOf は複数パスを【1回で】解決する(1ファイルずつ git を起動すると数百ファイルで
 *   数十秒かかる。build.mjs の `hash-object --stdin-paths` と同じ流儀に揃える)。
 */

/**
 * commit の tree から path→blob sha を1回で取る(内容は read() が呼ばれたときだけ cat-file する)。
 * @param {string} rev
 * @returns {TreeSource}
 */
function treeSource(rev) {
  const blobs = new Map();
  const out = git(['ls-tree', '-r', '-z', rev]);
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const meta = rec.slice(0, tab).split(' ');
    const path = rec.slice(tab + 1);
    blobs.set(path, meta[2]);
  }
  return {
    label: `commit ${rev.slice(0, 10)}`,
    blobsOf: (paths) => new Map(paths.filter((p) => blobs.has(p)).map((p) => [p, blobs.get(p)])),
    read: (p) => (blobs.has(p) ? git(['cat-file', 'blob', `${rev}:${p}`]) : null)
  };
}

/** ステージ(index)の内容を見る。 @returns {TreeSource} */
function indexSource() {
  const blobs = new Map();
  const out = git(['ls-files', '-s', '-z']);
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const meta = rec.slice(0, tab).split(' ');
    const path = rec.slice(tab + 1);
    blobs.set(path, meta[1]);
  }
  return {
    label: 'index(ステージ)',
    blobsOf: (paths) => new Map(paths.filter((p) => blobs.has(p)).map((p) => [p, blobs.get(p)])),
    read: (p) => (blobs.has(p) ? git(['cat-file', 'blob', `:${p}`]) : null)
  };
}

/**
 * 作業ツリーの内容を見る。
 * ★blobsOf は存在するパスだけを `hash-object --stdin-paths` に1回で流す
 *   (build.mjs と同じ方式。ファイルごとに git を起動しない=数百ファイルでも高速)。
 * @returns {TreeSource}
 */
function worktreeSource() {
  return {
    label: '作業ツリー',
    blobsOf: (paths) => {
      const existing = paths.filter((p) => existsSync(resolve(ROOT, p)));
      if (existing.length === 0) return new Map();
      const out = git(['hash-object', '--stdin-paths'], { input: existing.join('\n') + '\n' }).trim();
      const hashes = out ? out.split('\n') : [];
      const map = new Map();
      existing.forEach((p, i) => {
        if (hashes[i]) map.set(p, hashes[i]);
      });
      return map;
    },
    read: (p) => {
      const full = resolve(ROOT, p);
      return existsSync(full) ? readFileSync(full, 'utf8') : null;
    }
  };
}

/**
 * @param {TreeSource} src
 * @returns {boolean}
 */
function check(src) {
  const raw = src.read(SIDECAR);
  /** @type {any} */
  let sidecar = null;
  try {
    sidecar = raw ? JSON.parse(raw) : null;
  } catch {
    sidecar = null;
  }

  let fingerprint = null;
  const missingInputs = [];
  /** @type {Record<string,string|null>} */
  const outputHashes = {};

  if (sidecar && sidecar.schema === FINGERPRINT_SCHEMA) {
    const inputPaths = sidecar.inputs || [];
    const blobMap = src.blobsOf(inputPaths);
    const entries = [];
    for (const p of inputPaths) {
      const blob = blobMap.get(p);
      if (!blob) missingInputs.push(p);
      else entries.push({ path: p, blob });
    }
    fingerprint = sha256(fingerprintText({ mode: sidecar.mode, entries }));
    for (const out of Object.keys(sidecar.outputs || {})) {
      const text = src.read(out);
      outputHashes[out] = text == null ? null : sha256(maskBuildId(text));
    }
  }

  const v = judgeDistFreshness({ sidecar, fingerprint, missingInputs, outputHashes });
  if (v.ok) {
    console.log(`[check-dist-fresh] OK: ${src.label} の dist はソースと一致(${sidecar.fingerprint.slice(0, 12)})`);
  } else {
    console.error(`[check-dist-fresh] NG: ${src.label}`);
    for (const p of v.problems) console.error(`  ✗ ${p}`);
    console.error(
      '  → npm run build && git add extension/dist app/dist .dist-fingerprint.json' +
        '(緊急回避: SKIP_DIST_GATE=1)'
    );
  }
  return v.ok;
}

/** 毒→赤 / 正常→緑 の自己診断(judgeDistFreshness を直接呼ぶ・git/fs には触れない)。 */
function selftest() {
  const good = judgeDistFreshness({
    sidecar: {
      schema: FINGERPRINT_SCHEMA,
      mode: 'default',
      fingerprint: 'f'.repeat(64),
      inputs: ['a.js'],
      outputs: { 'dist/a.js': 'o'.repeat(64) }
    },
    fingerprint: 'f'.repeat(64),
    missingInputs: [],
    outputHashes: { 'dist/a.js': 'o'.repeat(64) }
  });
  const badInput = judgeDistFreshness({
    sidecar: {
      schema: FINGERPRINT_SCHEMA,
      mode: 'default',
      fingerprint: 'f'.repeat(64),
      inputs: ['a.js'],
      outputs: { 'dist/a.js': 'o'.repeat(64) }
    },
    fingerprint: 'DIFFERENT',
    missingInputs: [],
    outputHashes: { 'dist/a.js': 'o'.repeat(64) }
  });
  const badOutput = judgeDistFreshness({
    sidecar: {
      schema: FINGERPRINT_SCHEMA,
      mode: 'default',
      fingerprint: 'f'.repeat(64),
      inputs: ['a.js'],
      outputs: { 'dist/a.js': 'o'.repeat(64) }
    },
    fingerprint: 'f'.repeat(64),
    missingInputs: [],
    outputHashes: { 'dist/a.js': 'DIFFERENT' }
  });
  const noSidecar = judgeDistFreshness({
    sidecar: null,
    fingerprint: null,
    missingInputs: [],
    outputHashes: {}
  });
  // ★同じ本文で buildId だけ違う2テキストの maskBuildId→sha256 が一致すること(ループ根治の核心)。
  const before = sha256(maskBuildId('const NL_BUILD_ID="0921-201053";function x(){}'));
  const after = sha256(maskBuildId('const NL_BUILD_ID="0921-201251";function x(){}'));

  const cases = [
    ['正常系(全一致)は ok', good.ok === true],
    ['指紋不一致は NG', badInput.ok === false],
    ['出力hash不一致は NG', badOutput.ok === false],
    ['sidecar無しは NG', noSidecar.ok === false],
    ['buildIdだけ違う本文は同一hashになる', before === after]
  ];
  let ok = true;
  for (const [label, pass] of cases) {
    console.log(`[check-dist-fresh:selftest] ${pass ? 'OK' : 'NG'}: ${label}`);
    if (!pass) ok = false;
  }
  return ok;
}

const argv = process.argv.slice(2);
let ok = true;

if (argv.includes('--selftest')) {
  ok = selftest();
} else if (argv.includes('--pushed')) {
  const raw = String(process.env.PRE_PUSH_REFS || '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const shas = lines
    .map((l) => l.trim().split(/\s+/)[1])
    .filter((s) => s && !/^0+$/.test(s));
  if (shas.length === 0) {
    // refs が取れない(手動実行等)ときは HEAD で見る。空で緑にしない。
    ok = check(treeSource('HEAD'));
  } else {
    for (const s of [...new Set(shas)]) {
      ok = check(treeSource(s)) && ok;
    }
  }
} else if (argv.includes('--index')) {
  ok = check(indexSource());
} else if (argv.includes('--ref')) {
  const idx = argv.indexOf('--ref');
  const rev = argv[idx + 1] || 'HEAD';
  ok = check(treeSource(rev));
} else {
  ok = check(worktreeSource());
}

process.exit(ok ? 0 : 1);
