import { describe, expect, it } from 'vitest';
import {
  buildContextSourceLine,
  buildMultiTabHint,
  buildRecoveryBarReason,
  formatPopupRefreshClock,
  labelStatSurfaceMode,
  labelWatchUrlSource,
  resolvePopupStatSurfaceMode,
  shouldShowPopupRecoveryBar,
  truncateUiTitle
} from './popupContextBarModel.js';

describe('popupContextBarModel', () => {
  it('labelWatchUrlSource', () => {
    expect(labelWatchUrlSource('activeTab')).toBe('前面タブ');
    expect(labelWatchUrlSource('lastFocusedNormal')).toBe('直前のブラウザタブ');
    expect(labelWatchUrlSource('storage')).toBe('直近の視聴URL（保存）');
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
