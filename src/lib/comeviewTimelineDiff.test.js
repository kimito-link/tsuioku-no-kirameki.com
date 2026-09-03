import { describe, expect, it } from 'vitest';
import { diffComeviewTimeline } from './comeviewTimelineDiff.js';

/*
 * ★ここで固定するのは「ちらつきが直ったこと」ではなく、
 *   【直し方が過去の事故を再発させないこと】。
 *   本命の不変条件は2つ:
 *     ① 変化が無いときは触らない(=img が生き残る=ちらつかない)
 *     ② 差分で表現できないものは正直に全再構築へ倒す(=二重表示/欠落を作らない)
 */

/** @param {string[]} keys */
const items = (keys) => keys.map((k) => ({ key: k, text: `t:${k}` }));

describe('diffComeviewTimeline — ★変化が無いときは触らない(ちらつき根治の本体)', () => {
  it('DOM と timeline が同一なら unchanged=true(1バイトも触らない)', () => {
    const d = diffComeviewTimeline(['a', 'b', 'c'], items(['a', 'b', 'c']));
    expect(d.unchanged).toBe(true);
    expect(d.reorderNeeded).toBe(false);
    expect(d.removeKeys).toEqual([]);
    expect(d.appendItems).toEqual([]);
  });

  it('★60秒整合の通常ケース(何も変わっていない)で全再構築に落ちない', () => {
    // 120件(TIMELINE_LIMIT 相当)が丸ごと同じ = 実機で最も多い状況。
    const keys = Array.from({ length: 120 }, (_, i) => `k${i}`);
    const d = diffComeviewTimeline(keys, items(keys));
    expect(d.unchanged).toBe(true);
    expect(d.reorderNeeded).toBe(false);
  });

  it('空→空 でも触らない', () => {
    const d = diffComeviewTimeline([], []);
    expect(d.unchanged).toBe(true);
    expect(d.reorderNeeded).toBe(false);
  });
});

describe('diffComeviewTimeline — 末尾追加(新着)', () => {
  it('末尾に増えた分だけ appendItems に出る', () => {
    const d = diffComeviewTimeline(['a', 'b'], items(['a', 'b', 'c', 'd']));
    expect(d.reorderNeeded).toBe(false);
    expect(d.removeKeys).toEqual([]);
    expect(d.appendItems.map((i) => i.key)).toEqual(['c', 'd']);
    expect(d.unchanged).toBe(false);
  });

  it('空の DOM に流し込むときは全部 append', () => {
    const d = diffComeviewTimeline([], items(['a', 'b']));
    expect(d.reorderNeeded).toBe(false);
    expect(d.appendItems.map((i) => i.key)).toEqual(['a', 'b']);
  });
});

describe('diffComeviewTimeline — 先頭が押し出される(上限120超え)', () => {
  it('古い行が消えた分だけ removeKeys に出る', () => {
    const d = diffComeviewTimeline(['a', 'b', 'c'], items(['b', 'c']));
    expect(d.reorderNeeded).toBe(false);
    expect(d.removeKeys).toEqual(['a']);
    expect(d.appendItems).toEqual([]);
  });

  it('★古いのが消えつつ新しいのが増える(実機で最も普通の整合)', () => {
    const d = diffComeviewTimeline(['a', 'b', 'c'], items(['b', 'c', 'd']));
    expect(d.reorderNeeded).toBe(false);
    expect(d.removeKeys).toEqual(['a']);
    expect(d.appendItems.map((i) => i.key)).toEqual(['d']);
  });
});

describe('★差分で表現できないものは全再構築へ倒す(欠落・二重表示を作らない)', () => {
  it('順序が入れ替わったら reorderNeeded=true', () => {
    const d = diffComeviewTimeline(['a', 'b', 'c'], items(['a', 'c', 'b']));
    expect(d.reorderNeeded).toBe(true);
    expect(d.removeKeys).toEqual([]);
    expect(d.appendItems).toEqual([]);
  });

  it('★既存行の【間】に新着が挟まったら reorderNeeded=true', () => {
    // 末尾 append では表現できない形。無理に差分にすると順序が壊れる。
    const d = diffComeviewTimeline(['a', 'c'], items(['a', 'b', 'c']));
    expect(d.reorderNeeded).toBe(true);
  });

  it('★DOM 側に重複 key があれば(既に二重表示)全再構築で確実に直す', () => {
    const d = diffComeviewTimeline(['a', 'a', 'b'], items(['a', 'b']));
    expect(d.reorderNeeded).toBe(true);
  });

  it('★timeline 側に重複 key があれば全再構築へ倒す(上流が壊れている)', () => {
    const d = diffComeviewTimeline(['a'], items(['a', 'b', 'b']));
    expect(d.reorderNeeded).toBe(true);
  });
});

describe('★不変条件: 差分を適用した結果は timeline と完全一致する(1件も欠けない/増えない)', () => {
  /**
   * 差分を実際に適用して、DOM の key 集合が timeline と一致することを確かめる。
   * ★これが二重表示(v0.1.671/672)への防波堤。keys と DOM は必ず同時に動く。
   */
  const applyDiff = (domKeys, timeline) => {
    const d = diffComeviewTimeline(domKeys, timeline);
    if (d.reorderNeeded) return timeline.map((i) => i.key); // 全再構築の結果
    // ★実DOMを正しく模す: removeKeys に無い【全ノード】が残る(Setで畳まない)。
    //   ここを Set で畳むと「重複ノードが1つに減った」ことになり、
    //   二重表示のバグをテストが見逃す(★実際に毒テストで空振りして気づいた)。
    const removed = new Set(d.removeKeys);
    const kept = [];
    for (const k of domKeys) if (!removed.has(k)) kept.push(k);
    return kept.concat(d.appendItems.map((i) => i.key));
  };

  const cases = [
    [['a', 'b', 'c'], ['a', 'b', 'c']],
    [['a', 'b'], ['a', 'b', 'c', 'd']],
    [['a', 'b', 'c'], ['b', 'c']],
    [['a', 'b', 'c'], ['b', 'c', 'd']],
    [['a', 'b', 'c'], ['a', 'c', 'b']],
    [['a', 'c'], ['a', 'b', 'c']],
    [[], ['a']],
    [['a'], []],
    [['a', 'b', 'c'], ['x', 'y']],
    // ★DOM が既に二重表示になっている状態からの復帰(v0.1.671/672 の再発防止)
    [['a', 'a', 'b'], ['a', 'b']],
    [['a', 'b', 'b'], ['a', 'b']],
    [['a', 'a'], ['a']],
    [['a', 'a', 'b'], ['a', 'b', 'c']],
    // ★上流(timeline)側が重複している状態。ガードが無いと同じ行を2つ append し、
    //   それが v0.1.671/672 の「二重表示」そのものになる(★毒テストで実証済み)。
    [[], ['a', 'a']],
    [['x'], ['a', 'a']],
    [['a', 'b'], ['a', 'b', 'c', 'c']]
  ];

  it.each(cases)('domKeys=%j timeline=%j → 結果が timeline と一致', (domKeys, wantKeys) => {
    const result = applyDiff(domKeys, items(wantKeys));
    expect(result).toEqual(wantKeys);
  });
});

describe('入力の頑健性(壊れた入力で落ちない)', () => {
  it('null/undefined を渡しても落ちない', () => {
    expect(() => diffComeviewTimeline(null, null)).not.toThrow();
    const d = diffComeviewTimeline(undefined, undefined);
    expect(d.unchanged).toBe(true);
  });

  it('key の無い item は無視する', () => {
    const d = diffComeviewTimeline(['a'], [{ key: 'a' }, { text: 'no key' }]);
    expect(d.reorderNeeded).toBe(false);
    expect(d.unchanged).toBe(true);
  });
});
