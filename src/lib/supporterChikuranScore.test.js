import { describe, it, expect } from 'vitest';
import {
  buildSupporterChikuranRows,
  SUPPORTER_CHIKURAN_ANONYMOUS_KEY
} from './supporterChikuranScore.js';

const NOW = Date.parse('2026-05-29T12:00:00.000Z');
const minute = 60 * 1000;

describe('buildSupporterChikuranRows', () => {
  it('コメント・ギフト・広告を userId 単位で合算し、配信者を除外できる', () => {
    const out = buildSupporterChikuranRows(
      {
        liveId: 'lv1',
        comments: [
          { liveId: 'lv1', userId: '111', nickname: '応援A', capturedAt: NOW - minute },
          { liveId: 'lv1', userId: '111', nickname: '応援A', capturedAt: NOW - 2 * minute },
          { liveId: 'lv1', userId: '999', nickname: '配信者', capturedAt: NOW - minute }
        ],
        giftUsers: [
          { userId: '111', nickname: '応援A', throwCount: 2, capturedAt: NOW - minute }
        ],
        giftEvents: [
          { userId: '111', nickname: '応援A', point: 150, capturedAt: NOW - minute }
        ],
        adContributionRanking: [
          {
            advertiserName: '応援A',
            totalContribution: 500,
            userPageUrl: 'https://www.nicovideo.jp/user/111'
          }
        ]
      },
      { nowMs: NOW, excludeUserIds: ['999'] }
    );

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      supporterKey: 'u:111',
      displayName: '応援A',
      userId: '111',
      commentCount: 2,
      recent5mCommentCount: 2,
      giftThrowCount: 2,
      giftPointTotal: 150,
      adPointTotal: 500
    });
    expect(out.rows[0].sources).toEqual([
      'ad-contribution',
      'comment',
      'gift-events',
      'gift-users'
    ]);
  });

  it('184/名無し/匿名系は個別化せず匿名応援バケットに畳む', () => {
    const out = buildSupporterChikuranRows(
      {
        comments: [
          { liveId: 'lv1', userId: 'a:abc', nickname: '匿名ユーザー', capturedAt: NOW - minute },
          { liveId: 'lv1', userId: '', nickname: '名無し', is184: true, capturedAt: NOW - 2 * minute }
        ],
        giftUsers: [
          { userId: '__anon_名無し', nickname: '名無し', throwCount: 1, capturedAt: NOW - minute }
        ],
        adContributionRanking: [
          { advertiserName: '名無し', totalContribution: 100, isAnonymous: true }
        ]
      },
      { liveId: 'lv1', nowMs: NOW }
    );

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      supporterKey: SUPPORTER_CHIKURAN_ANONYMOUS_KEY,
      identityKind: 'anonymous',
      displayName: '匿名応援',
      userId: '',
      isAnonymousAggregate: true,
      commentCount: 2,
      giftThrowCount: 1,
      adPointTotal: 100
    });
    expect(out.totals.anonymousIncluded).toBe(true);
  });

  it('公式ギフト貢献度と観測ギフトptは二重加算せず大きい方を使う', () => {
    const out = buildSupporterChikuranRows(
      {
        giftEvents: [
          { userId: '222', nickname: 'B', point: 100, capturedAt: NOW - minute },
          { userId: '222', nickname: 'B', point: 200, capturedAt: NOW - 2 * minute }
        ],
        giftContributionRanking: [
          {
            supporterName: 'B',
            contribution: 1000,
            userPageUrl: 'https://www.nicovideo.jp/user/222'
          }
        ]
      },
      { nowMs: NOW }
    );

    expect(out.rows[0]).toMatchObject({
      supporterKey: 'u:222',
      giftThrowCount: 2,
      giftPointTotal: 1000
    });
  });

  it('liveId があるコメントは対象配信だけに絞り、直近窓を計算する', () => {
    const out = buildSupporterChikuranRows(
      {
        comments: [
          { liveId: 'lv1', userId: '111', nickname: 'A', capturedAt: NOW - 4 * minute },
          { liveId: 'lv1', userId: '111', nickname: 'A', capturedAt: NOW - 10 * minute },
          { liveId: 'lv1', userId: '111', nickname: 'A', capturedAt: NOW - 40 * minute },
          { liveId: 'lv2', userId: '222', nickname: 'B', capturedAt: NOW - minute }
        ]
      },
      { liveId: 'lv1', nowMs: NOW }
    );

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      supporterKey: 'u:111',
      commentCount: 3,
      recent5mCommentCount: 1,
      recent15mCommentCount: 2,
      activeDayCount: 1
    });
  });
});
