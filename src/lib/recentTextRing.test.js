import { describe, expect, it } from 'vitest';
import { RECENT_TEXT_KEEP, formatRecentTexts, pushRecentText } from './recentTextRing.js';

/**
 * v0.1.1218: 会場のホバーカードで「その人の直近数件の発言」を読めるようにするための保持。
 * storage を読まずに済ませるのが核心(ホバーのたびに read すると会場が重くなる)。
 */
describe('pushRecentText', () => {
  it('新しいものが先頭に来る', () => {
    let l = [];
    l = pushRecentText(l, '1件目');
    l = pushRecentText(l, '2件目');
    expect(l).toEqual(['2件目', '1件目']);
  });

  it('上限を超えたら古いものから落とす(長時間配信でも膨らまない)', () => {
    let l = [];
    for (let i = 1; i <= 10; i += 1) l = pushRecentText(l, `発言${i}`);
    expect(l).toHaveLength(RECENT_TEXT_KEEP);
    expect(l[0]).toBe('発言10');
    expect(l).not.toContain('発言1');
  });

  it('空文字は足さない(発言していないのに枠を消費しない)', () => {
    let l = pushRecentText([], 'あり');
    l = pushRecentText(l, '');
    l = pushRecentText(l, '   ');
    l = pushRecentText(l, null);
    expect(l).toEqual(['あり']);
  });

  it('直前とまったく同じ本文は足さない(連投で枠が埋まらない)', () => {
    let l = pushRecentText([], 'おなじ');
    l = pushRecentText(l, 'おなじ');
    l = pushRecentText(l, 'おなじ');
    expect(l).toEqual(['おなじ']);
  });

  it('間に別の発言が挟まれば同じ本文でも足せる', () => {
    let l = pushRecentText([], 'A');
    l = pushRecentText(l, 'B');
    l = pushRecentText(l, 'A');
    expect(l).toEqual(['A', 'B', 'A']);
  });

  it('改行や連続空白は1つに畳む(カードの見た目が崩れない)', () => {
    // \s は全角スペースも空白として畳む(半角1つに正規化される)。
    expect(pushRecentText([], ' あ　\n い  ')[0]).toBe('あ い');
    expect(pushRecentText([], 'x\n\n\ny')[0]).toBe('x y');
  });

  it('入力配列を破壊しない', () => {
    const orig = ['もと'];
    const next = pushRecentText(orig, 'あたらしい');
    expect(orig).toEqual(['もと']);
    expect(next).toEqual(['あたらしい', 'もと']);
  });

  it('壊れた入力でも落ちない', () => {
    expect(pushRecentText(null, 'x')).toEqual(['x']);
    expect(pushRecentText(undefined, 'x')).toEqual(['x']);
    expect(pushRecentText(['ok', 123, null], 'x')).toEqual(['x', 'ok']);
  });

  it('保持件数を明示できる', () => {
    let l = [];
    for (let i = 1; i <= 5; i += 1) l = pushRecentText(l, `n${i}`, 2);
    expect(l).toEqual(['n5', 'n4']);
  });
});

describe('formatRecentTexts', () => {
  it('件数を絞れる(カードが会場を覆わない大きさに保つ)', () => {
    const l = ['1', '2', '3', '4', '5'];
    expect(formatRecentTexts(l, { max: 3 })).toEqual(['1', '2', '3']);
  });

  it('長文は切って省略記号を付ける(切ったことが分かる)', () => {
    const long = 'あ'.repeat(100);
    const out = formatRecentTexts([long], { maxChars: 10 });
    expect(out[0]).toBe(`${'あ'.repeat(10)}…`);
  });

  it('上限ちょうどは切らない(不要な省略記号を出さない)', () => {
    const t = 'あ'.repeat(10);
    expect(formatRecentTexts([t], { maxChars: 10 })).toEqual([t]);
  });

  it('空の要素は飛ばす', () => {
    expect(formatRecentTexts(['a', '', '  ', 'b'], { max: 5 })).toEqual(['a', 'b']);
  });

  it('空・不正入力なら空配列(嘘の行を作らない)', () => {
    expect(formatRecentTexts([])).toEqual([]);
    expect(formatRecentTexts(null)).toEqual([]);
    expect(formatRecentTexts(undefined)).toEqual([]);
  });
});
