/**
 * ホバーカードの「セリフ」: 在席名簿に発言が無い人は、鏡のセルが持つ発言を使う配線の固定(2026-10-12)。
 * 鏡→タイルへの引き継ぎは laneMirrorRecentTextsCarry.test.js。ここは会場のカードが使っているかを固定する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'extension', 'venueBar.js'), 'utf8').split('\r\n').join('\n');

describe('ホバーカードは名簿に発言が無いとき鏡のセルの発言を使う(配線)', () => {
  it('席なしタイル: facts の発言が空なら it.recentTexts を使う', () => {
    expect(src).toContain(
      'recentTexts: facts.recentTexts && facts.recentTexts.length ? facts.recentTexts : (Array.isArray(it?.recentTexts) ? it.recentTexts : []),'
    );
  });

  it('席ありタイル: participant の発言が空なら item.recentTexts を使う', () => {
    expect(src).toMatch(
      /recentTexts: Array\.isArray\(participant\.recentTexts\) && participant\.recentTexts\.length\n\s+\? participant\.recentTexts\n\s+: \(Array\.isArray\(item\?\.recentTexts\) \? item\.recentTexts : \[\]\)/
    );
  });

  it('在席名簿の発言が先(より新しい)で、鏡は後ろ盾=順序が逆になっていない', () => {
    const a = src.indexOf('facts.recentTexts && facts.recentTexts.length ? facts.recentTexts');
    const b = src.indexOf('it?.recentTexts');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
  });
});
