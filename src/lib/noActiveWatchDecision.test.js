import { describe, it, expect } from 'vitest';
import { decideNoActiveWatch, isPersistentWatchSurface } from './noActiveWatchDecision.js';

/**
 * ★このテストが守っている実害(2026-08-10 実機):
 *   サイドパネルを開いたまま X や YouTube へタブを切り替えると、
 *   記録は動いているのにサイドパネルだけが空になり
 *   「watchページが見つかりません」が出ていた。
 */
describe('decideNoActiveWatch', () => {
  describe('★サイドパネル: タブを切り替えても画面を空にしない(今回の実害)', () => {
    it('storage 経由でもサイドパネルなら watch を保持する', () => {
      const r = decideNoActiveWatch({
        isWatchUrl: true,
        source: 'storage',
        sidePanel: true
      });
      expect(r.treatAsNoActiveWatch).toBe(false);
      expect(r.showNoWatchHint).toBe(false);
    });

    it('dataBacked 経由でもサイドパネルなら watch を保持する', () => {
      const r = decideNoActiveWatch({
        isWatchUrl: true,
        source: 'dataBacked',
        sidePanel: true
      });
      expect(r.treatAsNoActiveWatch).toBe(false);
    });

    it('★同じ入力でも【ツールバーpopup】なら従来どおり空にする(退化させない)', () => {
      const r = decideNoActiveWatch({
        isWatchUrl: true,
        source: 'storage',
        sidePanel: false
      });
      expect(r.treatAsNoActiveWatch).toBe(true);
      expect(r.showNoWatchHint).toBe(true);
    });
  });

  describe('watch URL that is genuinely absent', () => {
    it('URL が取れないならサイドパネルでも空にする(配信を閉じた後)', () => {
      const r = decideNoActiveWatch({
        isWatchUrl: false,
        source: 'none',
        sidePanel: true
      });
      expect(r.treatAsNoActiveWatch).toBe(true);
      expect(r.showNoWatchHint).toBe(true);
      expect(r.reason).toBe('no-watch-url');
    });

    it('source が none なら URL 形式が watch でも空にする', () => {
      const r = decideNoActiveWatch({ isWatchUrl: true, source: 'none' });
      expect(r.treatAsNoActiveWatch).toBe(true);
    });

    it('★watch 埋め込みには「見つかりません」を出さない(watchページの中にいる)', () => {
      const r = decideNoActiveWatch({
        isWatchUrl: false,
        source: 'none',
        embedWatch: true
      });
      expect(r.treatAsNoActiveWatch).toBe(true);
      expect(r.showNoWatchHint).toBe(false);
    });
  });

  describe('activeTab / inlineParam はどの面でも watch 扱い', () => {
    for (const source of ['activeTab', 'inlineParam']) {
      it(`${source} は保持する(ツールバーpopup)`, () => {
        const r = decideNoActiveWatch({ isWatchUrl: true, source });
        expect(r.treatAsNoActiveWatch).toBe(false);
        expect(r.showNoWatchHint).toBe(false);
      });
      it(`${source} は保持する(サイドパネル)`, () => {
        const r = decideNoActiveWatch({ isWatchUrl: true, source, sidePanel: true });
        expect(r.treatAsNoActiveWatch).toBe(false);
      });
    }
  });

  describe('既存挙動の維持', () => {
    it('lastFocusedNormal は実質アクティブとして保持する', () => {
      const r = decideNoActiveWatch({ isWatchUrl: true, source: 'lastFocusedNormal' });
      expect(r.treatAsNoActiveWatch).toBe(false);
    });

    it('watch 埋め込みは storage 経由でも保持する(常駐面)', () => {
      const r = decideNoActiveWatch({
        isWatchUrl: true,
        source: 'storage',
        embedWatch: true
      });
      expect(r.treatAsNoActiveWatch).toBe(false);
    });

    it('不正な入力でも throw しない', () => {
      expect(() => decideNoActiveWatch(null)).not.toThrow();
      expect(decideNoActiveWatch(null).treatAsNoActiveWatch).toBe(true);
      expect(decideNoActiveWatch(undefined).treatAsNoActiveWatch).toBe(true);
    });
  });

  describe('isPersistentWatchSurface', () => {
    it('サイドパネルと watch 埋め込みが常駐面', () => {
      expect(isPersistentWatchSurface({ sidePanel: true })).toBe(true);
      expect(isPersistentWatchSurface({ embedWatch: true })).toBe(true);
      expect(isPersistentWatchSurface({})).toBe(false);
      expect(isPersistentWatchSurface(null)).toBe(false);
    });
  });
});
