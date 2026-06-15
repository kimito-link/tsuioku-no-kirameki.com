import { describe, expect, it } from 'vitest';
import {
  computeVoiceCongestion,
  computeVoiceQueueSpeedBoost,
  isVoicePrefetchUsable,
  mergeRepeatedVoiceItem,
  pushVoiceQueue
} from './voiceReadQueue.js';

describe('pushVoiceQueue', () => {
  it('空キューへ1件追加する', () => {
    expect(pushVoiceQueue([], 'a')).toEqual({ queue: ['a'], dropped: [] });
  });

  it('既存順を保って末尾へ追加する', () => {
    expect(pushVoiceQueue(['a', 'b'], 'c')).toEqual({
      queue: ['a', 'b', 'c'],
      dropped: []
    });
  });

  it('既定上限5件を超えたら最古を落とす', () => {
    expect(pushVoiceQueue(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual({
      queue: ['b', 'c', 'd', 'e', 'f'],
      dropped: ['a']
    });
  });

  it('複数件超過時も古い順で dropped に返す', () => {
    expect(pushVoiceQueue(['a', 'b', 'c', 'd'], 'e', { max: 2 })).toEqual({
      queue: ['d', 'e'],
      dropped: ['a', 'b', 'c']
    });
  });

  it('入力キューを変更しない', () => {
    const source = ['a', 'b'];
    pushVoiceQueue(source, 'c');
    expect(source).toEqual(['a', 'b']);
  });

  it('max=0 は追加項目を含め全件 dropped にする', () => {
    expect(pushVoiceQueue(['a'], 'b', { max: 0 })).toEqual({
      queue: [],
      dropped: ['a', 'b']
    });
  });

  it('配列でない入力は空キューとして扱う', () => {
    expect(pushVoiceQueue(null, 'a')).toEqual({ queue: ['a'], dropped: [] });
  });

  it('上限12件では13件目の追加時に最古を落とす', () => {
    const source = Array.from({ length: 12 }, (_, index) => index + 1);
    expect(pushVoiceQueue(source, 13, { max: 12 })).toEqual({
      queue: Array.from({ length: 12 }, (_, index) => index + 2),
      dropped: [1]
    });
  });
});

describe('mergeRepeatedVoiceItem', () => {
  it('同文をキュー内の任意位置で集約して件数を増やす', () => {
    const source = [
      { userKey: 'a', body: '先頭', count: 1 },
      { userKey: 'b', body: '8888', count: 2 },
      { userKey: 'c', body: '末尾', count: 1 }
    ];
    expect(
      mergeRepeatedVoiceItem(source, {
        userKey: 'd',
        body: '8888',
        count: 1
      })
    ).toEqual({
      queue: [
        { userKey: 'a', body: '先頭', count: 1 },
        { userKey: 'b', body: '8888', count: 3 },
        { userKey: 'c', body: '末尾', count: 1 }
      ],
      merged: true
    });
  });

  it('異なる本文は集約しない', () => {
    const source = [{ userKey: 'a', body: '8888', count: 1 }];
    expect(
      mergeRepeatedVoiceItem(source, {
        userKey: 'a',
        body: 'こんにちは',
        count: 1
      })
    ).toEqual({ queue: source, merged: false });
  });

  it('利用者キーが違っても同文なら集約する', () => {
    const result = mergeRepeatedVoiceItem(
      [{ userKey: 'listener-a', body: '8888', count: 1 }],
      { userKey: 'listener-b', body: '8888', count: 1 }
    );
    expect(result.merged).toBe(true);
    expect(result.queue[0]).toEqual({
      userKey: 'listener-a',
      body: '8888',
      count: 2
    });
  });

  it('集約した項目は元項目と異なる新しいオブジェクトになる', () => {
    const existing = { userKey: 'a', body: '8888', count: 1 };
    const result = mergeRepeatedVoiceItem(
      [existing],
      { userKey: 'b', body: '8888', count: 1 }
    );
    expect(result.queue[0]).not.toBe(existing);
  });

  it('空キューでは集約しない', () => {
    expect(
      mergeRepeatedVoiceItem([], { userKey: 'a', body: '8888', count: 1 })
    ).toEqual({ queue: [], merged: false });
  });

  it('既存項目に件数がなければ1件として集約する', () => {
    expect(
      mergeRepeatedVoiceItem(
        [{ userKey: 'a', body: '8888' }],
        { userKey: 'b', body: '8888', count: 1 }
      )
    ).toEqual({
      queue: [{ userKey: 'a', body: '8888', count: 2 }],
      merged: true
    });
  });

  it('入力キューと既存項目を変更しない', () => {
    const existing = { userKey: 'a', body: '8888', count: 1 };
    const source = [existing];
    mergeRepeatedVoiceItem(source, {
      userKey: 'b',
      body: '8888',
      count: 1
    });
    expect(source).toEqual([{ userKey: 'a', body: '8888', count: 1 }]);
    expect(source[0]).toBe(existing);
  });

  it('配列でない入力は空キューとして扱う', () => {
    expect(
      mergeRepeatedVoiceItem(null, {
        userKey: 'a',
        body: '8888',
        count: 1
      })
    ).toEqual({ queue: [], merged: false });
  });
});

describe('isVoicePrefetchUsable', () => {
  it('同じ項目参照かつ同じ世代なら利用できる', () => {
    const item = { body: '本文' };
    expect(
      isVoicePrefetchUsable({ item, generation: 3, promise: null }, item, 3)
    ).toBe(true);
  });

  it('項目が別参照なら利用できない', () => {
    const item = { body: '本文', count: 1 };
    const replaced = { ...item, count: 2 };
    expect(
      isVoicePrefetchUsable(
        { item, generation: 3, promise: null },
        replaced,
        3
      )
    ).toBe(false);
  });

  it('世代が進んだら利用できない', () => {
    const item = { body: '本文' };
    expect(
      isVoicePrefetchUsable({ item, generation: 3, promise: null }, item, 4)
    ).toBe(false);
  });

  it('プリフェッチがnullなら利用できない', () => {
    expect(isVoicePrefetchUsable(null, { body: '本文' }, 1)).toBe(false);
  });
});

describe('computeVoiceCongestion (v0.1.755 リアルタイム化=早く強くブースト)', () => {
  it('境界件数ごとに速度と本文上限を返す(2件から効く・最大0.8)', () => {
    expect(computeVoiceCongestion(1)).toEqual({ speedBoost: 0, maxChars: 60 });
    // v0.1.755: 2件から速度ブースト開始(旧は3件から)=溜まる前に消化を速める。
    expect(computeVoiceCongestion(2)).toEqual({ speedBoost: 0.15, maxChars: 60 });
    expect(computeVoiceCongestion(3)).toEqual({ speedBoost: 0.3, maxChars: 50 });
    expect(computeVoiceCongestion(4)).toEqual({ speedBoost: 0.3, maxChars: 50 });
    expect(computeVoiceCongestion(5)).toEqual({ speedBoost: 0.5, maxChars: 40 });
    expect(computeVoiceCongestion(7)).toEqual({ speedBoost: 0.5, maxChars: 40 });
    // v0.1.755: 8件以上は最大ブースト 0.8・本文30字に詰めて一気に消化。
    expect(computeVoiceCongestion(8)).toEqual({ speedBoost: 0.8, maxChars: 30 });
  });

  it('詰まるほど本文上限が短くなる(消化を速める)', () => {
    expect(computeVoiceCongestion(1).maxChars).toBe(60);
    expect(computeVoiceCongestion(3).maxChars).toBe(50);
    expect(computeVoiceCongestion(5).maxChars).toBe(40);
    expect(computeVoiceCongestion(8).maxChars).toBe(30);
  });

  it('ブーストは単調増加(詰まるほど速く=遅延を溜めない)', () => {
    const lens = [0, 1, 2, 3, 5, 8, 20];
    for (let i = 1; i < lens.length; i++) {
      expect(computeVoiceCongestion(lens[i]).speedBoost)
        .toBeGreaterThanOrEqual(computeVoiceCongestion(lens[i - 1]).speedBoost);
    }
  });

  it('負数や不正値は0件として扱う', () => {
    expect(computeVoiceCongestion(-1)).toEqual({ speedBoost: 0, maxChars: 60 });
    expect(computeVoiceCongestion('invalid')).toEqual({ speedBoost: 0, maxChars: 60 });
    expect(computeVoiceCongestion(Infinity)).toEqual({ speedBoost: 0, maxChars: 60 });
  });
});

describe('computeVoiceQueueSpeedBoost', () => {
  it('0件は加速しない', () => {
    expect(computeVoiceQueueSpeedBoost(0)).toBe(0);
  });

  it('v0.1.755: 1件までは加速しない', () => {
    expect(computeVoiceQueueSpeedBoost(1)).toBe(0);
  });

  it('v0.1.755: 2件から加速開始(+0.15)=溜まる前に消化を速める', () => {
    expect(computeVoiceQueueSpeedBoost(2)).toBe(0.15);
  });

  it('v0.1.755: 3〜4件は+0.3', () => {
    expect(computeVoiceQueueSpeedBoost(3)).toBe(0.3);
    expect(computeVoiceQueueSpeedBoost(4)).toBe(0.3);
  });

  it('v0.1.755: 5〜7件は+0.5', () => {
    expect(computeVoiceQueueSpeedBoost(5)).toBe(0.5);
    expect(computeVoiceQueueSpeedBoost(7)).toBe(0.5);
  });

  it('v0.1.755: 8件以上は最大+0.8(一気に消化)', () => {
    expect(computeVoiceQueueSpeedBoost(8)).toBe(0.8);
    expect(computeVoiceQueueSpeedBoost(20)).toBe(0.8);
  });

  it('負数や不正値は0件として扱う', () => {
    expect(computeVoiceQueueSpeedBoost(-10)).toBe(0);
    expect(computeVoiceQueueSpeedBoost('invalid')).toBe(0);
    expect(computeVoiceQueueSpeedBoost(Infinity)).toBe(0);
  });
});
