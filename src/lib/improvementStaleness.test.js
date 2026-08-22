import { describe, it, expect } from 'vitest';
import {
  analyzeImprovementStaleness,
  formatImprovementStalenessLine,
  versionDistance,
  IMPROVEMENT_STALE_VERSIONS
} from './improvementStaleness.js';

const M = [
  { id: 'a', label: '指標A' },
  { id: 'b', label: '指標B' },
  { id: 'c', label: '指標C' }
];

describe('versionDistance', () => {
  it('同じ体系なら patch 差で数える', () => {
    expect(versionDistance('0.1.1416', '0.1.1478')).toBe(62);
    expect(versionDistance('0.1.1478', '0.1.1478')).toBe(0);
  });

  it('★体系が違えば測れない(null)', () => {
    expect(versionDistance('0.1.1', '0.2.1')).toBeNull();
    expect(versionDistance('1.0.0', '0.1.1')).toBeNull();
  });

  it('★壊れた入力でも落ちない', () => {
    expect(versionDistance('', '0.1.1')).toBeNull();
    expect(versionDistance(null, undefined)).toBeNull();
  });
});

describe('analyzeImprovementStaleness — 測っていない指標を数える', () => {
  it('★直近で記録があれば fresh', () => {
    const rows = analyzeImprovementStaleness({
      metrics: M,
      history: [{ version: '0.1.1478', metric: 'a' }],
      currentVersion: '0.1.1478'
    });
    expect(rows.find((r) => r.metric === 'a').state).toBe('fresh');
  });

  it('★しきい値を超えて空いたら stale', () => {
    const rows = analyzeImprovementStaleness({
      metrics: M,
      history: [{ version: '0.1.1416', metric: 'a' }],
      currentVersion: '0.1.1478'
    });
    const a = rows.find((r) => r.metric === 'a');
    expect(a.state).toBe('stale');
    expect(a.behind).toBe(62);
  });

  it('★「一度も無い」は stale と別にする(まだ分からない側)', () => {
    const rows = analyzeImprovementStaleness({
      metrics: M,
      history: [],
      currentVersion: '0.1.1478'
    });
    expect(rows.every((r) => r.state === 'never')).toBe(true);
    // ★never は behind を持たない(測れないので数えない)
    expect(rows.every((r) => r.behind === null)).toBe(true);
  });

  it('★しきい値ちょうどは stale にしない(境界)', () => {
    const cur = '0.1.1478';
    const at = `0.1.${1478 - IMPROVEMENT_STALE_VERSIONS}`;
    const rows = analyzeImprovementStaleness({
      metrics: [{ id: 'a', label: 'A' }],
      history: [{ version: at, metric: 'a' }],
      currentVersion: cur
    });
    expect(rows[0].state).toBe('fresh');
  });

  it('★fresh も返す(全体像が見えないと判断できない)', () => {
    const rows = analyzeImprovementStaleness({
      metrics: M,
      history: [{ version: '0.1.1478', metric: 'a' }],
      currentVersion: '0.1.1478'
    });
    expect(rows).toHaveLength(3);
  });

  it('壊れた入力でも落ちない', () => {
    expect(analyzeImprovementStaleness(null)).toEqual([]);
    expect(analyzeImprovementStaleness({ metrics: 'x', history: 'y' })).toEqual([]);
  });
});

describe('formatImprovementStalenessLine', () => {
  it('全部 fresh なら ✅', () => {
    const line = formatImprovementStalenessLine([
      { metric: 'a', label: 'A', state: 'fresh', lastVersion: '0.1.1478', behind: 0 }
    ]);
    expect(line).toContain('✅');
    expect(line).toContain('1 / 1 種');
  });

  it('★stale は「測れるのに測っていない」と言う', () => {
    const line = formatImprovementStalenessLine([
      { metric: 'a', label: '診断の所要', state: 'stale', lastVersion: '0.1.1416', behind: 62 }
    ]);
    expect(line).toContain('放置されています');
    expect(line).toContain('診断の所要(62版前)');
  });

  it('★never は「手段が無いだけかもしれない」と断定しない', () => {
    const line = formatImprovementStalenessLine([
      { metric: 'a', label: '画面の部品数', state: 'never', lastVersion: '', behind: null }
    ]);
    expect(line).toContain('一度も記録がありません');
    expect(line).toContain('かもしれません');
  });
});
