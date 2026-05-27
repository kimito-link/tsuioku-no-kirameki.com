import { describe, expect, it } from 'vitest';
import {
  buildContextSourceLine,
  buildMultiTabHint,
  buildRecoveryBarReason,
  formatPopupRefreshClock,
  labelStatSurfaceMode,
  labelWatchUrlSource,
  resolvePopupStatSurfaceMode,
  shouldRescueEmptyResolvedWatch,
  shouldShowPopupRecoveryBar,
  truncateUiTitle
} from './popupContextBarModel.js';

describe('popupContextBarModel', () => {
  it('labelWatchUrlSource', () => {
    expect(labelWatchUrlSource('activeTab')).toBe('前面タブ');
    expect(labelWatchUrlSource('dataBacked')).toBe('記録のある配信タブ');
    expect(labelWatchUrlSource('lastFocusedNormal')).toBe('直前のブラウザタブ');
    expect(labelWatchUrlSource('storage')).toBe('直近の視聴URL（保存）');
  });

  describe('shouldRescueEmptyResolvedWatch（v0.1.414 multitab「中身が空」救済）', () => {
    const base = {
      watchUrlSource: 'lastFocusedNormal',
      hasSnapshotForLv: false,
      storedCommentCount: 0,
      onNicoUserProfilePage: false,
      inlineMode: false
    };

    it('推測解決（lastFocusedNormal）でデータ皆無 → 救済する（true）', () => {
      expect(shouldRescueEmptyResolvedWatch(base)).toBe(true);
    });

    it('推測解決（storage）でデータ皆無 → 救済する（true）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, watchUrlSource: 'storage' })).toBe(true);
    });

    it('推測解決（dataBacked）でデータ皆無 → 救済する（true）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, watchUrlSource: 'dataBacked' })).toBe(true);
    });

    it('前面 activeTab はデータ皆無でも救済しない（自タブ尊重・false）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, watchUrlSource: 'activeTab' })).toBe(false);
    });

    it('inlineParam（self-tab）は救済しない（false）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, watchUrlSource: 'inlineParam' })).toBe(false);
    });

    it('記録が 1 件でもあれば救済しない（false）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, storedCommentCount: 1 })).toBe(false);
    });

    it('lv 一致 snapshot があれば救済しない（false）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, hasSnapshotForLv: true })).toBe(false);
    });

    it('INLINE_MODE では救済しない（空状態 UI を持たない・false）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, inlineMode: true })).toBe(false);
    });

    it('ニコ生ユーザープロフィールページ上では救済しない（stale 応援者誤表示回避・false）', () => {
      expect(shouldRescueEmptyResolvedWatch({ ...base, onNicoUserProfilePage: true })).toBe(false);
    });

    it('入力が無効でも throw せず false', () => {
      expect(shouldRescueEmptyResolvedWatch(null)).toBe(false);
      expect(shouldRescueEmptyResolvedWatch(undefined)).toBe(false);
    });
  });

  it('buildContextSourceLine: storage かつ接続あり', () => {
    const t = buildContextSourceLine({
      watchUrlSource: 'storage',
      treatAsNoActiveWatch: false
    });
    expect(t).toContain('直近の視聴URL');
  });

  it('buildContextSourceLine: 接続なし', () => {
    const t = buildContextSourceLine({
      watchUrlSource: 'activeTab',
      treatAsNoActiveWatch: true
    });
    expect(t).toContain('接続: なし');
  });

  it('shouldShowPopupRecoveryBar: 接続なしは出さない', () => {
    expect(
      shouldShowPopupRecoveryBar({
        hasLiveContext: false,
        fetchInflight: false,
        fetchError: 'x',
        snapshot: { liveId: 'lv1' }
      })
    ).toBe(false);
  });

  it('shouldShowPopupRecoveryBar: 取得中は出さない', () => {
    expect(
      shouldShowPopupRecoveryBar({
        hasLiveContext: true,
        fetchInflight: true,
        fetchError: '',
        snapshot: null
      })
    ).toBe(false);
  });

  it('shouldShowPopupRecoveryBar: エラー文字列あり', () => {
    expect(
      shouldShowPopupRecoveryBar({
        hasLiveContext: true,
        fetchInflight: false,
        fetchError: 'Receiving end does not exist',
        snapshot: null
      })
    ).toBe(true);
  });

  it('shouldShowPopupRecoveryBar: snapshot 取得失敗（null かつ取得完了）', () => {
    expect(
      shouldShowPopupRecoveryBar({
        hasLiveContext: true,
        fetchInflight: false,
        fetchError: '',
        snapshot: null
      })
    ).toBe(true);
  });

  it('buildRecoveryBarReason: 接続拒否風のメッセージ', () => {
    const t = buildRecoveryBarReason({
      hasLiveContext: true,
      fetchError: 'Receiving end does not exist',
      fetchInflight: false,
      snapshot: null
    });
    expect(t).toContain('配信ページ');
  });

  it('resolvePopupStatSurfaceMode', () => {
    expect(
      resolvePopupStatSurfaceMode({
        treatAsNoActiveWatch: true,
        fetchInflight: false,
        hasSnapshot: true
      })
    ).toBe('empty');
    expect(
      resolvePopupStatSurfaceMode({
        treatAsNoActiveWatch: false,
        fetchInflight: true,
        hasSnapshot: false
      })
    ).toBe('loading');
    expect(
      resolvePopupStatSurfaceMode({
        treatAsNoActiveWatch: false,
        fetchInflight: true,
        hasSnapshot: true
      })
    ).toBe('stale');
    expect(
      resolvePopupStatSurfaceMode({
        treatAsNoActiveWatch: false,
        fetchInflight: false,
        hasSnapshot: true
      })
    ).toBe('ok');
  });

  it('labelStatSurfaceMode', () => {
    expect(labelStatSurfaceMode('stale')).toBe('直近値');
  });

  it('formatPopupRefreshClock', () => {
    const s = formatPopupRefreshClock(1_700_000_000_000);
    expect(s).toMatch(/POP更新:/);
  });

  it('buildMultiTabHint', () => {
    expect(buildMultiTabHint(1)).toBe('');
    expect(buildMultiTabHint(2)).toContain('2 件');
  });

  it('truncateUiTitle', () => {
    expect(truncateUiTitle('a'.repeat(50), 10).length).toBeLessThanOrEqual(10);
  });
});
