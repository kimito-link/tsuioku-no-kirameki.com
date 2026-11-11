import { describe, expect, it } from 'vitest';
import {
  panelExtraChips,
  platformSectionPlan,
  resolvePlatformId,
  tallySupportItems,
  venueItemsForPlatform,
} from './platformMetrics.js';

const ytSupport = () => tallySupportItems([
  { kind: 'superchat', amount: 1000, currency: 'JPY' },
  { kind: 'superchat', amount: 5, currency: 'USD' },
  { kind: 'sticker', amount: 200, currency: 'JPY' },
  { kind: 'membership' },
  { kind: 'membership_gift', giftCount: 3 },
  { kind: 'membership_gift', giftCount: 0 },
  { kind: 'membership_gift' },
]);

describe('resolvePlatformId', () => {
  it('明示・配信キー・ホストからサービスを決める', () => {
    expect(resolvePlatformId('YouTube')).toBe('youtube');
    expect(resolvePlatformId({ streamKey: 'tw.alice.1' })).toBe('twitch');
    expect(resolvePlatformId({ streamKey: 'kk.room.2' })).toBe('kick');
    expect(resolvePlatformId({ streamKey: 'ab.ch.9' })).toBe('abema');
    expect(resolvePlatformId({ hostname: 'abema.tv' })).toBe('abema');
    expect(resolvePlatformId({ hostname: 'www.youtube.com' })).toBe('youtube');
    expect(resolvePlatformId({ liveId: 'lv123' })).toBe('niconico');
    expect(resolvePlatformId({ platform: 'showroom' })).toBe('showroom');
    expect(resolvePlatformId({})).toBe('niconico');
  });
});

describe('tallySupportItems', () => {
  it('通貨は混ぜず、ギフトの内訳(giftCount 0)は足さない', () => {
    const t = ytSupport();
    expect(t.ready).toBe(true);
    expect(t.amounts.JPY).toBe(1200);
    expect(t.amounts.USD).toBe(5);
    expect(t.superchatCount).toBe(2);
    expect(t.stickerCount).toBe(1);
    expect(t.membershipCount).toBe(1);
    expect(t.membershipGiftCount).toBe(4);
  });

  it('空や壊れた行でも 0 の合計になる', () => {
    const t = tallySupportItems([null, { kind: 'nope' }, 'x']);
    expect(t.superchatCount).toBe(0);
    expect(t.membershipGiftCount).toBe(0);
  });
});

describe('platformSectionPlan', () => {
  it('ニコ生は今までの欄のまま', () => {
    const p = platformSectionPlan('niconico');
    expect(p.native).toBe(true);
    expect(p.visitorCard).toBe(true);
    expect(p.concurrentLabel).toBe('推定同時接続');
    expect(p.hide).toEqual([]);
  });

  it('他のサービスでは広告・来場・ギフト取得を隠す', () => {
    for (const id of ['youtube', 'twitch', 'kick', 'showroom']) {
      const p = platformSectionPlan(id);
      expect(p.visitorCard).toBe(false);
      expect(p.hide).toEqual(expect.arrayContaining(['programPoints', 'eventRank', 'giftRankingFetch']));
    }
    // 広告ランキングの欄は、2つめの公式ランキング(ギフトサブの順位)があるサービスだけ使う(platformSubBoard.js)
    for (const id of ['youtube', 'abema', 'mixch', 'whowatch']) {
      expect(platformSectionPlan(id).hide).toContain('adRanking');
      expect(platformSectionPlan(id).subBoard).toBe(false);
    }
    for (const id of ['twitch', 'kick', 'showroom']) {
      expect(platformSectionPlan(id).hide).not.toContain('adRanking');
      expect(platformSectionPlan(id).subBoard).toBe(true);
      expect(platformSectionPlan(id).sections.adRanking).toEqual({ show: true });
    }
    expect(platformSectionPlan('youtube').concurrentLabel).toBe('同時視聴者数');
    expect(platformSectionPlan('youtube').sections.contributionRanking.label).toBe('スパチャの合計順');
    expect(platformSectionPlan('youtube').sections.giftHistory.label).toBe('スーパーチャット・ギフト');
    expect(platformSectionPlan('twitch').sections.contributionRanking.label).toBe('Bits・ギフトサブの合計順');
    // 公式の順位表を入れているときは見出しも公式の名前(中身と見出しを食い違わせない)
    expect(platformSectionPlan('twitch', { officialBoard: true }).sections.contributionRanking.label).toBe('Twitch 公式の Bits ランキング');
    expect(platformSectionPlan('kick', { officialBoard: true }).sections.contributionRanking.label).toBe('Kick 公式の Kicks ランキング');
    expect(platformSectionPlan('youtube', { officialBoard: true }).sections.contributionRanking.label).toBe('トップファン');
    expect(platformSectionPlan('kick').sections.giftHistory.label).toBe('ギフトサブ');
    expect(platformSectionPlan('kick').sections.contributionRanking.sub).toBeUndefined();
  });

  it('ABEMA は視聴数とコメントだけで、ギフト欄は出さない', () => {
    const p = platformSectionPlan('abema');
    expect(p.concurrentLabel).toBe('視聴数');
    expect(p.hide).toEqual(expect.arrayContaining(['contributionRanking', 'giftHistory', 'adRanking']));
  });
});

describe('venueItemsForPlatform', () => {
  const bag = (over = {}) => ({
    records: { text: '12', isPlaceholder: false },
    concurrent: { text: '~40', isPlaceholder: false },
    streamAge: { text: '15分', isPlaceholder: false },
    facts: { viewers: 80, streamAgeProvenance: 'official', support: null, ...over },
  });

  it('ニコ生は null(今までの8つを壊さない)', () => {
    expect(venueItemsForPlatform('niconico', bag())).toBeNull();
  });

  it('YouTube は推定を公式の視聴者数にせず、数える前の合計は出さない', () => {
    const items = venueItemsForPlatform('youtube', bag());
    expect(items.map((i) => i.label)).toEqual(['記録', '同時視聴者数', '経過']);
    expect(items.find((i) => i.key === 'concurrent').text).toBe('80');
    expect(items.find((i) => i.key === 'concurrent').title).toContain('公式');
    expect(items.some((i) => i.label === '来場者数' || i.label === '広告pt' || i.label === '本家コメ')).toBe(false);
  });

  it('公式の視聴者数が無いとき、推定の ~ は出さない', () => {
    const items = venueItemsForPlatform('youtube', bag({ viewers: null }));
    expect(items.find((i) => i.key === 'concurrent').text).toBe('読み込み中');
  });

  it('YouTube の合計は円を先に出し、ドルは換算せず title に残す', () => {
    const items = venueItemsForPlatform('youtube', bag({ support: ytSupport() }));
    const paid = items.find((i) => i.key === 'superchat');
    expect(paid.label).toBe('スパチャ');
    expect(paid.text).toBe('¥1,200');
    expect(paid.title).toContain('USD 5');
    expect(paid.title).toContain('このPCの記録');
    expect(items.some((i) => i.key === 'members' || i.label === 'メンバー加入')).toBe(false);
  });

  it('スパチャが無い YouTube は、0円の枠を出さない', () => {
    const items = venueItemsForPlatform('youtube', bag({ support: tallySupportItems([]) }));
    expect(items.map((i) => i.label)).toEqual(['記録', '同時視聴者数', '経過']);
  });

  it('Twitch は Bits・サブスク・ギフトサブ・レイド', () => {
    const support = tallySupportItems([
      { kind: 'superchat', amount: 300, currency: 'BITS' },
      { kind: 'membership' },
      { kind: 'membership_gift', giftCount: 2 },
      { kind: 'tw_raid', amount: 40 },
    ]);
    const items = venueItemsForPlatform('twitch', bag({ viewers: 10, support }));
    expect(items.map((i) => i.label)).toEqual(['記録', '視聴者数', '経過', 'Bits', 'サブスク', 'ギフトサブ', 'レイド']);
    expect(items.find((i) => i.key === 'bits').text).toBe('300');
    expect(items.find((i) => i.key === 'raids').text).toBe('1');
    expect(items.find((i) => i.key === 'raids').title).toContain('40');
  });

  it('Kick は Kicks・サブスク・ギフトサブ', () => {
    const support = tallySupportItems([
      { kind: 'superchat', amount: 7, currency: 'KICKS' },
      { kind: 'membership_gift', giftCount: 1 },
    ]);
    const labels = venueItemsForPlatform('kick', bag({ support })).map((i) => i.label);
    expect(labels).toEqual(['記録', '視聴者数', '経過', 'Kicks', 'サブスク', 'ギフトサブ']);
  });

  it('ABEMA は視聴数と公式コメント。ギフトは出さない', () => {
    const items = venueItemsForPlatform('abema', {
      records: { text: '3', isPlaceholder: false },
      concurrent: { text: '—', isPlaceholder: true },
      streamAge: { text: '—', isPlaceholder: true },
      facts: { viewCount: 1000, viewers: 20, commentCount: 45 },
    });
    expect(items.map((i) => i.label)).toEqual(['記録', '視聴数', '経過', 'コメント']);
    expect(items.find((i) => i.key === 'concurrent').text).toBe('1,000');
    expect(items.find((i) => i.key === 'comments').text).toBe('45');
    expect(panelExtraChips('abema', { commentCount: null }).find((c) => c.key === 'comments').text).toBe('読み込み中');
  });

  it('SHOWROOM などは公式の特有の数が来るまで視聴者数と経過だけ(ニコ生の広告は出さない)', () => {
    const labels = venueItemsForPlatform('showroom', bag({ viewers: 4 })).map((i) => i.label);
    expect(labels).toEqual(['記録', '視聴者数', '経過']);
  });

  it('SHOWROOM はイベント順位・イベントpt・目標Lv をページの値のまま出す', () => {
    const official = { eventName: '春のイベント', eventRank: 3, eventPoint: 123456, eventGap: 5000, questLevel: 4, questPoint: 900, questGoal: 1500 };
    const items = venueItemsForPlatform('showroom', bag({ viewers: 4, official }));
    expect(items.map((i) => i.label)).toEqual(['記録', '視聴者数', '経過', 'イベント順位', 'イベントpt', '目標']);
    const rank = items.find((i) => i.key === 'eventRank');
    expect(rank.text).toBe('3位');
    expect(rank.title).toContain('春のイベント');
    expect(rank.title).toContain('5,000');
    expect(items.find((i) => i.key === 'eventPoint').text).toBe('123,456pt');
    expect(items.find((i) => i.key === 'quest').text).toBe('Lv4');
    expect(items.find((i) => i.key === 'quest').title).toContain('900 / 1,500');
    expect(items.some((i) => /推定/.test(`${i.label}${i.title}`))).toBe(false);
  });

  it('ミクチャはレベル・ファン・スーパーファン・ライバーランク。来ていない数は枠ごと出さない', () => {
    const chips = panelExtraChips('mixch', { official: { eventRank: 3, level: 12, fans: 34567, superfans: 210, liverRankScore: 45678, superfanBonus: 15 } });
    expect(chips.map((c) => c.label)).toEqual(['レベル', 'ファン', 'スーパーファン', 'ライバーランク', 'イベント順位']);
    expect(chips[0].text).toBe('Lv12');
    expect(chips.find((c) => c.key === 'liverRank').title).toContain('15%');
    expect(panelExtraChips('mixch', { official: { fans: 5 } }).map((c) => c.key)).toEqual(['fans']);
    expect(panelExtraChips('mixch', {})).toEqual([]);
  });

  it('ふわっちはイベント順位(複数は title に並べる)と累計視聴', () => {
    const chips = panelExtraChips('whowatch', {
      official: { eventRank: 2, eventName: 'A', events: [{ name: 'A', group: '新人', rank: 2 }, { name: 'B', group: '', rank: 9 }], totalViews: 1200 },
    });
    expect(chips.map((c) => c.label)).toEqual(['イベント順位', '累計視聴']);
    expect(chips[0].title).toContain('A(新人) 2位');
    expect(chips[0].title).toContain('B 9位');
  });

  it('ほかのサービスの欄の数は、能力表に無いサービスには出さない', () => {
    expect(panelExtraChips('youtube', { official: { eventRank: 1, level: 3 } })).toEqual([]);
    expect(panelExtraChips('niconico', { official: { eventRank: 1 } })).toEqual([]);
  });
});
