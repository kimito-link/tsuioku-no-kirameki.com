import { describe, it, expect } from 'vitest';
import { pickSwitchLeakPks } from './ytSwitchLeakCleanup.js';

describe('pickSwitchLeakPks', () => {
  const prev = [{ channelId: 'UCmiku1', name: '@worfly140' }, { channelId: 'UCboth', name: '@both' }];
  it('最初の数秒に入った、前の配信の人で、そのあと来ていない人だけを選ぶ', () => {
    const target = [
      { pk: 'v::1', channelId: 'UCmiku1', recordedAt: 1000 },
      { pk: 'v::2', channelId: 'UCmiku1', recordedAt: 1500 },
      { pk: 'v::3', channelId: 'UCboth', recordedAt: 1200 },
      { pk: 'v::4', channelId: 'UCboth', recordedAt: 90000 },
      { pk: 'v::5', channelId: 'UCdaigo', recordedAt: 1100 },
      { pk: 'v::6', channelId: 'UCmiku1', recordedAt: 1000 + 60000, }, // 後にも来ている→残す? (下で別に確認)
    ];
    // UCmiku1 は後にも来ているので消さない
    expect(pickSwitchLeakPks(target, prev)).toEqual([]);
    expect(pickSwitchLeakPks(target.slice(0, 5), prev)).toEqual(['v::1', 'v::2']);
  });
  it('どちらかが空なら何も選ばない', () => {
    expect(pickSwitchLeakPks([], prev)).toEqual([]);
    expect(pickSwitchLeakPks([{ pk: 'a', channelId: 'UCmiku1', recordedAt: 1 }], [])).toEqual([]);
  });
});
