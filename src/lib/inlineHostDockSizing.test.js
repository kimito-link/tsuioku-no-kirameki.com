import { describe, it, expect } from 'vitest';
import {
  calculateDockBottomPanelHeight,
  DEFAULT_DOCK_PANEL_LIMITS
} from './inlineHostDockSizing.js';

describe('calculateDockBottomPanelHeight', () => {
  describe('player rect が取れる場合', () => {
    it('大画面 1920x1080 + player_bottom=720 → 残り空間に収まる', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 1080,
        playerRowBottom: 720,
        contentNaturalHeight: null
      });
      expect(r.source).toBe('player-rect');
      // 1080 - 720 - bottomPadding(8) = 352
      expect(r.height).toBeGreaterThanOrEqual(340);
      expect(r.height).toBeLessThanOrEqual(360);
    });

    it('中画面 1366x768 + player_bottom=520 → 残り 240px 程度', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 768,
        playerRowBottom: 520,
        contentNaturalHeight: null
      });
      expect(r.source).toBe('player-rect');
      // 768 - 520 - 8 = 240
      expect(r.height).toBeGreaterThanOrEqual(220);
      expect(r.height).toBeLessThanOrEqual(260);
    });

    it('小画面 1024x720 + player_bottom=480 → 残り 232px', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 720,
        playerRowBottom: 480,
        contentNaturalHeight: null
      });
      expect(r.source).toBe('player-rect');
      expect(r.height).toBeGreaterThanOrEqual(220);
      expect(r.height).toBeLessThanOrEqual(240);
    });

    it('contentNaturalHeight が小さければそれに合わせる（過大な panel を出さない）', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 1080,
        playerRowBottom: 600,
        contentNaturalHeight: 280 // ← available 472 より小さい
      });
      expect(r.source).toBe('content-fit');
      expect(r.height).toBe(280);
    });

    it('contentNaturalHeight が小さくても minHeight 未満なら minHeight に持ち上げる', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 1080,
        playerRowBottom: 600,
        contentNaturalHeight: 100 // ← min 220 を下回る
      });
      expect(r.height).toBe(DEFAULT_DOCK_PANEL_LIMITS.minHeight);
    });

    it('safetyMax (viewport*55%) を超えない（player_bottom が小さすぎる異常時）', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 1080,
        playerRowBottom: 100, // 異常に小さい（player 直前 = available 972）
        contentNaturalHeight: null
      });
      // safetyMax = 1080 * 0.55 = 594
      expect(r.height).toBeLessThanOrEqual(Math.round(1080 * 0.55));
    });

    it('player_bottom が viewport を超える（player が画面外）時は fallback へ', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 720,
        playerRowBottom: 800, // viewport を超えている
        contentNaturalHeight: null
      });
      // available 720-800-8 = -88 → minHeight にフォールバック
      expect(r.height).toBeGreaterThanOrEqual(DEFAULT_DOCK_PANEL_LIMITS.minHeight);
    });

    it('available が minHeight 未満なら minHeight を返す', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 600,
        playerRowBottom: 480, // available 600-480-8 = 112 < 220
        contentNaturalHeight: null
      });
      expect(r.height).toBe(DEFAULT_DOCK_PANEL_LIMITS.minHeight);
    });
  });

  describe('player rect が取れない場合（fallback）', () => {
    it('playerRowBottom=null → viewport*0.4 程度のデフォルト', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 1080,
        playerRowBottom: null,
        contentNaturalHeight: null
      });
      expect(r.source).toBe('fallback');
      // 1080 * 0.4 = 432
      expect(r.height).toBeGreaterThanOrEqual(400);
      expect(r.height).toBeLessThanOrEqual(440);
    });

    it('小画面 fallback も minHeight を下回らない', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 480,
        playerRowBottom: null,
        contentNaturalHeight: null
      });
      // 480 * 0.4 = 192 < 220 → minHeight に
      expect(r.height).toBe(DEFAULT_DOCK_PANEL_LIMITS.minHeight);
    });

    it('fallback でも safetyMax を超えない', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 2160, // 4K
        playerRowBottom: null,
        contentNaturalHeight: null
      });
      expect(r.height).toBeLessThanOrEqual(Math.round(2160 * 0.55));
    });
  });

  describe('viewport 異常値の clamp', () => {
    it('viewportHeight が極小（0 等）でも minHeight を返す', () => {
      const r = calculateDockBottomPanelHeight({
        viewportHeight: 0,
        playerRowBottom: null,
        contentNaturalHeight: null
      });
      expect(r.height).toBeGreaterThanOrEqual(DEFAULT_DOCK_PANEL_LIMITS.minHeight);
    });
  });

  describe('overrides', () => {
    it('minHeight を上書きできる', () => {
      const r = calculateDockBottomPanelHeight(
        {
          viewportHeight: 600,
          playerRowBottom: 500,
          contentNaturalHeight: null
        },
        { minHeight: 100 }
      );
      // available 92 < 100 → 100 に持ち上げ
      expect(r.height).toBe(100);
    });

    it('maxRatio を上書きできる（小さくする = panel をより制限）', () => {
      const r = calculateDockBottomPanelHeight(
        {
          viewportHeight: 1080,
          playerRowBottom: 100,
          contentNaturalHeight: null
        },
        { maxRatio: 0.3 }
      );
      // safetyMax = 324
      expect(r.height).toBeLessThanOrEqual(324);
    });
  });

  describe('DEFAULT_DOCK_PANEL_LIMITS', () => {
    it('frozen である', () => {
      expect(Object.isFrozen(DEFAULT_DOCK_PANEL_LIMITS)).toBe(true);
    });
    it('旧固定 50% より動画寄りに余裕を持つ（55%）', () => {
      expect(DEFAULT_DOCK_PANEL_LIMITS.maxRatio).toBeLessThanOrEqual(0.55);
    });
  });
});
