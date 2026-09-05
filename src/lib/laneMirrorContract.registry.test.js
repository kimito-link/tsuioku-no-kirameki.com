import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANE_MIRROR_CONSUMERS } from './laneMirrorContract.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ★このテストが守るもの(2026-08-06・会場パリティ8回再発の構造的真因への恒久ガード)。
 *
 *   同じ KEY_LANE_MIRROR について、書き手 popup-entry.js は
 *   「会場には一切関係しない=popup と status だけ」と書き、
 *   読み手 venueBar.js は「会場の正本に昇格」と書いていた。
 *   書き手が読者を知らないまま片側を変えると、もう片側が無言で壊れる。
 *
 *   → 実 import している全ファイルと LANE_MIRROR_CONSUMERS の【完全一致】を CI が断言する。
 *     新しい読者/書き手を足したら、登録簿に書くまで赤。契約の同期漏れが構造的に起きない。
 */

/** src/ 配下の .js を再帰列挙(テストは除く)。 */
function listSourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (ent.name.endsWith('.js') && !ent.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * `laneMirrorKey.js` を【実 import】しているファイルの repo 相対パス一覧。
 * ★コメントでの言及は数えない(import 文の from 句だけを見る)。
 *   commentTimelineMirrorKey.js 等は「同思想」とコメントで触れているだけで消費者ではない。
 */
function actualConsumerFiles() {
  const found = [];
  for (const abs of listSourceFiles(srcRoot)) {
    const text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    // import { ... } from '...laneMirrorKey.js'  の形だけを拾う。
    if (/from\s+['"][^'"]*laneMirrorKey\.js['"]/.test(text)) {
      const rel = path.relative(path.dirname(srcRoot), abs).split(path.sep).join('/');
      found.push(rel);
    }
  }
  return found.sort();
}

describe('KEY_LANE_MIRROR 消費者登録簿の同期', () => {
  it('★実importするファイル一覧と LANE_MIRROR_CONSUMERS が完全一致する(件数も含む)', () => {
    const actual = actualConsumerFiles();
    const registered = LANE_MIRROR_CONSUMERS.map((c) => c.file).sort();
    // ★配列等値で断言する。件数だけ・存在だけの断言だと片方の増減を見逃す
    //   ([[wiring-test-must-assert-counts-2026-08-04]])。
    expect(registered).toEqual(actual);
  });

  it('登録簿に重複が無い', () => {
    const files = LANE_MIRROR_CONSUMERS.map((c) => c.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('★書き手は popup-entry.js と mirrorBundleFlushScheduler.js だけ(passive は書かない)', () => {
    /*
     * ★v0.1.1300: 配信ごとキー(v2)+受領証の書き出し口を lib へ抽出したので writer が1つ増えた。
     *   ★書き手の【主体】は増えていない: laneMirrorPerLivePublish.js は popup-entry.js の
     *     publishLaneMirror から1回だけ呼ばれる storage I/O グルーで、
     *     独自に鏡を生成したり別 tick で書いたりしない
     *     (呼び出しが1箇所であることは laneMirrorPerLiveWiring.wiring.test.js が数で固定する)。
     */
    const writers = LANE_MIRROR_CONSUMERS.filter((c) => c.role === 'writer').map((c) => c.file).sort();
    expect(writers).toEqual([
      'src/extension/popup-entry.js',
      'src/lib/laneMirrorPerLivePublish.js',
      'src/lib/mirrorBundleFlushScheduler.js'
    ]);
  });
});

describe('契約の嘘コメントが復活していない', () => {
  const popupSrc = fs
    .readFileSync(path.join(srcRoot, 'extension/popup-entry.js'), 'utf8')
    .replace(/\r\n/g, '\n');
  const statusSrc = fs
    .readFileSync(path.join(srcRoot, 'extension/status-entry.js'), 'utf8')
    .replace(/\r\n/g, '\n');

  it('★popup-entry.js に「会場には一切関係しない」が無い(書き手が読者を否認しない)', () => {
    expect(popupSrc).not.toContain('会場には一切関係しない');
  });

  it('★status-entry.js に「会場とは無関係」が無い', () => {
    expect(statusSrc).not.toContain('会場とは無関係');
  });

  it('★書き手・読み手の両端が契約モジュールを参照している', () => {
    // コメントで契約の所在を指し示していること(次に触る人が登録簿へ辿り着ける)。
    expect(popupSrc).toContain('laneMirrorContract.js');
    expect(statusSrc).toContain('laneMirrorContract.js');
  });
});
