import { describe, it, expect } from 'vitest';
import { summarizeDomTree, DOM_TREE_TOP_N, DOM_TREE_DEPTH_WARN } from './domTreeCensus.js';

/**
 * ★DOMの「木」を数字にして計器へ入れる。
 *
 * ■ ★ユーザー指示(2026-08-21)
 *   「MCPデベロッパーツールで現在のDOMを全部把握して、それを計器に入れる基本から見直すべき」
 *   → その後 DOM Tree Visualizer を見て「これでできたものを計器にいれればいいかも」
 *
 * ■ ★市販の可視化拡張ではこの症状に届かない(調べた結果)
 *   ・拡張は **他の拡張のページ(chrome-extension://)に注入できない**
 *     = 黒くなっている当の文書(サイドパネル)を見られない
 *   ・出るのは「いまの木の絵」で、**黒い瞬間の時系列が残らない**
 *   ・計器に入れる形(JSON)で取り出せない
 *   ・★content script が1つ増える = 追っている停止を悪化させうる
 *   → ★**自前で木を数字にする**。それが本モジュール。
 *
 * ■ 何を数えるか(絵ではなく「構造の形」)
 *   ・総数 / 最大の深さ / タグ別の上位
 *   ・★**一番子だくさんな親**(どこが膨らんでいるか＝直す場所)
 *   ★深さと偏りは「絵」で人が見て気づくものを、数字にしたもの。
 */
describe('★DOMの木を数字にする(可視化拡張の代わり)', () => {
  /** 木を配列で表す簡易入力(採取側が作る形)。 */
  const node = (tag, depth, childCount, id) => ({ tag, depth, childCount, id });

  it('★測れないときは na(「異常なし」と言わない)', () => {
    for (const bad of [null, undefined, [], {}]) {
      const v = summarizeDomTree(bad);
      expect(v.level, `${JSON.stringify(bad)}`).toBe('na');
      expect(v.total).toBeNull();
    }
  });

  it('★総数・最大の深さを返す', () => {
    const v = summarizeDomTree([
      node('div', 1, 2), node('span', 2, 0), node('span', 5, 0)
    ]);
    expect(v.total).toBe(3);
    expect(v.maxDepth).toBe(5);
  });

  it('★★タグ別の上位を返す(何が増えているかが分かる)', () => {
    const v = summarizeDomTree([
      node('span', 1, 0), node('span', 1, 0), node('span', 1, 0),
      node('div', 1, 0), node('img', 1, 0)
    ]);
    expect(v.topTags[0].tag).toBe('span');
    expect(v.topTags[0].count).toBe(3);
    expect(v.topTags.length).toBeLessThanOrEqual(DOM_TREE_TOP_N);
  });

  it('★★一番子だくさんな親を名指しする(直す場所が決まる)', () => {
    const v = summarizeDomTree([
      node('div', 1, 5, 'small'),
      node('div', 2, 900, 'sceneStoryUserLaneTanu'),
      node('div', 2, 12, 'mid')
    ]);
    expect(v.widest.id).toBe('sceneStoryUserLaneTanu');
    expect(v.widest.childCount).toBe(900);
  });

  it('★深すぎる木は warn(入れ子が深いと再計算が重くなる)', () => {
    const deep = [];
    for (let i = 1; i <= DOM_TREE_DEPTH_WARN + 2; i += 1) deep.push(node('div', i, 1));
    expect(summarizeDomTree(deep).level).toBe('warn');
  });

  it('★浅くて小さければ ok', () => {
    expect(summarizeDomTree([node('div', 1, 1), node('span', 2, 0)]).level).toBe('ok');
  });

  it('★人が読む1行に「総数・深さ・一番太い親」が入る', () => {
    const v = summarizeDomTree([
      node('div', 1, 2, 'a'), node('div', 9, 300, 'sceneStoryUserLaneTanu')
    ]);
    expect(v.line).toContain('300');
    expect(v.line).toContain('sceneStoryUserLaneTanu');
  });

  it('★壊れた要素が混ざっても落ちない(診断が本体を壊さない)', () => {
    const v = summarizeDomTree([node('div', 1, 1), null, { tag: 5 }, undefined]);
    expect(v.total).toBe(4); // 数えるのは要素数(壊れていても件数は件数)
    expect(() => v.line).not.toThrow();
  });
});
