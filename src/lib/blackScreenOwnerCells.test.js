/**
 * blackScreenOwnerCells.test.js — 黒画面の当人セルが【正しい判定】を出すか。
 *
 * ★カバレッジゲートは「出るか」しか見ない。誤誘導は価値が負なので、
 *   両方向(異常で出る/正常で居座らない)をここで断言する。
 */
import { describe, it, expect } from 'vitest';
import { buildBlackScreenOwnerCells } from './blackScreenOwnerCells.js';

/** @param {any} mt @param {string} id */
function cellOf(mt, id) {
  return buildBlackScreenOwnerCells({ mainThreadBlocker: mt }).find((c) => c.id === id);
}

describe('黒画面の当人セル', () => {
  describe('止めている当人(mt-owner)', () => {
    it('★累計の多い順で名指しする(最悪1件ではない)', () => {
      const c = cellOf({
        count: 5, worstMs: 600, worstName: 'rare-spike',
        byName: {
          'rare-spike': { ms: 600, count: 1, worstMs: 600 },
          'grid-rebuild': { ms: 2000, count: 40, worstMs: 120 }
        }
      }, 'mt-owner');
      // 最悪は rare-spike だが、累計で止めているのは grid-rebuild
      expect(c?.text).toContain('grid-rebuild');
      expect(c?.text).toContain('2000ms');
    });

    it('★名前が無ければ「(拡張の外)」と名指しする(打ち手が変わる)', () => {
      const c = cellOf({ count: 3, worstMs: 900, byName: {} }, 'mt-owner');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('拡張の外');
      // 次の一手が書かれている(掟6)
      expect(c?.text).toContain('再読込');
    });

    it('観測が無ければ na(消さない=掟5)', () => {
      const c = cellOf(null, 'mt-owner');
      expect(c?.level).toBe('na');
      expect(c?.text).toBe('—');
    });

    it('★長い処理ゼロなら na(正常時に警告を居座らせない)', () => {
      const c = cellOf({ count: 0 }, 'mt-owner');
      expect(c?.level).toBe('na');
    });
  });

  describe('止まった合計時間(mt-total)', () => {
    it('★個別は短くても合計が長ければ bad(積み上げ型の停止)', () => {
      const c = cellOf({ count: 60, worstMs: 60, totalMs: 3600, byName: {} }, 'mt-total');
      expect(c?.level).toBe('bad');
    });

    it('合計が短ければ ok', () => {
      const c = cellOf({ count: 2, worstMs: 60, totalMs: 120, byName: {} }, 'mt-total');
      expect(c?.level).toBe('ok');
    });
  });

  describe('スリープ明けの詰まり(mt-resume)', () => {
    it('★過半が復帰直後なら bad + 主因と名指し', () => {
      const c = cellOf({
        count: 4, worstMs: 800, totalMs: 2000,
        afterResumeCount: 3, afterResumeMs: 1600, byName: {}
      }, 'mt-resume');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('まとめ描き');
      expect(c?.text).toContain('80%');
    });

    it('少しだけなら warn(主因とは言わない)', () => {
      const c = cellOf({
        count: 10, worstMs: 300, totalMs: 2000,
        afterResumeCount: 1, afterResumeMs: 200, byName: {}
      }, 'mt-resume');
      expect(c?.level).toBe('warn');
      expect(c?.text).not.toContain('主因');
    });

    it('★復帰直後の詰まりが無ければ ok', () => {
      const c = cellOf({
        count: 3, worstMs: 300, totalMs: 900, afterResumeCount: 0, byName: {}
      }, 'mt-resume');
      expect(c?.level).toBe('ok');
    });
  });

  it('★全セルが常に出る(黒いのにセルが消えるのを防ぐ)', () => {
    const ids = buildBlackScreenOwnerCells({}).map((c) => c.id).sort();
    expect(ids).toEqual([
      'boot-phase', 'boot-remount', 'mt-average', 'mt-owner', 'mt-owner2',
      'mt-resume', 'mt-spread', 'mt-total', 'whiteout-culprit'
    ]);
  });

  describe('黒画面の追い込み(v0.1.1408)', () => {
    it('★起動が途中で止まっていれば bad + どの段階か', () => {
      const c = buildBlackScreenOwnerCells({
        popupDiag: { popup: { loadShadeProbe: { lastLoadPhase: { phase: 'awaiting-first-paint', agoMs: 9000 } } } }
      }).find((x) => x.id === 'boot-phase');
      expect(c?.level).toBe('bad');
      expect(c?.text).toContain('awaiting-first-paint');
      expect(c?.text).toContain('9秒');
    });

    it('★画面の作り直しが多ければ warn(黒く見える原因)', () => {
      const c = buildBlackScreenOwnerCells({
        popupDiag: { popup: { loadShadeProbe: { dismissCalls: 8 } } }
      }).find((x) => x.id === 'boot-remount');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('8回');
    });

    it('★スクロール白化は移動と描き直しを分けて名指しする(打ち手が違う)', () => {
      const c = buildBlackScreenOwnerCells({
        fastDiag: { content: { scrollWhiteoutDiag: { whiteoutCount: 5, culpritMove: 4, culpritRepaint: 1 } } }
      }).find((x) => x.id === 'whiteout-culprit');
      expect(c?.text).toContain('移動が主因');
    });

    it('★2番目の当人も出す(1番だけ直しても黒は消えない)', () => {
      const c = buildBlackScreenOwnerCells({
        mainThreadBlocker: {
          count: 6, worstMs: 900, totalMs: 2400,
          byName: {
            'grid-rebuild': { ms: 1800, count: 2 },
            'lane-paint': { ms: 600, count: 4 }
          }
        }
      }).find((x) => x.id === 'mt-owner2');
      expect(c?.text).toContain('lane-paint');
    });

    it('★1種類に集中していれば「直しやすい」と言う', () => {
      const c = buildBlackScreenOwnerCells({
        mainThreadBlocker: { count: 3, totalMs: 900, byName: { 'grid-rebuild': { ms: 900, count: 3 } } }
      }).find((x) => x.id === 'mt-spread');
      expect(c?.level).toBe('ok');
      expect(c?.text).toContain('直しやすい');
    });

    it('★平均で「たまに長い」と「常に少し長い」を分ける', () => {
      const c = buildBlackScreenOwnerCells({
        mainThreadBlocker: { count: 10, totalMs: 4000, byName: { x: { ms: 4000, count: 10 } } }
      }).find((x) => x.id === 'mt-average');
      expect(c?.level).toBe('warn');
      expect(c?.text).toContain('400ms');
    });
  });
});
