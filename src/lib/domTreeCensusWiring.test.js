import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines
} from './storyUserLaneRenderProbe.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★DOMの木の計器が採取から速報まで届くことを固定する。
 *   計器は「作った」ではなく「**出力に現れた**」で完成
 *   ([[verify-output-appears-before-shipping-2026-08-09]])。
 */
describe('★DOMの木の計器が配線されている', () => {
  it('★popup(パネルの中)で採取している', () => {
    const src = read('src/extension/popup-entry.js');
    expect(src).toContain("from '../lib/domTreeCensus.js'");
    expect(src).toContain('snap.domTreeCensus = summarizeDomTree(nodes);');
  });

  it('★★計器自身が重くならない(親を毎回辿らない・上限つき・storage を触らない)', () => {
    /*
     * ★[[instrument-can-kill-the-page-it-measures-2026-08-16]]:
     *   計器を1本足しただけで体感が壊れた前科がある。
     *   深さは「親の深さ+1」で求める(文書順なので親は処理済み)。
     */
    const src = read('src/extension/popup-entry.js');
    const i = src.indexOf('snap.domTreeCensus = summarizeDomTree(nodes);');
    const block = src.slice(i - 1800, i + 200);
    expect(block, '走査に上限が無い').toContain('Math.min(all.length, 4000)');
    expect(block, '親の深さを再利用していない').toContain('_depthOf');
    expect(block).not.toMatch(/storage\.(local|sync)\.(get|set)/);
    // ★親を毎回辿るループが残っていないこと
    expect(block).not.toMatch(/for \(let p = el\.parentElement/);
  });

  it('★★速報の行に「一番太い親」が出る(どこを削るか決まる)', () => {
    const diag = buildStoryUserLaneRenderDiag(
      { domTreeCensus: { level: 'warn', line: 'DOMの木: 2844個 / 深さ14 / 一番太い親: sceneStoryUserLaneTanu(div) 子86' } },
      {}
    );
    const text = formatStoryUserLaneRenderDiagLines(diag, {}).join('\n');
    expect(text).toContain('sceneStoryUserLaneTanu');
  });

  it('★計器が無い入力でも壊れない', () => {
    const diag = buildStoryUserLaneRenderDiag({}, {});
    expect(diag.domTreeCensus).toBeNull();
    expect(() => formatStoryUserLaneRenderDiagLines(diag, {})).not.toThrow();
  });
});
