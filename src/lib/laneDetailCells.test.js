/**
 * laneDetailCells.test.js — レーン分解セルが【正しい判定】を出すか。
 * ★カバレッジゲートは「出るか」しか見ない。誤誘導は価値が負なので両方向を断言する。
 */
import { describe, it, expect } from 'vitest';
import { buildLaneDetailCells } from './laneDetailCells.js';

/** @param {any} popup @param {string} id @param {boolean} [recording] */
function cellOf(popup, id, recording = true) {
  return buildLaneDetailCells({
    popupDiag: { popup },
    livesData: [{ recording }]
  }).find((c) => c.id === id);
}

describe('レーンの分解セル', () => {
  describe('最終描画(lane-last-run)', () => {
    it('★記録中に3分描かれていなければ bad + 次の一手', () => {
      const c = cellOf({ laneTickProbe: { lastRunAgoMs: 200_000 } }, 'lane-last-run');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('開き直');
    });

    it('直近に描かれていれば ok', () => {
      const c = cellOf({ laneTickProbe: { lastRunAgoMs: 3_000 } }, 'lane-last-run');
      expect(c?.level).toBe('ok');
    });

    it('★記録していなければ古くても異常にしない(使っていない=仕様)', () => {
      const c = cellOf({ laneTickProbe: { lastRunAgoMs: 900_000 } }, 'lane-last-run', false);
      expect(c?.level).toBe('ok');
    });
  });

  describe('上限で表示できなかった人(lane-capped)', () => {
    it('★表示上限による除外は【異常にしない】(仕様=掟2)', () => {
      const c = cellOf({ laneRosterDelta: { everSeenMax: 300, cappedOutTotal: 250 } }, 'lane-capped');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('仕様');
    });
  });

  describe('一度に消えた最大人数(lane-drop-burst)', () => {
    it('★まとめて消えたら bad(作り直しの疑い)', () => {
      const c = cellOf({
        laneRosterDelta: { everSeenMax: 50, maxDroppedAtOnce: 30, droppedEventCount: 1 }
      }, 'lane-drop-burst');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('作り直し');
    });

    it('1人ずつなら warn(型が違う=別の原因)', () => {
      const c = cellOf({
        laneRosterDelta: { everSeenMax: 50, maxDroppedAtOnce: 1, droppedEventCount: 3 }
      }, 'lane-drop-burst');
      expect(c?.level).toBe('warn');
    });

    it('消えていなければ ok', () => {
      const c = cellOf({ laneRosterDelta: { everSeenMax: 50, maxDroppedAtOnce: 0 } }, 'lane-drop-burst');
      expect(c?.level).toBe('ok');
    });
  });

  describe('振れ幅(lane-amplitude)', () => {
    it('★往復が多ければ bad(ちらつき)', () => {
      const c = cellOf({
        storyUserLaneRenderProbe: {
          laneTileOscillation: { samples: 10, reversals: 6, amplitude: 10, maxTiles: 20, minTiles: 10 }
        }
      }, 'lane-amplitude');
      expect(c?.level).toBe('bad');
    });

    it('★増える一方なら振れ幅が大きくても ok(仕様=掟2)', () => {
      const c = cellOf({
        storyUserLaneRenderProbe: {
          laneTileOscillation: { samples: 10, reversals: 0, amplitude: 50, maxTiles: 60, minTiles: 10 }
        }
      }, 'lane-amplitude');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('増える一方');
    });
  });

  describe('一番大きく減った瞬間(lane-worst-drop)', () => {
    it('★どの供給元で減ったかを名指しする', () => {
      const c = cellOf({
        storyUserLaneRenderProbe: {
          laneTileOscillation: {
            samples: 5, worstDrop: 12, worstDropFrom: 20, worstDropTo: 8,
            worstDropOrigin: 'light_summary'
          }
        }
      }, 'lane-worst-drop');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('light_summary');
      expect(c?.text).toContain('20→8');
    });
  });

  describe('書き出し見送り(lane-publish-skip)', () => {
    it('★見送りがあっても書き出せていれば ok(防御=掟1)', () => {
      const c = cellOf({
        lanePublishSkip: { noEls: 5, entriesEmpty: 3, lastPublishAgoSec: 2 }
      }, 'lane-publish-skip');
      expect(c?.level).toBe('ok');
    });

    it('★一度も書き出せていなければ bad', () => {
      const c = cellOf({
        lanePublishSkip: { noEls: 5, entriesEmpty: 3, lastSkipReason: 'els無し' }
      }, 'lane-publish-skip');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('一度も');
    });
  });

  it('★記録中なら観測ゼロでも全セルが出る(掟5)', () => {
    const ids = buildLaneDetailCells({ livesData: [{ recording: true }] }).map((c) => c.id).sort();
    expect(ids).toEqual([
      'lane-amplitude', 'lane-capped', 'lane-drop-burst',
      'lane-last-run', 'lane-publish-skip', 'lane-worst-drop'
    ]);
  });

  it('記録していなければ出さない(使っていない機能で埋めない)', () => {
    expect(buildLaneDetailCells({ livesData: [] })).toEqual([]);
  });
});
