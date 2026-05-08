/**
 * v0.1.200: 「おすすめ生放送」DOM がコメント記録に混入していた汚染を
 * popup 起動時に 1 回だけ除去する migration の純関数テスト。
 *
 * v0.1.200 の root cause fix（src/lib/nicoliveDom.js のガード追加）後の
 * 後始末。それ以前に書き込まれた汚染データ（配信タイトル風 text、lvXXX userId）
 * を判定して除去する。
 */
import { describe, it, expect } from 'vitest';
import { backfillRemoveRecommendedLivePollution } from './backfillRemoveRecommendedLivePollution.js';

describe('backfillRemoveRecommendedLivePollution', () => {
  it('空配列はそのまま', () => {
    const r = backfillRemoveRecommendedLivePollution([]);
    expect(r.cleaned).toEqual([]);
    expect(r.removedCount).toBe(0);
  });

  it('Array でない値は空配列に正規化（防御）', () => {
    expect(backfillRemoveRecommendedLivePollution(null).cleaned).toEqual([]);
    expect(backfillRemoveRecommendedLivePollution(undefined).cleaned).toEqual([]);
    expect(backfillRemoveRecommendedLivePollution('not-array').cleaned).toEqual([]);
    expect(backfillRemoveRecommendedLivePollution({}).cleaned).toEqual([]);
    expect(backfillRemoveRecommendedLivePollution(null).removedCount).toBe(0);
  });

  it('配信タイトル風 text（「N分経過」）は除外', () => {
    const stored = [
      { commentNo: 1, text: 'こんにちは', userId: '111' },
      { commentNo: 2, text: '52分経過', userId: '222' },
      { commentNo: 3, text: '1時間52分経過', userId: '333' },
      { commentNo: 4, text: '5分経過', userId: '444' }
    ];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.removedCount).toBe(3);
    expect(r.cleaned).toHaveLength(1);
    expect(r.cleaned[0].text).toBe('こんにちは');
  });

  it('「N分前」「N時間前」も除外', () => {
    const stored = [
      { commentNo: 1, text: 'おつ〜', userId: '111' },
      { commentNo: 2, text: '5分前', userId: '222' },
      { commentNo: 3, text: '2時間前', userId: '333' }
    ];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.removedCount).toBe(2);
    expect(r.cleaned).toHaveLength(1);
    expect(r.cleaned[0].text).toBe('おつ〜');
  });

  it('ステータス文言（LIVE / タイムシフト / 公開終了）は除外', () => {
    const stored = [
      { commentNo: 1, text: 'LIVE', userId: '111' },
      { commentNo: 2, text: 'タイムシフト', userId: '222' },
      { commentNo: 3, text: '公開終了', userId: '333' },
      { commentNo: 4, text: '普通のコメント', userId: '444' }
    ];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.removedCount).toBe(3);
    expect(r.cleaned).toHaveLength(1);
    expect(r.cleaned[0].text).toBe('普通のコメント');
  });

  it('userId が lv で始まる行（配信ID 誤認）は除外', () => {
    const stored = [
      { commentNo: 1, text: 'こんにちは', userId: '143123809' },
      { commentNo: 2, text: '何か', userId: 'lv350469899' },
      { commentNo: 3, text: 'foo', userId: 'LV350123456' }, // 大文字
      { commentNo: 4, text: 'bar', userId: '12345' }
    ];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.removedCount).toBe(2);
    expect(r.cleaned).toHaveLength(2);
    expect(r.cleaned[0].text).toBe('こんにちは');
    expect(r.cleaned[1].text).toBe('bar');
  });

  it('object でない要素はそのまま通す（防御）', () => {
    const stored = ['string', 42, null, { commentNo: 1, text: 'ok' }];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.cleaned).toHaveLength(4);
    expect(r.removedCount).toBe(0);
  });

  it('text フィールドがない要素は通す（防御）', () => {
    const stored = [
      { commentNo: 1, userId: '111' },
      { commentNo: 2, text: '', userId: '222' }
    ];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.cleaned).toHaveLength(2);
    expect(r.removedCount).toBe(0);
  });

  it('元配列を mutate しない（純関数性）', () => {
    const stored = [
      { commentNo: 1, text: 'こんにちは', userId: '111' },
      { commentNo: 2, text: '52分経過', userId: '222' }
    ];
    const before = JSON.stringify(stored);
    backfillRemoveRecommendedLivePollution(stored);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('全行が汚染だった場合、空 + 全件カウント', () => {
    const stored = [
      { commentNo: 1, text: 'LIVE', userId: '111' },
      { commentNo: 2, text: '5分経過', userId: '222' },
      { commentNo: 3, text: '何か', userId: 'lv350469899' }
    ];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.cleaned).toEqual([]);
    expect(r.removedCount).toBe(3);
  });

  it('ギフトシステム文言は対象外（v0.1.196 の migration が担当）', () => {
    // 二重 migration を避け、各 migration が自分の責任範囲だけ除外する
    const stored = [
      {
        commentNo: 1,
        text: 'ポンコツびぃちゃんさんがギフト「応援メガホン 黄（10pt）」を贈りました',
        userId: '222'
      }
    ];
    const r = backfillRemoveRecommendedLivePollution(stored);
    expect(r.removedCount).toBe(0);
    expect(r.cleaned).toHaveLength(1);
  });
});
