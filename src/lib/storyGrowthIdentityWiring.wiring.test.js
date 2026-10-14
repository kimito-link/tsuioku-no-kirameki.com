import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-14: アイコングリッドの「マスの中身の指紋」計器の配線の固定。
 *   計器が動いていても、呼び出しか診断への載せ忘れがあれば状態速報に出ない([[fastdiag-lite-is-the-printer-subset]] の同型)。
 *   打点は2か所(中身だけ上書きする patch と、全消し再構築)・出力は storyGrowthCellSwap の診断。
 */
const popup = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8').split('\r\n').join('\n');

describe('popup-entry: グリッドのマスの指紋を数える', () => {
  it('★patch(中身だけ上書き)の各マス更新のあとで指紋を取る', () => {
    const at = popup.indexOf('function patchStoryGrowthIconsFromSource');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 2600);
    const loop = body.indexOf('applyStoryGrowthIconAttributes(');
    const note = body.indexOf('noteStoryGrowthIdentitiesNow(n);');
    expect(loop).toBeGreaterThan(0);
    expect(note).toBeGreaterThan(loop);
  });
  it('★全消し再構築の直後にも指紋を取る', () => {
    const at = popup.indexOf('function rebuildStoryGrowthImpl');
    expect(at).toBeGreaterThan(0);
    expect(popup.slice(at, at + 1500)).toMatch(/root\.appendChild\(frag\);\n\s+noteStoryGrowthIdentitiesNow\(total\);/);
  });
  it('★指紋は commentStableId と supportUserKeyFromEntry の2つを控える', () => {
    const at = popup.indexOf('function noteStoryGrowthIdentitiesNow');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 900);
    expect(body).toMatch(/commentStableId\(entry\)/);
    expect(body).toMatch(/supportUserKeyFromEntry\(entry\)/);
    expect(body).toMatch(/noteStoryGrowthCellIdentities\(STORY_GROWTH_CELL_SWAP,/);
  });
  it('★診断(storyGrowthCellSwap)へ入替・ID後付け・ID未取得を載せる', () => {
    expect(popup).toMatch(/identitySwaps: STORY_GROWTH_CELL_SWAP\.identitySwaps,/);
    expect(popup).toMatch(/userKeyChanges: STORY_GROWTH_CELL_SWAP\.userKeyChanges,/);
    expect(popup).toMatch(/unknownCells: STORY_GROWTH_CELL_SWAP\.unknownCells,/);
  });
});
