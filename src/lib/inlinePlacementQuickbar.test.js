import { describe, it, expect } from 'vitest';
import {
  placementQuickLabel,
  buildPlacementQuickbarModel
} from './inlinePlacementQuickbar.js';

describe('inlinePlacementQuickbar', () => {
  describe('placementQuickLabel', () => {
    it('各配置値を日本語ラベルに', () => {
      expect(placementQuickLabel('dock_bottom')).toBe('画面下いっぱい');
      expect(placementQuickLabel('below')).toBe('プレイヤー行の下');
      expect(placementQuickLabel('beside')).toBe('横付き');
      expect(placementQuickLabel('floating')).toBe('ポップアップ風');
    });
    it('不明値/空は安全側（プレイヤー行の下）', () => {
      expect(placementQuickLabel('')).toBe('プレイヤー行の下');
      expect(placementQuickLabel('xxx')).toBe('プレイヤー行の下');
      expect(placementQuickLabel(null)).toBe('プレイヤー行の下');
    });
  });

  describe('buildPlacementQuickbarModel', () => {
    it('beside 選択時: ラベル横付き・besideActive', () => {
      const m = buildPlacementQuickbarModel({ placement: 'beside', effectivePlacement: 'beside' });
      expect(m.currentLabel).toBe('横付き');
      expect(m.besideActive).toBe(true);
      expect(m.belowActive).toBe(false);
      expect(m.effectiveNote).toBe('');
    });

    it('below 選択時: belowActive', () => {
      const m = buildPlacementQuickbarModel({ placement: 'below', effectivePlacement: 'below' });
      expect(m.belowActive).toBe(true);
      expect(m.besideActive).toBe(false);
    });

    it('dock_bottom/floating は2トグル両方 false（他の位置）', () => {
      const dock = buildPlacementQuickbarModel({ placement: 'dock_bottom' });
      expect(dock.besideActive).toBe(false);
      expect(dock.belowActive).toBe(false);
      expect(dock.currentLabel).toBe('画面下いっぱい');
      const fl = buildPlacementQuickbarModel({ placement: 'floating' });
      expect(fl.besideActive).toBe(false);
      expect(fl.belowActive).toBe(false);
    });

    it('実効が保存値と異なるとき effectiveNote を出す（beside 選択→狭タブで below 降格）', () => {
      const m = buildPlacementQuickbarModel({
        placement: 'beside',
        effectivePlacement: 'below'
      });
      expect(m.effectiveNote).toContain('今は');
      expect(m.effectiveNote).toContain('プレイヤー行の下');
      // 保存値基準なので besideActive は true のまま（ユーザーの選択を尊重）
      expect(m.besideActive).toBe(true);
    });

    it('実効=保存値 or 実効不明なら effectiveNote は空', () => {
      expect(
        buildPlacementQuickbarModel({ placement: 'beside', effectivePlacement: 'beside' })
          .effectiveNote
      ).toBe('');
      expect(buildPlacementQuickbarModel({ placement: 'beside' }).effectiveNote).toBe('');
    });

    it('横付き選択×実効が下＝狭ウィンドウ降格のときだけ besideNarrowHint を出す（押しても変わらない誤解の解）', () => {
      const m = buildPlacementQuickbarModel({
        placement: 'beside',
        effectivePlacement: 'below'
      });
      expect(m.besideNarrowHint).toContain('横付き');
      expect(m.besideNarrowHint).toContain('1100px');
      expect(m.besideNarrowHint).toContain('広げ');
    });

    it('besideNarrowHint は降格時以外すべて空', () => {
      // 横付きが実効でも横付き → 既に横並びなのでヒント不要
      expect(
        buildPlacementQuickbarModel({ placement: 'beside', effectivePlacement: 'beside' })
          .besideNarrowHint
      ).toBe('');
      // 実効不明（popup 文脈で渡さない）→ 誤誘導しないよう空
      expect(buildPlacementQuickbarModel({ placement: 'beside' }).besideNarrowHint).toBe('');
      // 下を明示選択 → 降格ではないのでヒント不要
      expect(
        buildPlacementQuickbarModel({ placement: 'below', effectivePlacement: 'below' })
          .besideNarrowHint
      ).toBe('');
      // dock_bottom など → 横付きと無関係
      expect(
        buildPlacementQuickbarModel({ placement: 'dock_bottom', effectivePlacement: 'dock_bottom' })
          .besideNarrowHint
      ).toBe('');
    });

    it('placement 省略時は dock_bottom 既定', () => {
      const m = buildPlacementQuickbarModel({});
      expect(m.currentLabel).toBe('画面下いっぱい');
    });
  });
});
