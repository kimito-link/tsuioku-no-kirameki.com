import { describe, expect, it } from 'vitest';
import { pickLatestCommentEntry } from './pickLatestComment.js';

describe('pickLatestCommentEntry', () => {
  it('prefers higher commentNo when both numeric', () => {
    const list = [
      { commentNo: '10', capturedAt: 300, text: 'old' },
      { commentNo: '2055', capturedAt: 100, text: 'new' }
    ];
    expect(pickLatestCommentEntry(list)?.text).toBe('new');
  });

  it('uses capturedAt when commentNo ties or missing', () => {
    const list = [
      { commentNo: '5', capturedAt: 1000, text: 'a' },
      { commentNo: '5', capturedAt: 2000, text: 'b' }
    ];
    expect(pickLatestCommentEntry(list)?.text).toBe('b');
  });

  it('treats non-numeric commentNo as missing for ordering', () => {
    const list = [
      { commentNo: 'INFO', capturedAt: 5000, text: 'info' },
      { capturedAt: 1000, text: 'plain' }
    ];
    expect(pickLatestCommentEntry(list)?.text).toBe('info');
  });
});

describe('pickLatestCommentEntry(0.1.2128 の書き直しで選ぶ1件が変わらない)', () => {
  /** 書き直す前の選び方(比べるたびに番号と時刻を読み直す形)。答え合わせ用にそのまま写した。 */
  function oldPick(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const rank = (e) => {
      const noStr = String(e?.commentNo ?? '').trim();
      const noNum = /^\d+$/.test(noStr) ? Number(noStr) : NaN;
      return { noNum, at: Number(e?.capturedAt || 0) };
    };
    const pickNewer = (a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      const aHas = Number.isFinite(ra.noNum);
      const bHas = Number.isFinite(rb.noNum);
      if (aHas && bHas && ra.noNum !== rb.noNum) return ra.noNum > rb.noNum ? a : b;
      if (aHas && !bHas) return a;
      if (!aHas && bHas) return b;
      return ra.at >= rb.at ? a : b;
    };
    let best = list[0];
    for (let i = 1; i < list.length; i += 1) best = pickNewer(list[i], best);
    return best;
  }
  it('ばらばらな記録2,000通りで書き直す前と同じ1件を選ぶ', () => {
    let seed = 12345;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const noPool = ['', ' ', 'abc', '0', '1', '2', '10', ' 7 ', '007', '3.5', null, undefined];
    for (let t = 0; t < 2000; t += 1) {
      const len = 1 + rnd(12);
      const list = [];
      for (let i = 0; i < len; i += 1) {
        const r = rnd(3);
        list.push({
          id: i,
          commentNo: r === 0 ? noPool[rnd(noPool.length)] : r === 1 ? String(rnd(6)) : undefined,
          capturedAt: rnd(4) === 0 ? undefined : rnd(5)
        });
      }
      expect(pickLatestCommentEntry(list)).toBe(oldPick(list));
    }
  });
});
