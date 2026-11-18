/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  FOLLOWER_SAMPLE_CAP,
  FOLLOWER_SAMPLE_INTERVAL_MS,
  analyzeFollowerGrowth,
  appendFollowerSample,
  followerSampleFromDom,
  followerSampleFromKickChannel,
  followerSampleFromKickEvent,
  followerSampleFromMixch,
  followerSampleFromShowroom,
  followerSampleFromTcDocument,
  followerSampleFromTikTokRoom,
  followerSampleFromWhowatch,
  followerSampleFromWhowatchProfile,
  parseFollowerCountText,
} from './followerCountSample.js';
import { sectionSupportArrivalHtml } from './marketingPlatformChapters.js';

const T0 = Date.parse('2026-03-01T03:00:00.000Z');

describe('ページの人数の文字', () => {
  it('正確な整数と概数を分ける', () => {
    expect(parseFollowerCountText('12,345')).toEqual({ count: 12345, rounded: false });
    expect(parseFollowerCountText('チャンネル登録者数 1.2万人')).toMatchObject({ count: 12000, rounded: true, raw: '1.2万' });
    expect(parseFollowerCountText('1.23K subscribers')).toMatchObject({ count: 1230, rounded: true });
    expect(parseFollowerCountText('139K')).toMatchObject({ count: 139000, rounded: true, raw: '139K' });
    expect(parseFollowerCountText('13.9万人')).toMatchObject({ count: 139000, rounded: true, raw: '13.9万' });
    expect(parseFollowerCountText('1.5億人')).toMatchObject({ count: 150000000, rounded: true, raw: '1.5億' });
    expect(parseFollowerCountText('10,533')).toEqual({ count: 10533, rounded: false });
  });
  it('視聴数の文は人数にしない', () => {
    expect(parseFollowerCountText('2.1 万人が視聴中')).toBeNull();
    expect(parseFollowerCountText('コメント 1707')).toBeNull();
  });
});

describe('標本の間隔', () => {
  it('3分未満は足さず、配列を書き換えない', () => {
    const prev = [{ at: T0, count: 10, rounded: false, source: /** @type {const} */ ('page-count') }];
    const same = appendFollowerSample(prev, { at: T0 + 60_000, count: 11, rounded: false, source: 'page-count' });
    expect(same).toBe(prev);
    expect(prev).toHaveLength(1);
    const next = appendFollowerSample(prev, { at: T0 + FOLLOWER_SAMPLE_INTERVAL_MS, count: 12, rounded: false, source: 'page-count' });
    expect(next).toHaveLength(2);
    expect(prev).toHaveLength(1);
  });
  it('増えた瞬間の合計は3分を待たず、同じ数の繰り返しは足さない', () => {
    const first = appendFollowerSample([], { at: T0, count: 100, rounded: false, source: 'exact-event' });
    const dup = appendFollowerSample(first, { at: T0 + 1000, count: 100, rounded: false, source: 'exact-event' });
    expect(dup).toBe(first);
    const up = appendFollowerSample(first, { at: T0 + 1000, count: 101, rounded: false, source: 'exact-event' });
    expect(up.map((s) => s.count)).toEqual([100, 101]);
  });
  it('終わりの強制は15秒より前なら足さない', () => {
    const first = appendFollowerSample([], { at: T0, count: 5, rounded: false, source: 'page-count' });
    expect(appendFollowerSample(first, { at: T0 + 5000, count: 5, rounded: false, source: 'page-count', force: true })).toBe(first);
    expect(appendFollowerSample(first, { at: T0 + 20_000, count: 5, rounded: false, source: 'page-count', force: true })).toHaveLength(2);
  });
  it('上限を超えたら新しい方を残す', () => {
    let rows = /** @type {any[]} */ ([]);
    for (let i = 0; i < FOLLOWER_SAMPLE_CAP + 3; i += 1) {
      rows = appendFollowerSample(rows, { at: T0 + i * 1000, count: i, rounded: false, source: 'exact-event' });
    }
    expect(rows).toHaveLength(FOLLOWER_SAMPLE_CAP);
    expect(rows[0].count).toBe(3);
  });
});

describe('各サービスの応答', () => {
  it('Kick のチャンネル JSON と FollowersUpdated', () => {
    const channel = {
      id: 10,
      slug: 'demo',
      followers_count: '1200',
      chatroom: { id: 9 },
      user: { username: 'demo' },
      livestream: { id: 3, is_live: true, viewer_count: 10 },
    };
    expect(followerSampleFromKickChannel(channel)).toMatchObject({ count: 1200, rounded: false, source: 'page-count', noun: 'フォロワー' });
    expect(followerSampleFromKickChannel({ slug: 'demo' })).toBeNull();
    const ev = { followersCount: 1208, channel_id: 10, username: 'a', created_at: '2026-03-01T03:05:00Z', followed: true };
    expect(followerSampleFromKickEvent('App\\Events\\FollowersUpdated', ev)).toMatchObject({ count: 1208, source: 'exact-event' });
    expect(followerSampleFromKickEvent('ChatMessageEvent', ev)).toBeNull();
  });
  it('TikTok の room は followInfo があるときだけ', () => {
    const withCount = { data: { user: { id: '1', roomId: '123456', followInfo: { followerCount: 99 } }, liveRoom: { status: 2, liveRoomStats: { userCount: 3 } } } };
    expect(followerSampleFromTikTokRoom(withCount)).toMatchObject({ count: 99, noun: 'フォロワー' });
    expect(followerSampleFromTikTokRoom({ data: { user: { id: '1', roomId: '123456' }, liveRoom: { status: 2, liveRoomStats: { userCount: 3 } } } })).toBeNull();
  });
  it('ふわっちは配信者の follower_count があるときだけ', () => {
    expect(followerSampleFromWhowatch({ live: { id: '1', user: { id: '2', name: 'a', follower_count: 40 } } })).toMatchObject({ count: 40, noun: 'フォロワー' });
    expect(followerSampleFromWhowatch({ live: { id: '1', user: { id: '2', name: 'a', user_path: 'ab', icon_url: '' } } })).toBeNull();
  });
  it('ミクチャは broadcasterInfo.fan', () => {
    expect(followerSampleFromMixch({ broadcasterInfo: { fan: 123456 }, broadcasterLevel: { level: 3 } })).toMatchObject({ count: 123456, noun: 'ファン' });
  });
  it('ふわっちのプロフィールは follower_count。follow_count はフォローしている側', () => {
    expect(followerSampleFromWhowatchProfile({
      user_id: 348122,
      user_path: 'w:mippeko33',
      name: 'a',
      follow_count: 3750,
      follower_count: 5267,
    })).toMatchObject({ count: 5267, rounded: false, noun: 'フォロワー' });
    expect(followerSampleFromWhowatchProfile({ follow_count: 3750, user_id: 1 })).toBeNull();
  });
  it('SHOWROOM のプロフィールは follower_num。view_num は入室者数', () => {
    expect(followerSampleFromShowroom({
      room_id: 61576,
      follower_num: 24960,
      view_num: 120,
      is_onlive: true,
      room_name: 'a',
    })).toMatchObject({ count: 24960, noun: 'フォロワー' });
    expect(followerSampleFromShowroom({ room_id: 61576, view_num: 120, online_user_num: 30 })).toBeNull();
  });
});

describe('各サービスのページ', () => {
  it('YouTube の登録者数は概数と正確な数を分ける', () => {
    document.body.innerHTML = '<span id="owner-sub-count">1.2万人</span>';
    expect(followerSampleFromDom(document, 'youtube')).toMatchObject({ count: 12000, rounded: true, noun: 'チャンネル登録者', raw: '1.2万' });
    document.body.innerHTML = '<span id="owner-sub-count">1,234人</span>';
    expect(followerSampleFromDom(document, 'youtube')).toMatchObject({ count: 1234, rounded: false, noun: 'チャンネル登録者' });
    document.body.innerHTML = '<div id="owner"><span class="yt-core-attributed-string">チャンネル登録者数 13.9万人</span></div>';
    expect(document.getElementById('owner-sub-count')).toBeNull();
    expect(followerSampleFromDom(document, 'youtube')).toMatchObject({ count: 139000, rounded: true, raw: '13.9万', noun: 'チャンネル登録者' });
    document.body.innerHTML = '<html data-nl-yt-subscribers="チャンネル登録者数 13.9万人"><body><div id="owner"></div></body></html>';
    document.documentElement.setAttribute('data-nl-yt-subscribers', 'チャンネル登録者数 13.9万人');
    expect(followerSampleFromDom(document, 'youtube')).toMatchObject({ count: 139000, rounded: true, raw: '13.9万' });
    document.body.innerHTML = '<div id="owner"><span>チャンネル登録者数 139</span><span>K</span></div>';
    document.documentElement.removeAttribute('data-nl-yt-subscribers');
    expect(followerSampleFromDom(document, 'youtube')).toMatchObject({ count: 139000, rounded: true, raw: '139K' });
    document.body.innerHTML = '<div id="owner"><span>チャンネル登録者数 139</span></div>';
    document.documentElement.setAttribute('data-nl-yt-subscribers', '13.9万人');
    expect(followerSampleFromDom(document, 'youtube')).toMatchObject({ count: 139000, rounded: true, raw: '13.9万' });
  });
  it('Twitch の視聴者数とフォローボタンは人数にしない', () => {
    document.body.innerHTML = '<span data-a-target="animated-channel-viewers-count">10533</span><button data-a-target="follow-button">フォロー</button>';
    expect(followerSampleFromDom(document, 'twitch')).toBeNull();
  });
  it('ABEMA の視聴数カウンターはフォロワーにしない', () => {
    document.body.innerHTML = '<div class="com-tv-FeedProgramDetailViewCounter"><abbr class="com-a-Counter" title="21139">2.1 万</abbr></div><span class="com-tv-LinearFooterCommentButton__text" title="1707">1,707</span>';
    expect(followerSampleFromDom(document, 'abema')).toBeNull();
  });
  it('SHOWROOM は follower を含む短いノードだけ', () => {
    document.body.innerHTML = '<p class="room-follower-num">フォロワー 456</p>';
    expect(followerSampleFromDom(document, 'showroom')).toMatchObject({ count: 456, rounded: false });
  });
  it('ツイキャスはサポーターの行だけ', () => {
    document.body.innerHTML = '<ul class="tw-user-nav-stat"><li>フォロワー 10</li><li>サポーター 1,234</li><li>サポート中 3</li></ul>';
    expect(followerSampleFromTcDocument(document)).toMatchObject({ count: 1234, noun: 'サポーター', rounded: false });
  });
});

describe('増えた時間', () => {
  it('正確な標本が2件未満なら増減を出さない', () => {
    expect(analyzeFollowerGrowth([{ at: T0, count: 10, rounded: false, source: 'page-count' }])).toBeNull();
    const onlyRounded = analyzeFollowerGrowth([
      { at: T0, count: 12000, rounded: true, source: 'rounded', raw: '1.2万', noun: 'チャンネル登録者' },
      { at: T0 + 180_000, count: 13000, rounded: true, source: 'rounded', raw: '1.3万' },
    ]);
    expect(onlyRounded?.roundedOnly).toBe(true);
    expect(onlyRounded?.label).toContain('1.2万 → 1.3万');
    expect(onlyRounded?.label).toContain('概数');
    expect(onlyRounded?.label).not.toContain('＋');
    const mixed = analyzeFollowerGrowth([
      { at: T0, count: 139000, rounded: true, source: 'rounded', raw: '139K', noun: 'チャンネル登録者' },
      { at: T0 + 180_000, count: 139, rounded: false, source: 'page-count' },
    ]);
    expect(mixed?.roundedOnly).toBe(true);
    expect(mixed?.label).toContain('139K');
    expect(mixed?.label).toContain('概数');
    expect(mixed?.label).not.toContain('139人');
  });
  it('概数の桁を落とした整数は標本に混ぜない', () => {
    const prev = [{ at: T0, count: 139000, rounded: true, source: /** @type {const} */ ('rounded'), raw: '139K' }];
    const next = appendFollowerSample(prev, { at: T0 + 600_000, count: 139, rounded: false, source: 'page-count' });
    expect(next).toBe(prev);
  });
  it('増えた幅の大きい順に、そのあいだの応援とコメントを数える', () => {
    const samples = [
      { at: T0, count: 1000, rounded: false, source: 'page-count', noun: 'フォロワー' },
      { at: T0 + 180_000, count: 1008, rounded: false, source: 'page-count' },
      { at: T0 + 360_000, count: 1009, rounded: false, source: 'page-count' },
    ];
    const g = analyzeFollowerGrowth(samples, {
      supportAts: [T0 + 10_000, T0 + 20_000],
      commentAts: [T0 + 30_000, T0 + 40_000, T0 + 200_000],
    });
    expect(g).toMatchObject({ startCount: 1000, endCount: 1009, net: 9 });
    expect(g?.windows[0]).toMatchObject({ delta: 8, supportCount: 2, commentCount: 2 });
    expect(g?.windows[1]).toMatchObject({ delta: 1, supportCount: 0, commentCount: 1 });
  });
});

describe('レポートの先頭', () => {
  it('標本が無いときは今までの章のまま', () => {
    const html = sectionSupportArrivalHtml({
      platformId: 'twitch',
      comments: [{ capturedAt: T0, ytKind: 'superchat', text: 'bits', name: 'a', ytCurrency: 'BITS', amount: 10 }],
    });
    expect(html).toContain('応援が届いた瞬間');
    expect(html).not.toContain('増えた時間');
  });
  it('ABEMA は記録も標本も無いとき章を出さない', () => {
    expect(sectionSupportArrivalHtml({ platformId: 'abema', comments: [] })).toBe('');
    expect(sectionSupportArrivalHtml({
      platformId: 'abema',
      comments: [{ capturedAt: T0, text: 'こんにちは', ytKind: 'text' }],
    })).toBe('');
  });
  it('応援が無くても正確な標本が2件あれば章を出す', () => {
    const html = sectionSupportArrivalHtml({
      platformId: 'kick',
      comments: [
        { capturedAt: T0 + 10_000, text: 'こんにちは', ytKind: 'text' },
        { capturedAt: T0 + 20_000, text: 'がんばれ', ytKind: 'text' },
      ],
      followerSamples: [
        { at: T0, count: 1000, rounded: false, source: 'page-count', noun: 'フォロワー' },
        { at: T0 + 180_000, count: 1008, rounded: false, source: 'exact-event' },
      ],
    });
    expect(html).toContain('id="mkt-support-arrival"');
    expect(html).toContain('1,000人');
    expect(html).toContain('＋8人');
    expect(html).toContain('応援 0件・コメント 2件');
    expect(html).not.toContain('が原因');
  });
  it('概数だけなら増えた人数を出さない', () => {
    const html = sectionSupportArrivalHtml({
      platformId: 'youtube',
      followerSamples: [{ at: T0, count: 12000, rounded: true, source: 'rounded', raw: '1.2万', noun: 'チャンネル登録者' }],
    });
    expect(html).toContain('概数');
    expect(html).toContain('1.2万');
    expect(html).not.toContain('＋');
  });
});
