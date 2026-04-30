import { describe, it, expect } from 'vitest';
import {
  classifyCommentersAgainstHistory,
  findDepartedHeavyCommenters,
  buildCommenterAttendanceMatrix
} from './commenterHistoricalAnalytics.js';

function bcast(liveId, users) {
  return {
    liveId,
    comments: users.flatMap((u) =>
      Array.from({ length: u.count || 1 }, () => ({
        userId: u.userId,
        nickname: u.nickname
      }))
    )
  };
}

describe('classifyCommentersAgainstHistory', () => {
  it('過去配信なし → 全員 new', () => {
    const r = classifyCommentersAgainstHistory({
      currentLiveId: 'lv1',
      currentComments: [{ userId: '1' }, { userId: '2' }],
      pastBroadcasts: []
    });
    expect(r.newCount).toBe(2);
    expect(r.repeatCount).toBe(0);
    expect(r.heavyCount).toBe(0);
    expect(r.totalCurrent).toBe(2);
  });

  it('過去配信に居たユーザは repeat', () => {
    const r = classifyCommentersAgainstHistory({
      currentLiveId: 'lv2',
      currentComments: [{ userId: '1' }, { userId: '2' }, { userId: '3' }],
      pastBroadcasts: [
        bcast('lv1', [{ userId: '1', count: 1 }, { userId: '2', count: 1 }])
      ]
    });
    expect(r.newCount).toBe(1);   // userId 3
    expect(r.repeatCount).toBe(2); // 1, 2
  });

  it('heavy = 過去 N 放送で 5+ コメ・かつ現在の配信にも参加', () => {
    const r = classifyCommentersAgainstHistory({
      currentLiveId: 'lv3',
      currentComments: [{ userId: '1' }, { userId: '2' }],
      pastBroadcasts: [
        bcast('lv1', [{ userId: '1', count: 6 }]),       // userId=1 は heavy
        bcast('lv2', [{ userId: '2', count: 3 }])        // userId=2 は repeat だが not heavy
      ],
      heavyThreshold: 5
    });
    expect(r.newCount).toBe(0);
    expect(r.repeatCount).toBe(2);
    expect(r.heavyCount).toBe(1);  // userId=1 のみ
  });

  it('現在の配信を pastBroadcasts に含めても無視（currentLiveId 一致は除外）', () => {
    const r = classifyCommentersAgainstHistory({
      currentLiveId: 'lv1',
      currentComments: [{ userId: '1' }],
      pastBroadcasts: [
        bcast('lv1', [{ userId: '1', count: 100 }])  // 同じ liveId は無視
      ]
    });
    expect(r.newCount).toBe(1);
    expect(r.heavyCount).toBe(0);
  });

  it('userId 空・null は無視', () => {
    const r = classifyCommentersAgainstHistory({
      currentLiveId: 'lv1',
      currentComments: [{ userId: '' }, { userId: null }, { userId: '1' }],
      pastBroadcasts: []
    });
    expect(r.totalCurrent).toBe(1);
    expect(r.newCount).toBe(1);
  });

  it('比率は 0-1 の範囲', () => {
    const r = classifyCommentersAgainstHistory({
      currentLiveId: 'lv2',
      currentComments: [{ userId: '1' }, { userId: '2' }, { userId: '3' }, { userId: '4' }],
      pastBroadcasts: [bcast('lv1', [{ userId: '1', count: 1 }])]
    });
    expect(r.newRatio).toBeCloseTo(0.75, 2);
    expect(r.repeatRatio).toBeCloseTo(0.25, 2);
  });

  it('null/undefined 引数 → 0 件', () => {
    const r = classifyCommentersAgainstHistory(null);
    expect(r.totalCurrent).toBe(0);
    expect(r.newCount).toBe(0);
  });
});

describe('findDepartedHeavyCommenters', () => {
  it('過去 5+ コメだが現在不参加 → 離反者', () => {
    const r = findDepartedHeavyCommenters({
      currentComments: [{ userId: 'A' }],
      pastBroadcasts: [
        bcast('lv1', [{ userId: 'A', count: 3 }, { userId: 'B', count: 8 }]),
        bcast('lv2', [{ userId: 'C', count: 6 }])
      ],
      heavyThreshold: 5,
      topN: 10
    });
    // B (8 コメ) と C (6 コメ) が離反
    expect(r.length).toBe(2);
    expect(r[0].userId).toBe('B');
    expect(r[0].totalComments).toBe(8);
    expect(r[1].userId).toBe('C');
  });

  it('topN で件数を絞る', () => {
    const r = findDepartedHeavyCommenters({
      currentComments: [],
      pastBroadcasts: [
        bcast('lv1', [
          { userId: 'A', count: 10 },
          { userId: 'B', count: 9 },
          { userId: 'C', count: 8 }
        ])
      ],
      heavyThreshold: 5,
      topN: 2
    });
    expect(r.length).toBe(2);
    expect(r[0].userId).toBe('A');
  });

  it('現在のコメンターは離反者から除外', () => {
    const r = findDepartedHeavyCommenters({
      currentComments: [{ userId: 'A' }],
      pastBroadcasts: [
        bcast('lv1', [{ userId: 'A', count: 20 }, { userId: 'B', count: 6 }])
      ],
      heavyThreshold: 5,
      topN: 5
    });
    // A は現在参加しているので除外、B のみ
    expect(r.length).toBe(1);
    expect(r[0].userId).toBe('B');
  });

  it('参加放送数も併記される', () => {
    const r = findDepartedHeavyCommenters({
      currentComments: [],
      pastBroadcasts: [
        bcast('lv1', [{ userId: 'X', count: 3 }]),
        bcast('lv2', [{ userId: 'X', count: 4 }])
      ],
      heavyThreshold: 5,
      topN: 5
    });
    expect(r.length).toBe(1);
    expect(r[0].broadcastCount).toBe(2);
    expect(r[0].totalComments).toBe(7);
  });

  it('0.1.34: nickname も返す（最も詳しいハンドルを採用）', () => {
    const r = findDepartedHeavyCommenters({
      currentComments: [],
      pastBroadcasts: [
        bcast('lv1', [{ userId: 'X', count: 3, nickname: 'もび' }]),
        bcast('lv2', [{ userId: 'X', count: 4, nickname: 'もびー' }])
      ],
      heavyThreshold: 5,
      topN: 5
    });
    expect(r[0].nickname).toBe('もびー');
  });

  it('0.1.34: nickname 無いコメから取れた場合は空文字', () => {
    const r = findDepartedHeavyCommenters({
      currentComments: [],
      pastBroadcasts: [bcast('lv1', [{ userId: 'X', count: 6 }])],
      heavyThreshold: 5,
      topN: 5
    });
    expect(r[0].nickname).toBe('');
  });

  it('null/empty 入力 → 空配列', () => {
    expect(findDepartedHeavyCommenters({})).toEqual([]);
    expect(findDepartedHeavyCommenters(null)).toEqual([]);
  });
});

describe('buildCommenterAttendanceMatrix', () => {
  it('TOP K ユーザー × 各放送の出席を 0/1 行列で返す', () => {
    const r = buildCommenterAttendanceMatrix({
      broadcasts: [
        bcast('lv1', [{ userId: 'A', count: 5 }, { userId: 'B', count: 3 }]),
        bcast('lv2', [{ userId: 'A', count: 2 }]),
        bcast('lv3', [{ userId: 'B', count: 4 }, { userId: 'C', count: 1 }])
      ],
      topN: 3
    });
    expect(r.users.length).toBe(3);
    expect(r.broadcasts.map((b) => b.liveId)).toEqual(['lv1', 'lv2', 'lv3']);
    // A: 7 コメ (lv1=5, lv2=2)
    // B: 7 コメ (lv1=3, lv3=4)
    // C: 1 コメ (lv3=1)
    const a = r.users.find((u) => u.userId === 'A');
    expect(a.attendance).toEqual([1, 1, 0]);
    expect(a.totalComments).toBe(7);
    const c = r.users.find((u) => u.userId === 'C');
    expect(c.attendance).toEqual([0, 0, 1]);
    expect(c.totalComments).toBe(1);
  });

  it('topN で件数を絞る（コメ件数の多い順）', () => {
    const r = buildCommenterAttendanceMatrix({
      broadcasts: [
        bcast('lv1', [
          { userId: 'A', count: 100 },
          { userId: 'B', count: 50 },
          { userId: 'C', count: 10 }
        ])
      ],
      topN: 2
    });
    expect(r.users.length).toBe(2);
    expect(r.users[0].userId).toBe('A');
    expect(r.users[1].userId).toBe('B');
  });

  it('入力無し → 空 matrix', () => {
    const r = buildCommenterAttendanceMatrix({ broadcasts: [], topN: 5 });
    expect(r.users).toEqual([]);
    expect(r.broadcasts).toEqual([]);
  });

  it('null 入力 → 空 matrix', () => {
    const r = buildCommenterAttendanceMatrix(null);
    expect(r.users).toEqual([]);
    expect(r.broadcasts).toEqual([]);
  });

  it('数値 ID 以外も対象（"a:..." も含む）', () => {
    const r = buildCommenterAttendanceMatrix({
      broadcasts: [
        bcast('lv1', [{ userId: 'a:abc', count: 3 }]),
        bcast('lv2', [{ userId: 'a:abc', count: 2 }])
      ],
      topN: 5
    });
    expect(r.users.length).toBe(1);
    expect(r.users[0].userId).toBe('a:abc');
  });

  it('0.1.34: 各 user に nickname も返る（複数候補なら最も詳しいもの）', () => {
    const r = buildCommenterAttendanceMatrix({
      broadcasts: [
        bcast('lv1', [{ userId: 'A', count: 3, nickname: 'たろ' }]),
        bcast('lv2', [{ userId: 'A', count: 2, nickname: 'たろう' }])
      ],
      topN: 5
    });
    expect(r.users[0].nickname).toBe('たろう');
  });
});
