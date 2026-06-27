/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { buildDevMonitorVizHtml } from './devMonitorVizHtml.js';

// characterization テスト: 抽出前の renderDevMonitorSecondaryViz の parts 組み立て条件を固定。
//   各バーの中身は既存 lib(devMonitorViz)のテストが担保。ここは「どのブロックが
//   どの入力で出る/出ない」という組み立てロジックを検証する。

const wrap = (html) => new DOMParser().parseFromString(html, 'text/html');

describe('buildDevMonitorVizHtml', () => {
  it('常に viz コンテナを返し、official-vs-recorded バーは必ず出る', () => {
    const html = buildDevMonitorVizHtml({ snapshot: null, displayCount: 10, storageCount: 0 });
    const doc = wrap(html);
    expect(doc.querySelector('.nl-dev-monitor-viz')).not.toBeNull();
    // official-vs-recorded バーは snapshot null でも 1 本必ず push される
    expect(html.length).toBeGreaterThan('<div class="nl-dev-monitor-viz"></div>'.length);
  });

  it('officialCaptureRatio が有限なら capture-ratio バーが増える', () => {
    const without = buildDevMonitorVizHtml({
      snapshot: { officialCommentCount: 100 },
      displayCount: 90,
      storageCount: 0
    });
    const withRatio = buildDevMonitorVizHtml({
      snapshot: { officialCommentCount: 100, officialCaptureRatio: 0.9 },
      displayCount: 90,
      storageCount: 0
    });
    // ratio あり HTML の方が長い（バーが 1 本増える）
    expect(withRatio.length).toBeGreaterThan(without.length);
  });

  it('profileGaps があっても storageCount=0 なら gap バーは出ない', () => {
    const gaps = { total: 10, missingName: 3, missingAvatar: 2 };
    const zero = buildDevMonitorVizHtml({ snapshot: {}, displayCount: 1, storageCount: 0, profileGaps: gaps });
    const some = buildDevMonitorVizHtml({ snapshot: {}, displayCount: 1, storageCount: 5, profileGaps: gaps });
    expect(some.length).toBeGreaterThan(zero.length);
  });

  it('trend が空ならスパークラインは出ない / 1点以上で出る', () => {
    const none = buildDevMonitorVizHtml({ snapshot: {}, displayCount: 1, storageCount: 0, trend: [] });
    const one = buildDevMonitorVizHtml({
      snapshot: {},
      displayCount: 1,
      storageCount: 0,
      trend: [{ atMs: 1, displayCount: 1, storageCount: 1, officialCount: 1 }]
    });
    expect(one.length).toBeGreaterThan(none.length);
  });

  it('非オブジェクト入力でも投げず viz コンテナを返す', () => {
    const html = buildDevMonitorVizHtml(null);
    expect(wrap(html).querySelector('.nl-dev-monitor-viz')).not.toBeNull();
  });

  it('officialCommentCount が非有限(NaN)なら null 扱い（official バーは state 経由で安全に出る）', () => {
    const html = buildDevMonitorVizHtml({
      snapshot: { officialCommentCount: Number.NaN },
      displayCount: 5,
      storageCount: 0
    });
    expect(wrap(html).querySelector('.nl-dev-monitor-viz')).not.toBeNull();
  });
});
