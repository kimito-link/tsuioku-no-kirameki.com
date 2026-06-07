import { describe, it, expect } from 'vitest';
import {
  pickBroadcasterNameForReputation,
  sanitizeBroadcasterQuery
} from './pickBroadcasterNameForReputation.js';

describe('sanitizeBroadcasterQuery', () => {
  it('前後空白を除去する', () => {
    expect(sanitizeBroadcasterQuery('  配信者A  ')).toBe('配信者A');
  });
  it('連続空白を1つにまとめる', () => {
    expect(sanitizeBroadcasterQuery('配信者  A   B')).toBe('配信者 A B');
  });
  it('100文字を超えたら切り詰める', () => {
    const long = 'あ'.repeat(150);
    expect(sanitizeBroadcasterQuery(long).length).toBe(100);
  });
  it('非文字列は空文字', () => {
    expect(sanitizeBroadcasterQuery(null)).toBe('');
    expect(sanitizeBroadcasterQuery(undefined)).toBe('');
    expect(sanitizeBroadcasterQuery(123)).toBe('');
  });
});

describe('pickBroadcasterNameForReputation', () => {
  it('正本 watch_snapshot.broadcasterName を最優先で返す', () => {
    const summaries = {
      'nls_watch_snapshot_lv123': { broadcasterName: '配信者A' },
      'nls_panel_summary_lv123': { broadcasterName: '古い名前' }
    };
    expect(pickBroadcasterNameForReputation({ summaries, lv: 'lv123' })).toBe('配信者A');
  });

  it('snapshot に無ければ programProvider.name を見る', () => {
    const summaries = {
      'nls_watch_snapshot_lv123': { broadcasterName: '', programProvider: { name: '提供者B' } }
    };
    expect(pickBroadcasterNameForReputation({ summaries, lv: 'lv123' })).toBe('提供者B');
  });

  it('snapshot に無ければ panel_summary.broadcasterName にフォールバック', () => {
    const summaries = {
      'nls_panel_summary_lv123': { broadcasterName: '配信者C', title: '歌枠' }
    };
    expect(pickBroadcasterNameForReputation({ summaries, lv: 'lv123' })).toBe('配信者C');
  });

  it('指定 lv が無ければ任意の有効な配信者名を拾う', () => {
    const summaries = {
      'nls_watch_snapshot_lv999': { broadcasterName: '配信者D' }
    };
    expect(pickBroadcasterNameForReputation({ summaries, lv: 'lv123' })).toBe('配信者D');
  });

  it('どこにも無ければ空文字 (title では代替しない)', () => {
    const summaries = {
      'nls_watch_snapshot_lv123': { broadcasterName: '' },
      'nls_panel_summary_lv123': { broadcasterName: '', title: '歌枠' }
    };
    expect(pickBroadcasterNameForReputation({ summaries, lv: 'lv123' })).toBe('');
  });

  it('「(配信者名 不明)」のようなプレースホルダは採用しない', () => {
    const summaries = {
      'nls_watch_snapshot_lv123': { broadcasterName: '(配信者名 不明)' }
    };
    expect(pickBroadcasterNameForReputation({ summaries, lv: 'lv123' })).toBe('');
  });

  it('summaries が空/非オブジェクトでも壊れない', () => {
    expect(pickBroadcasterNameForReputation({ summaries: {}, lv: 'lv1' })).toBe('');
    expect(pickBroadcasterNameForReputation({ summaries: null, lv: 'lv1' })).toBe('');
    expect(pickBroadcasterNameForReputation({})).toBe('');
    expect(pickBroadcasterNameForReputation(null)).toBe('');
  });

  it('取得した名前は sanitize される', () => {
    const summaries = {
      'nls_watch_snapshot_lv123': { broadcasterName: '  配信者  A  ' }
    };
    expect(pickBroadcasterNameForReputation({ summaries, lv: 'lv123' })).toBe('配信者 A');
  });
});
