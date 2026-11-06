import { describe, it, expect } from 'vitest';
import { classifyYtUserLaneTier, buildYtUserLaneTiers } from './ytUserLaneTiers.js';

const UC = (n) => `UC${String(n).padStart(22, 'a')}`;
const icon = 'https://yt3.ggpht.com/x=s64';

describe('classifyYtUserLaneTier', () => {
  it('スパチャ・ステッカーはギフト段', () => {
    expect(classifyYtUserLaneTier({ channelId: UC(1), superchatCount: 1 })).toBe('gift');
    expect(classifyYtUserLaneTier({ channelId: UC(1), stickerCount: 2 })).toBe('gift');
  });
  it('メンバー関係は広告段の代わりのメンバー段', () => {
    expect(classifyYtUserLaneTier({ channelId: UC(1), isMember: true })).toBe('member');
    expect(classifyYtUserLaneTier({ channelId: UC(1), giftCount: 1 })).toBe('member');
  });
  it('ID・名前・サムネがそろえばりんく段、片方ならこん太段、薄ければたぬ姉段', () => {
    expect(classifyYtUserLaneTier({ channelId: UC(1), name: 'A', iconUrl: icon })).toBe('link');
    expect(classifyYtUserLaneTier({ channelId: UC(1), name: 'A', iconUrl: '' })).toBe('konta');
    expect(classifyYtUserLaneTier({ channelId: UC(1), name: UC(1), iconUrl: icon })).toBe('konta');
    expect(classifyYtUserLaneTier({ channelId: '', name: 'A', iconUrl: icon })).toBe('tanu');
    expect(classifyYtUserLaneTier(null)).toBe('tanu');
  });
});

describe('buildYtUserLaneTiers', () => {
  it('1人1段・直近順・上限で切って総数は正直に数える', () => {
    const list = [
      { channelId: UC(1), name: 'A', iconUrl: icon, lastTs: 1 },
      { channelId: UC(2), name: 'B', iconUrl: icon, lastTs: 3 },
      { channelId: UC(3), name: 'C', iconUrl: icon, lastTs: 2 },
      { channelId: UC(2), name: 'B-dup', iconUrl: icon, lastTs: 9 },
      { channelId: UC(4), superchatCount: 1, superchatTotalAmount: 500, lastTs: 1 },
      { channelId: UC(5), superchatCount: 1, superchatTotalAmount: 1000, lastTs: 1 },
    ];
    const r = buildYtUserLaneTiers(list, { limitPerTier: 2 });
    expect(r.tiers.link.map((u) => u.name)).toEqual(['B', 'C']);
    expect(r.totals.link).toBe(3);
    expect(r.tiers.gift.map((u) => u.channelId)).toEqual([UC(5), UC(4)]);
    expect(r.total).toBe(5);
    expect(r.displayed).toBe(4);
  });
  it('空や壊れた入力でも落ちない', () => {
    const r = buildYtUserLaneTiers(/** @type {any} */ (null));
    expect(r.total).toBe(0);
    expect(r.tiers.tanu).toEqual([]);
  });
});
