import { describe, expect, it } from 'vitest';
import { analyzeGiftMomentum } from './giftMomentumAnalytics.js';

const BASE = 1_700_000_000_000;

/** @param {Partial<import('./commentRecord.js').StoredComment>} row */
function comment(row) {
  return {
    id: row.id || `c-${Math.random()}`,
    liveId: 'lv123',
    commentNo: row.commentNo || '1',
    text: row.text || 'hello',
    userId: row.userId || '',
    nickname: row.nickname || '',
    avatarUrl: '',
    capturedAt: row.capturedAt || BASE,
    vpos: 0,
    is184: false,
    selfPosted: false
  };
}

describe('analyzeGiftMomentum', () => {
  it('送り主別にギフトpt・投げ回数・コメント数を集計してタイプを付ける', () => {
    const comments = [
      comment({ userId: 'u1', nickname: '話す人', capturedAt: BASE + 1_000, text: 'わこつ' }),
      comment({ userId: 'u1', nickname: '話す人', capturedAt: BASE + 2_000, text: 'いいね' }),
      comment({ userId: 'u1', nickname: '話す人', capturedAt: BASE + 3_000, text: '8888' }),
      comment({ userId: 'u1', nickname: '話す人', capturedAt: BASE + 4_000, text: '草' }),
      comment({ userId: 'u1', nickname: '話す人', capturedAt: BASE + 5_000, text: '最高' }),
      comment({ userId: 'u2', nickname: '静かな人', capturedAt: BASE + 6_000, text: '初見' })
    ];
    const result = analyzeGiftMomentum({
      comments,
      giftEvents: [
        { userId: 'u1', nickname: '話す人', itemId: 'g1', itemName: '花束', point: 300, message: '', contributionRank: null, capturedAt: BASE + 60_000 },
        { userId: 'u2', nickname: '静かな人', itemId: 'g2', itemName: '城', point: 2000, message: '', contributionRank: null, capturedAt: BASE + 120_000 }
      ]
    });

    expect(result.hasSignals).toBe(true);
    expect(result.totals.senderCount).toBe(2);
    expect(result.totals.totalPoints).toBe(2300);
    expect(result.senderRows[0]).toMatchObject({
      label: '静かな人',
      totalPoints: 2000,
      commentCount: 1,
      typeLabel: '大きめギフト型'
    });
    expect(result.senderRows[1]).toMatchObject({
      label: '話す人',
      commentCount: 5,
      typeLabel: '会話もギフトも厚い人'
    });
  });

  it('ギフト前後3分のコメント差分からタイミングの山を作る', () => {
    const comments = [
      comment({ userId: 'u10', capturedAt: BASE + 60_000, text: '準備' }),
      comment({ userId: 'u11', capturedAt: BASE + 61_000, text: 'わくわく' }),
      comment({ userId: 'u12', capturedAt: BASE + 62_000, text: 'ナイス' }),
      comment({ userId: 'u13', capturedAt: BASE + 210_000, text: 'ありがとう 8888' }),
      comment({ userId: 'u14', capturedAt: BASE + 211_000, text: 'ありがとう 最高' }),
      comment({ userId: 'u15', capturedAt: BASE + 212_000, text: 'ありがとう' }),
      comment({ userId: 'u16', capturedAt: BASE + 213_000, text: 'おめでとう' }),
      comment({ userId: 'u17', capturedAt: BASE + 214_000, text: '8888' }),
      comment({ userId: 'u18', capturedAt: BASE + 215_000, text: 'ないす' })
    ];
    const result = analyzeGiftMomentum({
      comments,
      giftEvents: [
        { userId: 'u1', nickname: 'ギフター', itemId: 'g1', itemName: '花束', point: 500, message: '', contributionRank: 2, capturedAt: BASE + 180_000 }
      ]
    });

    expect(result.timingWindows).toHaveLength(1);
    expect(result.timingWindows[0]).toMatchObject({
      minute: 2,
      giftCount: 1,
      totalPoints: 500,
      beforeCommentCount: 3,
      afterCommentCount: 6,
      flowLabel: 'ギフト後に反応が伸びた',
      source: 'exact'
    });
    expect(result.timingWindows[0].topWords).toContain('ありがとう');
    expect(result.insightLines.join('\n')).toContain('開始から約2分');
  });

  it('保存履歴と公式履歴が同時に来ても送り主ptを二重計上しない', () => {
    const result = analyzeGiftMomentum({
      comments: [],
      giftHistoryThrows: [
        { userId: '__anon_くろ', nickname: 'くろ', totalPoints: 1500, throwCount: 3, capturedAt: BASE }
      ],
      officialGiftHistory: [
        { advertiserName: 'くろ', point: 1000, isAnonymous: false },
        { advertiserName: 'くろ', point: 500, isAnonymous: false }
      ],
      giftContributionRanking: [
        { rank: 1, name: 'くろ', contribution: 1500, isAnonymous: false }
      ]
    });

    expect(result.totals.totalPoints).toBe(1500);
    expect(result.senderRows[0]).toMatchObject({
      label: 'くろ',
      totalPoints: 1500,
      throwCount: 3,
      rank: 1,
      typeLabel: 'ランキング上位の応援者'
    });
  });

  it('giftUsers だけのときは近似時刻としてタイミングを出す', () => {
    const result = analyzeGiftMomentum({
      comments: [
        comment({ capturedAt: BASE, text: '開始' }),
        comment({ capturedAt: BASE + 60_000, text: 'ナイス' })
      ],
      giftUsers: [
        { userId: 'u1', nickname: '検知ユーザー', throwCount: 2, capturedAt: BASE + 120_000 }
      ]
    });

    expect(result.hasSignals).toBe(true);
    expect(result.totals.exactEventCount).toBe(0);
    expect(result.totals.approxEventCount).toBe(1);
    expect(result.timingWindows[0]).toMatchObject({
      source: 'approx',
      giftCount: 1
    });
    expect(result.dataNotes.join('\n')).toContain('giftUsers の時刻');
  });
});
