import { describe, it, expect } from 'vitest';
import {
  SUPPORTER_CONTRIBUTION_DEFAULT_WEIGHTS,
  scoreSupporterContributions
} from './supporterContributionScore.js';

const BASE = 1_700_000_000_000;
const MIN = 60 * 1000;

function c(userId, nickname, minute, text = '応援') {
  return {
    liveId: 'lv1',
    userId,
    nickname,
    text,
    commentNo: `${userId}-${minute}`,
    capturedAt: BASE + minute * MIN
  };
}

function g(userId, nickname, minute, totalPoints, throwCount = 1) {
  return {
    userId,
    nickname,
    totalPoints,
    throwCount,
    capturedAt: BASE + minute * MIN
  };
}

describe('scoreSupporterContributions', () => {
  it('空入力や壊れた入力では空配列を返す', () => {
    expect(scoreSupporterContributions([], [])).toEqual([]);
    expect(scoreSupporterContributions(null, null)).toEqual([]);
    expect(
      scoreSupporterContributions(
        [{ userId: 'u1', text: '', capturedAt: BASE }, null, 'x'],
        [{ senderName: '', points: 100 }]
      )
    ).toEqual([]);
  });

  it('コメント継続・ギフトpt・ギフト回数を合算し score 降順で rank を付ける', () => {
    const comments = [
      c('alice', 'アリス', 0),
      c('alice', 'アリス', 20),
      c('alice', 'アリス', 40),
      c('alice', 'アリス', 60),
      c('bob', 'ボブ', 10),
      c('carol', 'キャロル', 30)
    ];
    const gifts = [
      g('bob', 'ボブ', 12, 3000, 2),
      g('alice', 'アリス', 45, 200, 1)
    ];

    const rows = scoreSupporterContributions(comments, gifts);

    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0].userKey).toBe('bob');
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
    expect(rows[0].breakdown.giftPointTotal).toBe(3000);
    expect(rows[0].breakdown.giftCount).toBe(2);
    expect(rows[0].highlights).toContain('高額ギフトで大きく支えました（合計3000pt）');
    expect(rows[1].breakdown.commentCount).toBe(4);
  });

  it('初回から終盤までいる応援者に継続ハイライトを付ける', () => {
    const comments = [
      c('runner', '伴走さん', 0),
      c('runner', '伴走さん', 15),
      c('runner', '伴走さん', 30),
      c('runner', '伴走さん', 45),
      c('runner', '伴走さん', 60),
      c('other', '途中さん', 30)
    ];

    const [top] = scoreSupporterContributions(comments, []);

    expect(top.userKey).toBe('runner');
    expect(top.breakdown.continuityRatio).toBe(1);
    expect(top.highlights).toContain('初コメから最後まで近く、長く伴走していました');
  });

  it('過疎時間帯を支えたコメントをハイライトする', () => {
    const busy = Array.from({ length: 12 }, (_, i) =>
      c(`busy-${i}`, `にぎやか${i}`, 10, `わいわい${i}`)
    );
    const quietSupport = [
      c('quiet', '支え手', 20, 'ここ好き'),
      c('quiet', '支え手', 25, '見てるよ')
    ];

    const rows = scoreSupporterContributions([...busy, ...quietSupport], []);
    const quiet = rows.find((r) => r.userKey === 'quiet');

    expect(quiet?.breakdown.quietEventCount).toBe(2);
    expect(quiet?.highlights).toContain(
      '過疎時間帯に2回応援して、場を支えました'
    );
  });

  it('匿名ユーザーも named と同じ重みで採点し、たぬ姉レーン視点の理由を付ける', () => {
    const comments = [
      c('named', '名前あり', 0),
      c('named', '名前あり', 10),
      c('a:anon-1', '', 0),
      c('a:anon-1', '', 10)
    ];

    const rows = scoreSupporterContributions(comments, []);
    const named = rows.find((r) => r.userKey === 'named');
    const anon = rows.find((r) => r.userKey === 'a:anon-1');

    expect(named?.score).toBe(anon?.score);
    expect(anon?.displayName).toBe('匿名応援者');
    expect(anon?.breakdown.isAnonymous).toBe(true);
    expect(anon?.highlights).toContain(
      '匿名の応援も、たぬ姉レーンの視点で見逃さず拾います'
    );
  });

  it('nls_gift_history_throws 系の匿名 sender も userKey/displayName を保って集計する', () => {
    const rows = scoreSupporterContributions([], [
      {
        userId: '__anon_ぱぴよん',
        nickname: 'ぱぴよん',
        throwCount: 3,
        totalPoints: 1200,
        capturedAt: BASE + 3 * MIN
      }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userKey: '__anon_ぱぴよん',
      displayName: 'ぱぴよん',
      rank: 1
    });
    expect(rows[0].breakdown.giftCount).toBe(3);
    expect(rows[0].breakdown.giftPointTotal).toBe(1200);
    expect(rows[0].highlights).toContain('高額ギフトで大きく支えました（合計1200pt）');
  });

  it('個別ギフト履歴 senderName/points 形も storage 直前の値として扱える', () => {
    const rows = scoreSupporterContributions({
      comments: [],
      giftThrows: [
        { senderName: '名無し', points: 100, itemName: 'A', capturedAt: BASE },
        { senderName: '名無し', points: 200, itemName: 'B', capturedAt: BASE + MIN }
      ]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].userKey).toBe('__anon_名無し');
    expect(rows[0].displayName).toBe('名無し');
    expect(rows[0].breakdown.giftCount).toBe(2);
    expect(rows[0].breakdown.giftPointTotal).toBe(300);
  });

  it('weights を差し替えて呼び出し側で調整できる', () => {
    const rows = scoreSupporterContributions(
      [c('commenter', 'コメント勢', 0), c('commenter', 'コメント勢', 1)],
      [g('gifter', 'ギフト勢', 0, 5000, 1)],
      {
        weights: {
          ...SUPPORTER_CONTRIBUTION_DEFAULT_WEIGHTS,
          giftPoint: 0,
          giftCount: 0,
          commentCount: 100
        }
      }
    );

    expect(rows[0].userKey).toBe('commenter');
  });
});
