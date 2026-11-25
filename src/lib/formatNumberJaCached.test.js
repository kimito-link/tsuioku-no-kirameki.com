import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { formatNumberJa } from './htmlText.js';
import { formatCountDelta, formatPtDelta } from './liveGiftPulse.js';

// v0.1.2226: 桁区切りは整形係を使い回す。出る文字は toLocaleString('ja-JP') と1文字も変わらないこと。
describe('formatNumberJa — 使い回しの整形係でも表示は同じ', () => {
  const samples = [0, 1, 7, 12, 999, 1000, 12757, 1234567, 98765432, 1e15, -1, -12757, 0.5, 1234.5678, -0, 2 ** 53, Number.MAX_SAFE_INTEGER];
  it.each(samples)('%s', (v) => {
    expect(formatNumberJa(v)).toBe(v.toLocaleString('ja-JP'));
  });
  it('数にならないものは "0"(従来どおり)', () => {
    for (const v of [NaN, Infinity, -Infinity, undefined, null, 'abc', {}]) expect(formatNumberJa(v)).toBe((0).toLocaleString('ja-JP'));
    expect(formatNumberJa('12757')).toBe('12,757');
  });
  it('増分バッジも同じ文字', () => {
    for (const v of [1, 12, 1234, 98765]) {
      expect(formatPtDelta(v)).toBe(`+${v.toLocaleString('ja-JP')}pt`);
      expect(formatCountDelta(v)).toBe(`+${v.toLocaleString('ja-JP')}件`);
    }
    expect(formatPtDelta(0)).toBe('');
    expect(formatCountDelta(-3)).toBe('');
  });
  it('呼ぶたびに toLocaleString で整形係を作り直さない(タイルごと・描き直しごとに呼ばれる)', () => {
    const html = fs.readFileSync(new URL('./htmlText.js', import.meta.url), 'utf8');
    expect(html).toMatch(/const JA_NUMBER_FORMAT = [^\n]*new Intl\.NumberFormat\('ja-JP'\)/);
    expect(html).toMatch(/JA_NUMBER_FORMAT \? JA_NUMBER_FORMAT\.format\(x\)/);
    const pulse = fs.readFileSync(new URL('./liveGiftPulse.js', import.meta.url), 'utf8');
    const body = (name) => pulse.slice(pulse.indexOf(`export function ${name}(`), pulse.indexOf('\n}', pulse.indexOf(`export function ${name}(`)));
    for (const fn of ['formatPtDelta', 'formatCountDelta']) {
      expect(body(fn)).toContain('formatNumberJa(n)');
      expect(body(fn)).not.toContain('toLocaleString');
    }
  });
});
