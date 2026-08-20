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
 * ★「パネルを覆っている当人」が採取から速報まで届くことを固定する。
 *
 * ■ ★これが無かったから直せなかった
 *   ユーザーは「サイドパネル全部が黒い」と何度も報告したのに、
 *   速報には **「中央の塗り主=iframe」** としか出なかった。
 *   外側(sidepanel.html)の計器は中央にある iframe しか返せないため、
 *   ★**iframe の中で何が覆っているかは永久に分からなかった**。
 *   → この配線が、その盲点を埋める。
 */
describe('★パネルの覆い計器が採取から表示まで配線されている', () => {
  it('★popup(iframe の中)で採取している=ここが盲点だった', () => {
    const src = read('src/extension/popup-entry.js');
    expect(src, 'judgePanelCover を import していない')
      .toContain("from '../lib/panelCoverCulprit.js'");
    expect(src, '採取していない').toContain('snap.panelCover = judgePanelCover(layers);');
    // ★中央の点から祖先へ辿ること(層が1つでは覆いを特定できない)
    expect(src).toContain('elementFromPoint');
    expect(src).toContain('parentElement');
  });

  it('★計器自身が重くならない(storage を触らない・層は12までで打ち切る)', () => {
    const src = read('src/extension/popup-entry.js');
    const i = src.indexOf('snap.panelCover = judgePanelCover(layers);');
    const block = src.slice(i - 1400, i + 200);
    expect(block).not.toMatch(/storage\.(local|sync)\.(get|set)/);
    expect(block, '祖先を無制限に辿ると重くなる').toMatch(/n < 12/);
  });

  it('★★速報の行に「当人の名前」が出る(読んで直せること)', () => {
    const diag = buildStoryUserLaneRenderDiag(
      { panelCover: { level: 'bad', culprit: 'div.nl-init-shade', line: 'パネルの覆い: 🔴div.nl-init-shade が暗く覆っています' } },
      {}
    );
    const text = formatStoryUserLaneRenderDiagLines(diag, {}).join('\n');
    expect(text, '速報に出ていない=ユーザーが読めない').toContain('nl-init-shade');
  });

  it('★計器が無い入力でも壊れない(古いビルド/採取失敗)', () => {
    const diag = buildStoryUserLaneRenderDiag({}, {});
    expect(diag.panelCover).toBeNull();
    expect(() => formatStoryUserLaneRenderDiagLines(diag, {})).not.toThrow();
  });
});
