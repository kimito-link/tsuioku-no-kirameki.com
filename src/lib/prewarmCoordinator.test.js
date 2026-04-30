/**
 * prewarmCoordinator のテスト。
 *
 * 0.1.42 (X): 複数 watch タブで kon-ta クリック時のパネル表示が遅くなる問題への対策。
 *
 * 背景:
 *   各 watch タブが独立に `prewarmInlinePopupIframe` で popup.html を裏でロード
 *   していた。複数タブが visible 状態で同時に並んでいると、全タブが並列で
 *   popup.html（10000+ 行 JS）をパース・実行 → CPU 取り合いで個々の prewarm が
 *   遅延 → kon-ta クリック時点で iframe がまだロード中 → パネル表示が遅い。
 *
 *   このヘルパは chrome.storage.local の "lease" を使って **同時に prewarm を
 *   走らせるタブを 1 つに絞る**（first-write-wins）純粋関数。
 *
 *   各タブは起動時に乱数 instanceId を持ち、prewarm 前に lease を確認:
 *     - lease が空 / 自分 / 古い → claim して prewarm 実行
 *     - lease が他者 / 新しい → 一定時間待って再試行
 *   prewarm 完了後 / 失敗時に lease を release。
 */

import { describe, it, expect } from 'vitest';
import { decidePrewarmLeaseAction } from './prewarmCoordinator.js';

describe('decidePrewarmLeaseAction', () => {
  it('lease が空 → claim できる（proceed）', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: '',
      currentLeaseAt: 0,
      selfId: 'tab-1',
      now: 1_000,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('claim');
  });

  it('lease が自分自身 → そのまま proceed', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: 'tab-1',
      currentLeaseAt: 1_000,
      selfId: 'tab-1',
      now: 1_500,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('proceed');
  });

  it('他タブが lease 保持中、TTL 内 → defer', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: 'tab-2',
      currentLeaseAt: 1_000,
      selfId: 'tab-1',
      now: 5_000,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('defer');
  });

  it('他タブの lease が古い（TTL 経過） → claim 横取り', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: 'tab-2',
      currentLeaseAt: 1_000,
      selfId: 'tab-1',
      now: 15_000,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('claim');
  });

  it('lease holder が空文字（リリース済み） → claim', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: '',
      currentLeaseAt: 5_000,
      selfId: 'tab-1',
      now: 6_000,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('claim');
  });

  it('selfId が空文字 → defer（自分が識別できないので動かさない）', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: '',
      currentLeaseAt: 0,
      selfId: '',
      now: 1_000,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('defer');
  });

  it('TTL 境界: lease がちょうど TTL 経過時 → claim 横取り（厳密 >）', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: 'tab-2',
      currentLeaseAt: 1_000,
      selfId: 'tab-1',
      now: 11_001,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('claim');
  });

  it('TTL 境界: lease がちょうど TTL 内 → defer', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: 'tab-2',
      currentLeaseAt: 1_000,
      selfId: 'tab-1',
      now: 11_000,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('defer');
  });

  it('未来の timestamp（時計ズレ） → defer（保守的に）', () => {
    const r = decidePrewarmLeaseAction({
      currentLeaseHolder: 'tab-2',
      currentLeaseAt: 100_000,
      selfId: 'tab-1',
      now: 1_000,
      leaseTimeoutMs: 10_000
    });
    expect(r).toBe('defer');
  });

  it('null / undefined 入力でも throw しない', () => {
    expect(decidePrewarmLeaseAction({
      currentLeaseHolder: null,
      currentLeaseAt: null,
      selfId: 'tab-1',
      now: 1_000,
      leaseTimeoutMs: 10_000
    })).toBe('claim');
    expect(decidePrewarmLeaseAction({
      currentLeaseHolder: undefined,
      currentLeaseAt: undefined,
      selfId: 'tab-1',
      now: 1_000,
      leaseTimeoutMs: 10_000
    })).toBe('claim');
  });
});
