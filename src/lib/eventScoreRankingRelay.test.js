import { describe, it, expect } from 'vitest';
import {
  eventScoreRankingStorageKey,
  EVENT_SCORE_RANKING_STORAGE_PREFIX,
  extractContentIdFromAuditionRichviewUrl,
  validateEventScoreRankingRelayPayload
} from './eventScoreRankingRelay.js';

describe('eventScoreRankingStorageKey', () => {
  it('正規化 lv キー', () => {
    expect(eventScoreRankingStorageKey('LV123')).toBe(
      `${EVENT_SCORE_RANKING_STORAGE_PREFIX}lv123`
    );
  });
});

describe('extractContentIdFromAuditionRichviewUrl', () => {
  it('richview + content_id が一致すれば lv を返す', () => {
    expect(
      extractContentIdFromAuditionRichviewUrl(
        'https://audition.nicovideo.jp/embedded/richview/live?content_id=LV350606186&x=1'
      )
    ).toBe('lv350606186');
  });
  it('パス不一致は null', () => {
    expect(extractContentIdFromAuditionRichviewUrl('https://audition.nicovideo.jp/other')).toBe(
      null
    );
  });
});

describe('validateEventScoreRankingRelayPayload', () => {
  const goodRows = [
    { rank: 1, score: 432295, name: 'A', isAnonymous: false, thumbnailUrl: '' },
    { rank: 2, score: 233795, name: 'B', isAnonymous: false, thumbnailUrl: '' }
  ];
  const frame =
    'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv888888888';

  it('audition + content_id 一致 + 行妥当 → ok', () => {
    expect(
      validateEventScoreRankingRelayPayload({
        frameUrl: frame,
        rows: goodRows,
        destinationLiveId: 'lv888888888'
      }).ok
    ).toBe(true);
  });

  it('content_id と destination が違うと拒否', () => {
    expect(
      validateEventScoreRankingRelayPayload({
        frameUrl: frame,
        rows: goodRows,
        destinationLiveId: 'lv1'
      }).reason
    ).toBe('content-id-mismatch');
  });

  it('11件は拒否（TOP10 のみ）', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      rank: i + 1,
      score: 1,
      name: 'x',
      isAnonymous: false,
      thumbnailUrl: ''
    }));
    expect(
      validateEventScoreRankingRelayPayload({
        frameUrl: frame,
        rows: many,
        destinationLiveId: 'lv888888888'
      }).reason
    ).toBe('bad-rows');
  });

  it('rank が数値でない行は拒否', () => {
    expect(
      validateEventScoreRankingRelayPayload({
        frameUrl: frame,
        rows: [{ rank: '1', score: 1, name: 'z' }],
        destinationLiveId: 'lv888888888'
      }).reason
    ).toBe('bad-rows');
  });
});
