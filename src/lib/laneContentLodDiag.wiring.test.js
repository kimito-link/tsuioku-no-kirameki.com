import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines
} from './storyUserLaneRenderProbe.js';

/**
 * 中身LOD の【計器の配線】検査。
 *
 * ■ なぜ要るか(2026-08-18 に私自身が踏んだ)
 *   中身LOD(v0.1.1426)を出したのに、状態速報に「効いているか」の数字が1つも無く、
 *   実機の速報を見ても判定できなかった。countHollowTiles を書いただけで
 *   【どこからも呼んでいなかった】＝ [[unwired-judgement-is-systemic]] の再発。
 *   ★同じ日に「既存の検査が本当に呼ばれているか確かめよ」と自分で書いた直後だった。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('中身LOD 計器の配線', () => {
  it('★枠の数を数える関数が、実際に呼ばれている(書いただけで終わらせない)', () => {
    const renderer = strip(read('src/extension/story/renderStoryUserLaneDom.js'));
    expect(renderer).toContain('countHollowTiles');
    expect(renderer).toContain('export function getStoryLaneHollowCounts');

    const entry = strip(read('src/extension/popup-entry.js'));
    expect(entry).toContain('getStoryLaneHollowCounts');
  });

  it('★既存の計器バッチに相乗りしている(read を1本増やさない)', () => {
    const entry = strip(read('src/extension/popup-entry.js'));
    // 段別churn計器と同じ行で呼ぶ＝更新所要を増やさない
    const at = entry.indexOf('getStoryLaneRepaintCounts()');
    expect(at).toBeGreaterThan(-1);
    const near = entry.slice(at, at + 220);
    expect(near).toContain('getStoryLaneHollowCounts');
  });

  it('★速報の本文に出る(印字されなければ計器は無いのと同じ)', () => {
    const probe = strip(read('src/lib/storyUserLaneRenderProbe.js'));
    expect(probe).toContain('laneHollowCounts');
    expect(probe).toContain('中身LOD');
  });

  it('★0のときも行を出す(「観測ゼロなら出さない」にしない)', () => {
    const probe = read('src/lib/storyUserLaneRenderProbe.js');
    expect(probe).toMatch(/枠だけ0枚/);
    expect(probe).toMatch(/条件未達なら0が正常/);
  });

  it('★snapshot が値を素通しする(途中で落とすと永久に null)', () => {
    const probe = strip(read('src/lib/storyUserLaneRenderProbe.js'));
    expect(probe).toMatch(/laneHollowCounts:\s*s\.laneHollowCounts/);
  });

  /*
   * ★通し検査([[verify-output-appears-before-shipping]]): 計器を足したら
   *   「その行が実際に出力に現れるか」まで確かめる。
   *   ★今日の失敗の再発防止: countHollowTiles を書いたのに呼び手が無く、
   *     実機の速報を見ても中身LODが効いているか判定できなかった。
   */
  it('★実際に本文へ印字される(枠あり=✅ / 枠なし=⚪ の両方)', () => {
    const on = buildStoryUserLaneRenderDiag(
      {
        activePath: 'heavy',
        started: 1,
        completed: 1,
        lastReachedStep: 'done',
        entriesLen: 328,
        domTilesPainted: 82,
        laneHollowCounts: { tanu: 34, total: 34 }
      },
      {}
    );
    const s1 = formatStoryUserLaneRenderDiagLines(on, {}).join('\n');
    expect(s1).toContain('中身LOD ✅ 枠だけ34枚');
    expect(s1).toContain('たぬ姉34枚');

    const off = buildStoryUserLaneRenderDiag(
      {
        activePath: 'heavy',
        started: 1,
        completed: 1,
        lastReachedStep: 'done',
        entriesLen: 40,
        domTilesPainted: 12,
        laneHollowCounts: { tanu: 0, total: 0 }
      },
      {}
    );
    const s2 = formatStoryUserLaneRenderDiagLines(off, {}).join('\n');
    // ★0でも行を消さない(条件未達を「正常な0」と説明する)
    expect(s2).toContain('枠だけ0枚');
    expect(s2).toContain('条件未達なら0が正常');
  });
});
