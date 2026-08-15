/**
 * northStarDetailCells.test.js — 公式値レーンの実績セルの判定。
 *
 * ★最重要: 掟2(仕様上そうなるものを異常にしない)。
 *   イベントに参加していない配信でイベント値が取れないのは【正常】。
 *   ここを間違えると、普通の配信で毎回警告が出る=誤誘導=価値が負。
 */
import { describe, it, expect } from 'vitest';
import { buildNorthStarDetailCells } from './northStarDetailCells.js';

/** @param {any} ns @param {number} [elapsedMs] */
function cells(ns, elapsedMs = 60 * 60 * 1000) {
  return buildNorthStarDetailCells({
    fastDiag: { content: { giftDiagnostics: { '北極星レーン': ns } } },
    liveElapsedMs: elapsedMs
  });
}

/** @param {any} ns @param {string} id @param {number} [elapsedMs] */
function cellOf(ns, id, elapsedMs) {
  return cells(ns, elapsedMs).find((c) => c.id === id);
}

describe('公式値レーンの実績セル', () => {
  describe('取得実績(ns-ever-got)', () => {
    it('★一部だけ取れていなければ warn(そのレーンだけ死んでいる)', () => {
      const c = cellOf({
        '1_貢献度ランキング': { foundCountLifetime: 5 },
        '2_ギフト履歴': { foundCountLifetime: 0 }
      }, 'ns-ever-got');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('ギフト履歴');
    });

    it('★全部取れていなければ na(ギフト/イベントが無い配信=正常・掟2)', () => {
      const c = cellOf({
        '1_貢献度ランキング': { foundCountLifetime: 0 },
        '2_ギフト履歴': { foundCountLifetime: 0 }
      }, 'ns-ever-got');
      expect(c?.level).toBe('na');
    });

    it('全部取れていれば ok', () => {
      const c = cellOf({
        '1_貢献度ランキング': { foundCountLifetime: 5 },
        '2_ギフト履歴': { foundCountLifetime: 2 }
      }, 'ns-ever-got');
      expect(c?.level).toBe('ok');
    });
  });

  describe('取得中のまま(ns-pending)', () => {
    it('★配信開始から間もなければ ok(取れなくて当たり前・掟2)', () => {
      const c = cellOf(
        { '2_ギフト履歴': { state: 'iframe_unrendered' } },
        'ns-pending',
        60 * 1000
      );
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('間もない');
    });

    it('★5分を超えて取得中のままなら warn', () => {
      const c = cellOf(
        { '2_ギフト履歴': { state: 'iframe_unrendered' } },
        'ns-pending',
        30 * 60 * 1000
      );
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('30分経過');
    });

    it('取得中が無ければ ok', () => {
      const c = cellOf({ '1_貢献度ランキング': { state: 'ok' } }, 'ns-pending');
      expect(c?.level).toBe('ok');
    });
  });

  it('観測が無ければ na', () => {
    const list = buildNorthStarDetailCells({});
    expect(list.map((c) => c.level)).toEqual(['na', 'na']);
  });
});
