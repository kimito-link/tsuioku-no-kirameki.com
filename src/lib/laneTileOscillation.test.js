import { describe, expect, it } from 'vitest';
import {
  OSC_HISTORY_CAP,
  OSC_MIN_DELTA,
  pushLaneTileSample,
  summarizeLaneTileOscillation
} from './laneTileOscillation.js';
import {
  buildStoryUserLaneRenderDiag,
  formatStoryUserLaneRenderDiagLines
} from './storyUserLaneRenderProbe.js';

const s = (tiles, origin = 'light_summary') => ({ tiles, origin });

describe('pushLaneTileSample — 履歴リング', () => {
  it('上限を超えたら古い方から捨てる(軽さのため)', () => {
    let h = [];
    for (let i = 0; i < OSC_HISTORY_CAP + 5; i += 1) h = pushLaneTileSample(h, s(i));
    expect(h.length).toBe(OSC_HISTORY_CAP);
    // 最後が最新であること。
    expect(h[h.length - 1].tiles).toBe(OSC_HISTORY_CAP + 4);
  });

  it('不正な値は0に正規化して落とさない(計器が壊れて欠測にならない)', () => {
    const h = pushLaneTileSample([], { tiles: 'x', origin: 42 });
    expect(h).toEqual([{ tiles: 0, origin: '42' }]);
  });

  it('null 履歴でも新しい配列を返す(元を壊さない)', () => {
    expect(pushLaneTileSample(null, s(3))).toEqual([{ tiles: 3, origin: 'light_summary' }]);
  });
});

describe('summarizeLaneTileOscillation — 点滅(往復)の検出', () => {
  it('未観測は ⚪(0件で赤くしない)', () => {
    const r = summarizeLaneTileOscillation([]);
    expect(r.samples).toBe(0);
    expect(r.line).toContain('未観測');
  });

  it('★単調に増えるだけは点滅ではない(入場が続いているだけ)', () => {
    const r = summarizeLaneTileOscillation([s(2), s(10), s(20), s(30)]);
    expect(r.reversals).toBe(0);
    expect(r.line).toContain('往復なし');
  });

  it('★増→減→増 は往復2回として数える(これが点滅)', () => {
    const r = summarizeLaneTileOscillation([s(2), s(30), s(2), s(30)]);
    expect(r.reversals).toBe(2);
    expect(r.minTiles).toBe(2);
    expect(r.maxTiles).toBe(30);
    expect(r.amplitude).toBe(28);
    expect(r.line).toContain('🔴');
  });

  it(`★${OSC_MIN_DELTA}未満の揺れは無視する(1枚の入退場をノイズにしない)`, () => {
    // 2→3→2→3 は毎回 delta=1 なので往復に数えない。
    const r = summarizeLaneTileOscillation([s(2), s(3), s(2), s(3)]);
    expect(r.reversals).toBe(0);
  });

  it('★境界: ちょうど OSC_MIN_DELTA の変化は数える', () => {
    const r = summarizeLaneTileOscillation([s(2), s(4), s(2)]);
    expect(r.reversals).toBe(1);
  });

  it('★供給元が複数なら併記する(交互供給が点滅の原因になりうる)', () => {
    const r = summarizeLaneTileOscillation([
      s(2, 'light_summary'),
      s(30, 'heavy_refresh'),
      s(2, 'light_summary')
    ]);
    expect(r.originsSeen).toEqual(['light_summary', 'heavy_refresh']);
    expect(r.line).toContain('供給元が2種');
  });

  it('供給元が1つなら併記しない(ノイズにしない)', () => {
    const r = summarizeLaneTileOscillation([s(5), s(5)]);
    expect(r.line).not.toContain('供給元が');
  });

  it('★実測の再現: 2枚のまま安定は点滅ではない(縮小ガードが0を返す状況)', () => {
    // domTilesPainted=2 が続く状態。少ないこと自体は別問題で、点滅ではない。
    const r = summarizeLaneTileOscillation([s(2), s(2), s(2)]);
    expect(r.reversals).toBe(0);
    expect(r.amplitude).toBe(0);
  });
});

/*
 * ★通し検査(v0.1.1346): 計器を足したら【その行が実際に出力に現れるか】を確認する。
 *   storage に載せても印字側へ通っていなければ永久に出ない、を今日2回踏んだ。
 */
describe('★通し: 点滅の行が状態速報のテキストに現れる', () => {
  const base = {
    activePath: 'heavy',
    started: 4,
    completed: 4,
    entriesLen: 56,
    domTilesPainted: 2,
    lastReachedStep: 'done'
  };

  it('往復ありなら行が出る(供給元の併記つき)', () => {
    const oscillation = summarizeLaneTileOscillation([
      s(2, 'light_summary'),
      s(30, 'heavy_refresh'),
      s(2, 'light_summary')
    ]);
    const d = buildStoryUserLaneRenderDiag({ ...base, laneTileOscillation: oscillation });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).toContain('レーンの点滅');
    expect(text).toContain('往復');
    expect(text).toContain('供給元が2種');
  });

  it('往復なしなら行を出さない(正常時のノイズにしない)', () => {
    const oscillation = summarizeLaneTileOscillation([s(2), s(2)]);
    const d = buildStoryUserLaneRenderDiag({ ...base, laneTileOscillation: oscillation });
    const text = formatStoryUserLaneRenderDiagLines(d).join('\n');
    expect(text).not.toContain('レーンの点滅');
  });

  it('計器が無い(旧版の値)でも壊れない', () => {
    const d = buildStoryUserLaneRenderDiag({ ...base });
    expect(() => formatStoryUserLaneRenderDiagLines(d)).not.toThrow();
  });
});
