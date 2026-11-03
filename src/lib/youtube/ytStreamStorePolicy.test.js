import { describe, it, expect } from 'vitest';
import {
  YT_SIDE_PANEL_DISPLAY_LIMIT,
  buildYtCommentPrimaryKey,
  mergeYtStreamSummary,
  prepareYtCommentsForIdb,
  selectYtNewestCommentsForDisplay,
} from './ytStreamStorePolicy.js';

describe('buildYtCommentPrimaryKey', () => {
  it('videoId と commentId から一意の複合主キーを作る', () => {
    expect(buildYtCommentPrimaryKey('abc123xyz', 'ChwKGk1')).toBe('abc123xyz::ChwKGk1');
    expect(buildYtCommentPrimaryKey('', 'ChwKGk1')).toBe('');
    expect(buildYtCommentPrimaryKey('abc123xyz', '')).toBe('');
  });
});

describe('mergeYtStreamSummary', () => {
  it('コメント本体配列（items）を持たず、配信一覧の要約情報だけを生成・更新する（上限間引き・自動削除なし）', () => {
    const t0 = 1_700_000_000_000;
    const first = mergeYtStreamSummary(
      null,
      {
        videoId: 'vid-1',
        title: 'テスト配信',
        broadcasterName: 'りんく',
        broadcasterChannelId: 'UCOwner123456789012345678',
        chatFilterLabel: 'すべてのチャット',
        itemCount: 120,
      },
      t0,
    );

    expect(first).toEqual({
      videoId: 'vid-1',
      title: 'テスト配信',
      broadcasterName: 'りんく',
      broadcasterChannelId: 'UCOwner123456789012345678',
      chatFilterLabel: 'すべてのチャット',
      itemCount: 120,
      createdAt: t0,
      updatedAt: t0,
    });
    expect('items' in first).toBe(false);

    const t1 = t0 + 60_000;
    const updated = mergeYtStreamSummary(
      first,
      {
        videoId: 'vid-1',
        itemCount: 5000, // 1500件上限なしで全件数を保持
      },
      t1,
    );
    expect(updated.title).toBe('テスト配信');
    expect(updated.itemCount).toBe(5000);
    expect(updated.createdAt).toBe(t0);
    expect(updated.updatedAt).toBe(t1);
    expect('items' in updated).toBe(false);
  });
});

describe('prepareYtCommentsForIdb', () => {
  it('同一バッチ内の重複 id を除外し、1500件を超えても間引かず全件に pk と videoId を付与する', () => {
    const rawBatch = Array.from({ length: 1600 }, (_, i) => ({
      id: `msg-${i + 1}`,
      channelId: `UCUser${i + 1}`,
      name: `@User${i + 1}`,
      text: `コメント ${i + 1}`,
      kind: 'text',
      amount: 0,
      currency: '',
      badges: [],
      ts: '12:00 PM',
    }));
    // 重複1件を追加
    rawBatch.push({ ...rawBatch[0] });

    const records = prepareYtCommentsForIdb('stream-xyz', rawBatch, 1_700_000_000_000);
    expect(records).toHaveLength(1600);
    expect(records[0].pk).toBe('stream-xyz::msg-1');
    expect(records[0].videoId).toBe('stream-xyz');
    expect(records[1599].pk).toBe('stream-xyz::msg-1600');
  });
});

describe('selectYtNewestCommentsForDisplay', () => {
  it('全件保存されたコメント配列から、新しい順（降順）で指定上限件数だけを返す', () => {
    expect(YT_SIDE_PANEL_DISPLAY_LIMIT).toBeGreaterThan(0);
    const items = [
      { id: 'c1', text: '1番目', seq: 1 },
      { id: 'c2', text: '2番目', seq: 2 },
      { id: 'c3', text: '3番目', seq: 3 },
      { id: 'c4', text: '4番目', seq: 4 },
      { id: 'c5', text: '5番目', seq: 5 },
    ];

    const displayed = selectYtNewestCommentsForDisplay(items, 3);
    expect(displayed.map((x) => x.id)).toEqual(['c5', 'c4', 'c3']);
    // 元の配列（全件データ）は破壊しない
    expect(items).toHaveLength(5);
  });
});
