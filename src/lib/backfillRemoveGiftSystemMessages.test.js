/**
 * v0.1.172 〜 v0.1.194 の間に NDGR ギフトシステムメッセージが
 * `nls_comments_<lv>` に通常コメントとして persist されていた汚染を
 * 1 回限りの migration で除去する純関数のテスト。
 *
 * v0.1.195 で `cleanNdgrChatRows` / `ndgrChatRows` 側に gift パターン
 * skip を入れた（commit d357dc6）が、それ以前に既に書き込まれた行は
 * storage に残るため、本 migration で popup 起動時に除去する。
 */
import { describe, it, expect } from 'vitest';
import { backfillRemoveGiftSystemMessages } from './backfillRemoveGiftSystemMessages.js';

describe('backfillRemoveGiftSystemMessages', () => {
  it('空配列はそのまま', () => {
    const r = backfillRemoveGiftSystemMessages([]);
    expect(r.cleaned).toEqual([]);
    expect(r.removedCount).toBe(0);
  });

  it('Array でない値は空配列に正規化される（防御）', () => {
    expect(backfillRemoveGiftSystemMessages(null).cleaned).toEqual([]);
    expect(backfillRemoveGiftSystemMessages(null).removedCount).toBe(0);
    expect(backfillRemoveGiftSystemMessages(undefined).cleaned).toEqual([]);
    expect(backfillRemoveGiftSystemMessages('not-array').cleaned).toEqual([]);
    expect(backfillRemoveGiftSystemMessages({}).cleaned).toEqual([]);
  });

  it('ギフトシステム文を除外し、件数を返す', () => {
    const stored = [
      { commentNo: 1, text: 'こんにちは', userId: '111' },
      {
        commentNo: 2,
        text: 'ポンコツびぃちゃんさんがギフト「応援メガホン 黄（10pt）」を贈りました',
        userId: '222'
      },
      { commentNo: 3, text: 'おつ〜', userId: '333' },
      {
        commentNo: 4,
        text: '【ギフト貢献5位】kawarimiw9 さんがギフト「ヤミーアイスクリーム（100pt）」を贈りました',
        userId: '444'
      }
    ];
    const r = backfillRemoveGiftSystemMessages(stored);
    expect(r.cleaned).toHaveLength(2);
    expect(r.removedCount).toBe(2);
    expect(r.cleaned[0].text).toBe('こんにちは');
    expect(r.cleaned[1].text).toBe('おつ〜');
  });

  it('object でない要素はそのまま通す（防御：壊れたデータを破壊しない）', () => {
    const stored = ['string-value', 42, null, { commentNo: 1, text: 'ok' }];
    const r = backfillRemoveGiftSystemMessages(stored);
    expect(r.cleaned).toHaveLength(4);
    expect(r.removedCount).toBe(0);
    expect(r.cleaned[0]).toBe('string-value');
    expect(r.cleaned[1]).toBe(42);
    expect(r.cleaned[2]).toBeNull();
    expect(r.cleaned[3]).toEqual({ commentNo: 1, text: 'ok' });
  });

  it('text フィールドがない要素は通す（防御）', () => {
    const stored = [{ commentNo: 1, userId: '111' }, { commentNo: 2, text: '', userId: '222' }];
    const r = backfillRemoveGiftSystemMessages(stored);
    expect(r.cleaned).toHaveLength(2);
    expect(r.removedCount).toBe(0);
  });

  it('元配列を mutate しない（純関数性）', () => {
    const stored = [
      { commentNo: 1, text: 'こんにちは', userId: '111' },
      { commentNo: 2, text: 'ポンコツびぃちゃんさんがギフト「応援メガホン 黄（10pt）」を贈りました', userId: '222' }
    ];
    const before = JSON.stringify(stored);
    backfillRemoveGiftSystemMessages(stored);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('全行が gift system msg だった場合、空 + 全件カウント', () => {
    const stored = [
      { commentNo: 1, text: 'A さんがギフト「item1（10pt）」を贈りました', userId: '111' },
      { commentNo: 2, text: 'B さんがギフト「item2（20pt）」を贈りました', userId: '222' }
    ];
    const r = backfillRemoveGiftSystemMessages(stored);
    expect(r.cleaned).toEqual([]);
    expect(r.removedCount).toBe(2);
  });
});
