import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 応援マスの属性反映とギフト履歴の描画は、「値が同じなら書かない」部品(domWriteIfChanged)を通す(v0.1.1688)。
 *   生の classList.add/remove/toggle・setAttribute・innerHTML 代入が残ると、描き直しのたびに同じ値を書き直し(4秒で約1,000回)、
 *   ギフト履歴は約180個の子を作り直す(実機の ちらつき計 で確認)。
 */
const read = (rel) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const src = strip(read('src/extension/popup-entry.js'));

/** @param {string} head 関数の先頭(宣言行) @param {string} next 次の関数の先頭(終端の目印) */
const bodyOf = (head, next) => {
  const a = src.indexOf(head);
  const b = src.indexOf(next, a + head.length);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('応援マスの属性反映は同値スキップを通る', () => {
  const body = bodyOf('function applyStoryGrowthIconAttributes(', 'function createStoryGrowthCell(');
  it("★domWriteIfChanged を import している", () => {
    expect(src).toContain("from '../lib/domWriteIfChanged.js'");
  });
  it('★生の classList.add/remove/toggle と setAttribute が残っていない', () => {
    expect(body).not.toMatch(/\.classList\.(add|remove|toggle)\(/);
    expect(body).not.toMatch(/\.setAttribute\(/);
    expect(body).not.toMatch(/\.removeAttribute\(/);
    expect(body).not.toMatch(/img\.title\s*=/);
    expect(body).not.toMatch(/img\.alt\s*=/);
  });
  it('★class は最終形を1回だけ代入(違うときだけ)', () => {
    expect(body).toMatch(/if \(img\.className !== cls\) img\.className = cls;/);
    expect((body.match(/\.className\s*=[^=]/g) || []).length).toBe(1);
  });
  it('★属性・class は部品経由で書く', () => {
    expect(body).toContain('setAttrIfChanged(img,');
    expect(body).toContain('setClassFlag(cell,');
  });
});

describe('ギフト履歴は同じ HTML を入れ直さない', () => {
  const body = bodyOf('async function renderGiftSubAppHistoryPanel(', 'const INTERCEPT_BACKFILL_STATE');
  it('★最終の描画は setInnerHtmlIfChanged、直接の innerHTML=buildGift… が残っていない', () => {
    expect(body).toContain('setInnerHtmlIfChanged(mount, buildGiftSubAppHistoryBlocksHtml(');
    expect(body).not.toMatch(/mount\.innerHTML\s*=\s*buildGiftSubAppHistoryBlocksHtml/);
  });
  it('★ほかの書き込み(空・失敗・案内)の後は覚えを捨てる(古い覚えで書き漏らさない)', () => {
    expect((body.match(/noteHtmlWrittenElsewhere\(mount\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});
