/**
 * effectDetailCells.test.js — 演出・送信の分解セルが【正しい判定】を出すか。
 */
import { describe, it, expect } from 'vitest';
import { buildEffectDetailCells } from './effectDetailCells.js';

/** @param {any} data @param {string} id */
function cellOf(data, id) {
  return buildEffectDetailCells(data).find((c) => c.id === id);
}

describe('演出・送信の分解セル', () => {
  describe('到着の演出(arrival-effect)', () => {
    it('★検知したのに説明できない差があれば warn', () => {
      const c = cellOf({
        giftEffectDiag: { arrivalDetected: 10, arrivalThrown: 3, arrivalSkippedCd: 2 }
      }, 'arrival-effect');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('説明できません');
    });

    it('★間引きで説明がつくなら ok(防御=掟1)', () => {
      const c = cellOf({
        giftEffectDiag: { arrivalDetected: 10, arrivalThrown: 6, arrivalSkippedCd: 4 }
      }, 'arrival-effect');
      expect(c?.level).toBe('ok');
    });

    it('到着が無ければ na(使っていない=異常ではない)', () => {
      const c = cellOf({ giftEffectDiag: { arrivalDetected: 0 } }, 'arrival-effect');
      expect(c?.level).toBe('na');
    });
  });

  describe('演出の間引き(effect-throttle)', () => {
    it('★どれだけ間引いても ok(多いほど守れている=掟1)', () => {
      const c = cellOf({
        giftEffectDiag: {
          giftSoundCoalesced: 500, giftSoundGuarded: 300,
          giftThrowCapGuarded: 200, adThrowCapGuarded: 100
        }
      }, 'effect-throttle');
      expect(c?.level).toBe('ok');
      // 「なぜ静かなのか」を説明する(通した理由を捨てない)
      expect(c?.text).toContain('1100');
    });
  });

  describe('送信から表示まで(comment-echo)', () => {
    it('★3秒以上かかっていれば bad', () => {
      const c = cellOf({ commentPostDiag: { attempts: 5, avgEchoMs: 3500 } }, 'comment-echo');
      expect(c?.level).toBe('bad');
    });

    it('速ければ ok', () => {
      const c = cellOf({ commentPostDiag: { attempts: 5, avgEchoMs: 300 } }, 'comment-echo');
      expect(c?.level).toBe('ok');
    });

    it('★送信していなければ na(0msと言わない)', () => {
      const c = cellOf({ commentPostDiag: { attempts: 0 } }, 'comment-echo');
      expect(c?.level).toBe('na');
    });
  });

  describe('送信の再試行(comment-retry)', () => {
    it('★送信数以上に再試行していれば warn', () => {
      const c = cellOf({ commentPostDiag: { attempts: 4, totalRetryAttempts: 9 } }, 'comment-retry');
      expect(c?.level).toBe('warn');
    });

    it('再試行なしなら ok', () => {
      const c = cellOf({ commentPostDiag: { attempts: 4, totalRetryAttempts: 0 } }, 'comment-retry');
      expect(c?.level).toBe('ok');
    });
  });

  describe('即時表示の取りこぼし(instant-reject)', () => {
    it('★半分以上届いていなければ bad', () => {
      const c = cellOf({ instantPushDiag: { sentCount: 10, rejectedCount: 6 } }, 'instant-reject');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('60%');
    });

    it('取りこぼしなしなら ok', () => {
      const c = cellOf({ instantPushDiag: { sentCount: 10, rejectedCount: 0 } }, 'instant-reject');
      expect(c?.level).toBe('ok');
    });

    it('送っていなければ na', () => {
      const c = cellOf({ instantPushDiag: { sentCount: 0 } }, 'instant-reject');
      expect(c?.level).toBe('na');
    });
  });

  it('★全セルが常に出る(消えない=掟5)', () => {
    const ids = buildEffectDetailCells({}).map((c) => c.id).sort();
    expect(ids).toEqual([
      'arrival-effect', 'comment-echo', 'comment-retry', 'effect-throttle', 'instant-reject'
    ]);
  });
});
