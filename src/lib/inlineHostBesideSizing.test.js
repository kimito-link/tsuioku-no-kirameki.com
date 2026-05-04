import { describe, it, expect } from 'vitest';
import {
  calculateBesidePanelLayout,
  computeBesideInsertionGapPx,
  DEFAULT_BESIDE_PANEL_LIMITS
} from './inlineHostBesideSizing.js';

/** @param {Partial<{left:number,top:number,width:number,height:number}>} r */
const rect = (r) => ({ left: 0, top: 0, width: 0, height: 0, ...r });

describe('computeBesideInsertionGapPx', () => {
  it('次兄弟が無いときは viewport 右端（safeRight）までをギャップに含める', () => {
    expect(computeBesideInsertionGapPx(880, 1700, null)).toBe(1700 - 12 - 880);
  });

  it('次兄弟の左端が狭ければその手前まで（実コメ列との間のみ）', () => {
    expect(computeBesideInsertionGapPx(800, 1700, 820)).toBe(820 - 8 - 800);
  });

  it('besideInnerGap を上書きできる', () => {
    expect(
      computeBesideInsertionGapPx(800, 1700, 830, { besideInnerGap: 18 })
    ).toBe(830 - 18 - 800);
  });
});

describe('calculateBesidePanelLayout', () => {
  describe('幅計算 — viewport 右端をはみ出さない', () => {
    it('1700px viewport: video 幅 580、video 右端 880 → panel は 580 幅で OK', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 300, top: 80, width: 580, height: 326 }),
        playerRowRect: null,
        viewport: { width: 1700, height: 1080 },
        contentNaturalHeight: null
      });
      expect(r).not.toBeNull();
      // 利用可能幅 = 1700 - 880 - 12 = 808、video.width 580 が小さいので 580
      expect(r?.panelWidth).toBe(580);
    });

    it('1920px viewport: video 右端 1700 → 利用可能幅 208 < minWidth → null（below へ）', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 100, top: 80, width: 1600, height: 900 }),
        playerRowRect: null,
        viewport: { width: 1920, height: 1080 },
        contentNaturalHeight: null
      });
      // 利用可能幅 = 1920 - 1700 - 12 = 208 → minWidth 280 を下回る → null
      expect(r).toBeNull();
    });

    it('利用可能幅が minWidth 未満なら null（呼出元で below フォールバック）', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 100, top: 80, width: 1500, height: 844 }),
        playerRowRect: null,
        viewport: { width: 1920, height: 1080 },
        contentNaturalHeight: null
      });
      // 利用可能幅 = 1920 - 1600 - 12 = 308 → minWidth 280 以上なので OK
      expect(r).not.toBeNull();
    });

    it('panel 幅は viewport の右側にはみ出さない（クランプ）', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 50, top: 80, width: 800, height: 450 }),
        playerRowRect: null,
        viewport: { width: 1500, height: 900 },
        contentNaturalHeight: null
      });
      expect(r).not.toBeNull();
      // 利用可能幅 = 1500 - 850 - 12 = 638、video.width 800 → 638 が採用
      expect(r?.panelWidth).toBe(638);
      // panel.right = 850 + 638 = 1488 ≤ 1500 - 12 = 1488 OK
    });

    it('safeRight overrides で右余白を増やせる', () => {
      const r = calculateBesidePanelLayout(
        {
          videoRect: rect({ left: 50, top: 80, width: 800, height: 450 }),
          playerRowRect: null,
          viewport: { width: 1500, height: 900 },
          contentNaturalHeight: null
        },
        { safeRight: 60 }
      );
      // 利用可能幅 = 1500 - 850 - 60 = 590
      expect(r?.panelWidth).toBe(590);
    });

    it('flexInsertionGapPx が狭いときは null（実ギャップ優先・折り返し防止）', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 40, top: 80, width: 560, height: 315 }),
        playerRowRect: null,
        viewport: { width: 1400, height: 900 },
        contentNaturalHeight: null,
        flexInsertionGapPx: 40
      });
      expect(r).toBeNull();
    });

    it('flexInsertionGapPx が十分あればその幅でクランプ（コメ列と競合しない）', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 40, top: 80, width: 560, height: 315 }),
        playerRowRect: null,
        viewport: { width: 1400, height: 900 },
        contentNaturalHeight: null,
        flexInsertionGapPx: 320
      });
      expect(r).not.toBeNull();
      expect(r?.panelWidth).toBe(320);
    });
  });

  describe('高さ計算 — 動画+コメ列に揃えて縦間延び解消', () => {
    it('playerRowRect が取れる → panel.height = playerRowRect.height', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 50, top: 80, width: 600, height: 338 }),
        playerRowRect: rect({ left: 50, top: 80, width: 1000, height: 600 }),
        viewport: { width: 1700, height: 1080 },
        contentNaturalHeight: null
      });
      expect(r?.panelHeight).toBe(600);
    });

    it('playerRowRect が null → panel.height = video.height', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 50, top: 80, width: 600, height: 338 }),
        playerRowRect: null,
        viewport: { width: 1700, height: 1080 },
        contentNaturalHeight: null
      });
      expect(r?.panelHeight).toBe(338);
    });

    it('contentNaturalHeight が小さければそれに合わせる（過大な panel を出さない）', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 50, top: 80, width: 600, height: 338 }),
        playerRowRect: rect({ left: 50, top: 80, width: 1000, height: 600 }),
        viewport: { width: 1700, height: 1080 },
        contentNaturalHeight: 400 // ← playerRowHeight 600 より小さい
      });
      // content-fit
      expect(r?.panelHeight).toBe(400);
    });

    it('contentNaturalHeight が minHeight を下回るなら minHeight に持ち上げる', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 50, top: 80, width: 600, height: 338 }),
        playerRowRect: rect({ left: 50, top: 80, width: 1000, height: 600 }),
        viewport: { width: 1700, height: 1080 },
        contentNaturalHeight: 100 // ← minHeight 240 を下回る
      });
      expect(r?.panelHeight).toBe(DEFAULT_BESIDE_PANEL_LIMITS.minHeight);
    });

    it('safety: panel.height は viewport*72% を超えない', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 50, top: 80, width: 600, height: 338 }),
        playerRowRect: rect({ left: 50, top: 80, width: 1000, height: 1500 }), // 異常に大きい
        viewport: { width: 1700, height: 1080 },
        contentNaturalHeight: null
      });
      // safetyMax = 1080 * 0.72 = 778
      expect(r?.panelHeight).toBeLessThanOrEqual(Math.round(1080 * 0.72));
    });

    it('panel.height は最低 minHeight (240px) を下回らない', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 50, top: 80, width: 400, height: 100 }), // 異常に小さい
        playerRowRect: null,
        viewport: { width: 1700, height: 1080 },
        contentNaturalHeight: null
      });
      expect(r?.panelHeight).toBeGreaterThanOrEqual(
        DEFAULT_BESIDE_PANEL_LIMITS.minHeight
      );
    });
  });

  describe('組み合わせケース（ユーザー報告の再現）', () => {
    it('1700px 報告（OK）の再現: video 580 + 残り余白十分 → 良いバランス', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 200, top: 80, width: 580, height: 326 }),
        playerRowRect: rect({ left: 200, top: 80, width: 580, height: 600 }),
        viewport: { width: 1700, height: 980 },
        contentNaturalHeight: 480
      });
      expect(r).not.toBeNull();
      expect(r?.panelWidth).toBe(580);
      expect(r?.panelHeight).toBe(480); // content-fit
    });

    it('1920px 報告（はみ出し）の再現: 利用可能幅 < minWidth → null で below へ逃がす', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 80, top: 80, width: 1700, height: 956 }),
        playerRowRect: rect({ left: 80, top: 80, width: 1700, height: 956 }),
        viewport: { width: 1920, height: 1080 },
        contentNaturalHeight: null
      });
      // 利用可能幅 = 1920 - 1780 - 12 = 128 < 280 → null（below フォールバック）
      expect(r).toBeNull();
    });

    it('2000px 報告（縦間延び）の再現: panel.height は playerRowHeight に揃う（CSS 560 固定じゃない）', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 200, top: 80, width: 700, height: 394 }),
        playerRowRect: rect({ left: 200, top: 80, width: 700, height: 480 }),
        viewport: { width: 2000, height: 1080 },
        contentNaturalHeight: 320
      });
      expect(r).not.toBeNull();
      expect(r?.panelWidth).toBe(700);
      // playerRowHeight 480 より content 320 が小さい → content-fit 320
      expect(r?.panelHeight).toBe(320);
    });
  });

  describe('overrides', () => {
    it('minWidth を上書きできる', () => {
      const r = calculateBesidePanelLayout(
        {
          videoRect: rect({ left: 50, top: 80, width: 800, height: 450 }),
          playerRowRect: null,
          viewport: { width: 1100, height: 800 },
          contentNaturalHeight: null
        },
        { minWidth: 200 }
      );
      // 利用可能幅 = 1100 - 850 - 12 = 238 → minWidth 200 以上なので OK
      expect(r?.panelWidth).toBe(238);
    });

    it('minHeight を上書きできる', () => {
      const r = calculateBesidePanelLayout(
        {
          videoRect: rect({ left: 50, top: 80, width: 600, height: 100 }),
          playerRowRect: null,
          viewport: { width: 1700, height: 1080 },
          contentNaturalHeight: null
        },
        { minHeight: 50 }
      );
      // video.height 100 で minHeight override 50 → 100
      expect(r?.panelHeight).toBe(100);
    });
  });

  describe('DEFAULT_BESIDE_PANEL_LIMITS', () => {
    it('frozen である', () => {
      expect(Object.isFrozen(DEFAULT_BESIDE_PANEL_LIMITS)).toBe(true);
    });

    it('minWidth は 280、safeRight は 12、besideInnerGap は 8（既存コードと整合）', () => {
      expect(DEFAULT_BESIDE_PANEL_LIMITS.minWidth).toBe(280);
      expect(DEFAULT_BESIDE_PANEL_LIMITS.safeRight).toBe(12);
      expect(DEFAULT_BESIDE_PANEL_LIMITS.besideInnerGap).toBe(8);
    });

    it('maxHeightRatio は 0.72 以下（dock_bottom 0.55 より緩いが viewport 全占有はしない）', () => {
      expect(DEFAULT_BESIDE_PANEL_LIMITS.maxHeightRatio).toBeLessThanOrEqual(
        0.72
      );
    });
  });

  describe('異常入力の clamp', () => {
    it('viewport.width が極小でも null か minWidth を返す', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 0, top: 0, width: 100, height: 60 }),
        playerRowRect: null,
        viewport: { width: 200, height: 200 },
        contentNaturalHeight: null
      });
      // 利用可能幅 = 200 - 100 - 12 = 88 < minWidth 280 → null
      expect(r).toBeNull();
    });

    it('videoRect が 0 でも例外を投げない', () => {
      const r = calculateBesidePanelLayout({
        videoRect: rect({ left: 0, top: 0, width: 0, height: 0 }),
        playerRowRect: null,
        viewport: { width: 1920, height: 1080 },
        contentNaturalHeight: null
      });
      // video 幅 0 だと panel 幅 = min(0, ...) = 0、minWidth 280 で持ち上げ or null
      expect(r === null || r.panelWidth >= DEFAULT_BESIDE_PANEL_LIMITS.minWidth).toBe(true);
    });
  });
});
