/**
 * externalFetchCells.test.js — 外部API取得セルの判定。
 *
 * ★[[check-the-external-dependency-first-2026-08-11]]:
 *   拡張の中を見る前に外の生死を確かめる。そのためのセルなので、
 *   「外が悪い」と「中が悪い」を取り違えないことが最重要。
 */
import { describe, it, expect } from 'vitest';
import { buildExternalFetchCells } from './externalFetchCells.js';

/** @param {any} probe @param {string} id */
function cellOf(probe, id) {
  return buildExternalFetchCells({
    fastDiag: { content: { giftDiagnostics: { externalFetchProbe: probe } } }
  }).find((c) => c.id === id);
}

describe('外部APIの取得セル', () => {
  describe('ギフト貢献度(fetch-koken)', () => {
    it('★エラーがあれば bad + 理由', () => {
      const c = cellOf({ kokenSent: 5, kokenLastError: 'network' }, 'fetch-koken');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('network');
    });

    it('★HTTPエラーは bad', () => {
      const c = cellOf({ kokenSent: 5, kokenLastStatus: 500 }, 'fetch-koken');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('500');
    });

    it('★送ったのに応答が無ければ warn', () => {
      const c = cellOf({ kokenSent: 5, kokenLastOk: false, kokenLastStatus: 0 }, 'fetch-koken');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('応答がありません');
    });

    it('★0件でも取れていれば ok(掟2: 中身が無い配信は正常)', () => {
      const c = cellOf({ kokenSent: 5, kokenLastOk: true, kokenLastStatus: 200, kokenLastRows: 0 }, 'fetch-koken');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('0件');
    });

    it('まだ送っていなければ na', () => {
      const c = cellOf({ kokenSent: 0 }, 'fetch-koken');
      expect(c?.level).toBe('na');
    });
  });

  describe('取得役の選出(fetch-leader)', () => {
    it('★譲った回数は異常にしない(防御=掟1)', () => {
      const c = cellOf({ intervalTicks: 20, leaderRan: 5, leaderSkipped: 15 }, 'fetch-leader');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('譲りました');
    });

    it('★一度も実行されていなければ warn + 次の一手', () => {
      const c = cellOf({ intervalTicks: 20, leaderRan: 0, leaderSkipped: 20 }, 'fetch-leader');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('1つだけ開く');
    });
  });

  it('観測が無ければ全て na(嘘をつかない)', () => {
    const cells = buildExternalFetchCells({});
    expect(cells.map((c) => c.level)).toEqual(['na', 'na', 'na']);
  });
});
