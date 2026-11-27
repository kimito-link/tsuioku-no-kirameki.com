import { describe, expect, it } from 'vitest';
import {
  OPERATOR_SECTION_ORDER,
  buildOperatorReportModel,
  officialEstimatesForOperator,
  inventedNumberViolations,
  resolveOperatorContentKind,
  operatorServiceLabel,
  operatorPublicId,
  operatorDisplayName,
} from './marketingOperatorReport.js';
import { renderOperatorReportHtml, wrapLegacyAnalysisAppendix } from './marketingOperatorReportHtml.js';

const T0 = Date.parse('2026-11-27T20:00:00+09:00');

function comment(over = {}) {
  return {
    id: over.id || `c_${Math.random().toString(36).slice(2, 8)}`,
    liveId: 'lv123',
    text: 'わこつ',
    userId: 'u1',
    nickname: '灯台メモ',
    capturedAt: T0,
    ...over,
  };
}

describe('OPERATOR_SECTION_ORDER', () => {
  it('決まっている順である', () => {
    expect([...OPERATOR_SECTION_ORDER]).toEqual([
      'thanks',
      'who',
      'top',
      'threads',
      'gifts',
      'peaks',
      'related',
    ]);
  });
});

describe('buildOperatorReportModel', () => {
  it('出る章は決まった順で、埋まらない章は落ちる', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv123',
      platformId: 'niconico',
      comments: [
        comment({ userId: 'u1', nickname: '灯台', capturedAt: T0, text: 'わこつ' }),
        comment({ userId: 'u2', nickname: '月見', capturedAt: T0 + 60_000, text: '面白い' }),
        comment({
          userId: 'u1',
          nickname: '灯台',
          capturedAt: T0 + 120_000,
          text: 'ギフト',
          ytKind: 'niconico_gift',
          ytAmount: 500,
          ytCurrency: 'PT',
        }),
      ],
    });
    expect(inventedNumberViolations(model)).toEqual([]);
    expect(model.sectionKeys).toEqual(model.sectionKeys.filter((k) => OPERATOR_SECTION_ORDER.includes(k)));
    for (let i = 1; i < model.sectionKeys.length; i += 1) {
      expect(OPERATOR_SECTION_ORDER.indexOf(model.sectionKeys[i])).toBeGreaterThan(
        OPERATOR_SECTION_ORDER.indexOf(model.sectionKeys[i - 1]),
      );
    }
    expect(model.sectionKeys).not.toContain('related');
    expect(model.sectionKeys).not.toContain('threads');
    expect(model.sectionKeys).toContain('thanks');
    expect(model.sectionKeys).toContain('top');
    expect(model.sections.find((s) => s.key === 'thanks')?.title).toBe('声をかけてくれた人');
  });

  it('過去配信が無いとき、新しい人の数を作らない', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv123',
      platformId: 'niconico',
      comments: [comment(), comment({ userId: 'u2', nickname: '月見' })],
      pastBroadcasts: [],
    });
    expect(model.basisOk).toBe(false);
    expect(model.returningCount).toBeNull();
    expect(model.unmatchedCount).toBeNull();
    expect(inventedNumberViolations(model)).toEqual([]);
    expect(model.sectionKeys).not.toContain('who');
    const html = renderOperatorReportHtml(model);
    expect(html).not.toMatch(/新規\s*100%/);
    expect(html).not.toMatch(/全員が.?新規/);
    expect(html).not.toContain('誰が来てくれたか');
    expect(html).not.toMatch(/過去の配信を読み込んでいない|また来てくれた人の数は出していません/);
  });

  it('過去配信があるときだけ、また来てくれた人を出す', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv999',
      platformId: 'niconico',
      comments: [
        comment({ userId: 'u1', nickname: '灯台', text: 'また来た' }),
        comment({ userId: 'u2', nickname: '新人', text: '初めてです' }),
      ],
      pastBroadcasts: [
        {
          liveId: 'lv100',
          comments: [{ userId: 'u1', nickname: '灯台', text: '前の回' }],
        },
      ],
    });
    expect(model.basisOk).toBe(true);
    expect(model.returningCount).toBe(1);
    expect(model.unmatchedCount).toBe(1);
    expect(inventedNumberViolations(model)).toEqual([]);
    expect(model.sectionKeys).toContain('who');
    const html = renderOperatorReportHtml(model);
    expect(html).toMatch(/灯台/);
    expect(html).toMatch(/誰が来てくれたか/);
    expect(html).toMatch(/以前の配信でも書いてくれた人/);
    expect(html).not.toMatch(/新しい人 1/);
  });

  it('YouTube 動画ではおへんじできるコメントを出し、ハートか投稿者返信があるものは外す', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv900000000001',
      platformId: 'youtube',
      contentKind: 'video',
      comments: [comment({ userId: 'UC1111111111111111111111', nickname: '春風', text: '好きです' })],
      pastBroadcasts: [{ liveId: 'lv1', comments: [{ userId: 'x', nickname: '過去' }] }],
      videoThreads: [
        {
          commentId: 'c1',
          parentId: '',
          channelId: 'UC1111111111111111111111',
          name: '春風ごま',
          text: '夜の歌が好きです',
          likeCount: 46,
          replyCount: 0,
          creatorHeart: false,
          isCreator: false,
          replyLevel: 0,
          timeText: '3日前',
        },
        {
          commentId: 'c2',
          parentId: '',
          channelId: 'UC2222222222222222222222',
          name: '暦の端っこ',
          text: 'サビが良い',
          likeCount: 9,
          creatorHeart: true,
          isCreator: false,
          replyLevel: 0,
          timeText: '6日前',
        },
        {
          commentId: 'c2r',
          parentId: 'c2',
          channelId: 'UCowner00000000000000000',
          name: '君斗りんく',
          text: 'ありがとう',
          isCreator: true,
          replyLevel: 1,
          timeText: '5日前',
        },
      ],
    });
    const thanks = model.sections.find((s) => s.key === 'thanks');
    expect(thanks?.title).toBe('おへんじできるコメント');
    expect(thanks.data.items.map((i) => i.name)).toEqual(['春風ごま']);
    expect(model.sectionKeys).toContain('threads');
    expect(model.kpis.some((k) => k.key === 'pending' && k.value === '1件')).toBe(true);
  });

  it('チップが無いときは related 章を出さない。あるときだけ出す', () => {
    const base = {
      liveId: 'lv900000000001',
      platformId: 'youtube',
      contentKind: 'video',
      comments: [comment({ capturedAt: T0, text: 'a' }), comment({ userId: 'u2', capturedAt: T0 + 1000, text: 'b' })],
    };
    expect(buildOperatorReportModel(base).sectionKeys).not.toContain('related');
    const withChip = buildOperatorReportModel({
      ...base,
      relatedChip: {
        chipLabel: 'すべて',
        chipLabels: ['すべて', '関連動画'],
        videos: [
          { title: '自分の本編', channel: '君斗りんく', videoId: 'abcdefghijk', href: '/watch?v=abcdefghijk', duration: '8:20', isOwn: true },
          { title: '他の動画', channel: '海辺のラジオ', videoId: 'bcdefghijkl', href: '/watch?v=bcdefghijkl', duration: '12:04', isOwn: false },
        ],
        ownCount: 1,
        capturedAt: T0,
      },
    });
    expect(withChip.sectionKeys).toContain('related');
    const html = renderOperatorReportHtml(withChip);
    expect(html).toMatch(/すべて/);
    expect(html).toMatch(/自分の動画/);
    expect(html).toMatch(/新しい通信はせず|自動では開いていません/);
  });
});

describe('officialEstimatesForOperator', () => {
  it('単価のない応援では金額を作らず、公式単価があるときだけ推定を出す', () => {
    const kicksOnly = officialEstimatesForOperator('kick', [
      { ytKind: 'superchat', ytAmount: 100, ytCurrency: 'KICKS', ytPlatform: 'kick' },
    ]);
    expect(kicksOnly).toEqual([]);
    const subs = officialEstimatesForOperator('kick', [
      { ytKind: 'membership', ytPlatform: 'kick', subEvent: 'sub' },
    ]);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0].text).toMatch(/[0-9]/);
    expect(subs[0].label).toMatch(/推定/);
  });

  it('ニコ生は公式ptがあるときだけ、既存の 1pt=1円 の推定を出す', () => {
    expect(officialEstimatesForOperator('niconico', [], {})).toEqual([]);
    const withPts = officialEstimatesForOperator('niconico', [], { officialGiftPts: 12400 });
    expect(withPts.length).toBe(1);
    expect(withPts[0].text).toMatch(/12,400|12400/);
  });
});

describe('renderOperatorReportHtml', () => {
  it('リードが先で、値が無い推定ダッシュを出さない', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv123',
      platformId: 'niconico',
      comments: [
        comment({ capturedAt: T0, text: 'わこつ' }),
        comment({ userId: 'u2', nickname: '月見', capturedAt: T0 + 30 * 60_000, text: '面白い' }),
      ],
      officialGiftPts: 12400,
    });
    const html = renderOperatorReportHtml(model);
    expect(html.indexOf('mkt-op-lead')).toBeGreaterThanOrEqual(0);
    expect(html).toMatch(/コメントした/);
    expect(html).not.toMatch(/>—</);
    const appendix = wrapLegacyAnalysisAppendix('<section id="mkt-kpi">old</section>');
    expect(appendix).toMatch(/<details class="mkt-appendix"/);
    expect(appendix).toMatch(/詳しい分析（従来のグラフと表）/);
    expect(appendix).not.toMatch(/<details[^>]*open/);
    expect(appendix).toMatch(/id="mkt-kpi"/);
  });
});

describe('resolveOperatorContentKind', () => {
  it('明示とニコの ID から判断し、YouTube の仮 lv では推測しない', () => {
    expect(resolveOperatorContentKind({ liveId: 'lv123', platformId: 'niconico' })).toBe('live');
    expect(resolveOperatorContentKind({ liveId: 'sm123', platformId: 'niconico' })).toBe('video');
    expect(resolveOperatorContentKind({ liveId: 'lv912345678901', platformId: 'youtube' })).toBe('live');
    expect(resolveOperatorContentKind({
      liveId: 'lv912345678901',
      platformId: 'youtube',
      contentKind: 'video',
    })).toBe('video');
    expect(resolveOperatorContentKind({
      liveId: 'lv912345678901',
      platformId: 'youtube',
      pageFacts: { contentKind: 'video' },
    })).toBe('video');
  });
});

describe('operatorServiceLabel / operatorPublicId', () => {
  it('YouTube 動画は公式の呼び方と watch id を出し、仮 lv は出さない', () => {
    expect(operatorServiceLabel('youtube', 'video')).toBe('YouTube 動画');
    expect(operatorServiceLabel('youtube', 'live')).toBe('YouTube ライブ');
    expect(operatorServiceLabel('niconico', 'live')).toBe('ニコニコ生放送');
    expect(operatorServiceLabel('niconico', 'video')).toBe('ニコニコ動画');
    expect(operatorPublicId({ platformId: 'youtube', liveId: 'lv927058321372', watchId: 'kKl0E22tU78' })).toBe('kKl0E22tU78');
    expect(operatorPublicId({ platformId: 'youtube', liveId: 'lv927058321372' })).toBe('');
    expect(operatorPublicId({ platformId: 'niconico', liveId: 'lv351899008' })).toBe('lv351899008');
  });
});

describe('運営者レポートの顔', () => {
  it('Twitch の控えアイコンがあれば本物の URL を出す', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv900000000003',
      platformId: 'twitch',
      comments: [
        comment({
          userId: '8123456789',
          nickname: 'lantern',
          login: 'lantern',
          text: 'Hi',
          ytPlatform: 'twitch',
        }),
      ],
      liveIcons: { lantern: 'https://static-cdn.jtvnw.net/jtv_user_pictures/lantern-profile.png' },
    });
    const html = renderOperatorReportHtml(model);
    expect(html).toContain('src="https://static-cdn.jtvnw.net/jtv_user_pictures/lantern-profile.png"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('data-mkt-av-fb=');
  });

  it('アイコンが無いときはゆっくり顔で、灰色の既定アイコンは出さない', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv900000000003',
      platformId: 'twitch',
      comments: [
        comment({
          userId: '8123456789',
          nickname: 'ghost',
          login: 'ghost',
          avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
          text: 'Hi',
          ytPlatform: 'twitch',
        }),
      ],
    });
    const html = renderOperatorReportHtml(model);
    expect(html).not.toContain('usericon/defaults/');
    expect(html).toMatch(/src="data:image\//);
    expect(html).not.toMatch(/class="mkt-op-av"[^>]*background:/);
  });

  it('声をかけてくれた人でも、公式の灰色の既定アイコンはゆっくり顔にする', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv900000000003',
      platformId: 'twitch',
      comments: [
        comment({
          userId: '8123456789',
          nickname: '歌は寺',
          login: 'uta',
          avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
          text: 'subscribed',
          ytKind: 'tw_sub',
          ytPlatform: 'twitch',
        }),
      ],
    });
    expect(model.sectionKeys).toContain('thanks');
    const html = renderOperatorReportHtml(model);
    expect(html).toContain('声をかけてくれた人');
    expect(html).not.toContain('usericon/defaults/');
    const thanks = (html.split('id="mkt-op-thanks"')[1] || '').split('</section>')[0];
    expect(thanks).toMatch(/src="data:image\//);
    expect(thanks).not.toContain('usericon/defaults/');
  });

  it('ニコニコの数値 ID は既定 CDN の顔を使う', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv123',
      platformId: 'niconico',
      comments: [comment({ userId: '4046119', nickname: '灯台', text: 'わこつ' })],
    });
    const html = renderOperatorReportHtml(model);
    expect(html).toContain('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg');
  });
});

describe('operatorDisplayName', () => {
  it('マスク時は視聴者', () => {
    expect(operatorDisplayName({ name: '灯台' }, { maskShare: true })).toBe('視聴者');
  });

  it('名前があればそのまま出す', () => {
    expect(operatorDisplayName({ name: '灯台', comparable: true, uid: '4046119' }, { platformId: 'niconico' })).toBe('灯台');
  });

  it('照合できない人や匿名は「匿名」', () => {
    expect(operatorDisplayName({ name: '', comparable: false }, { platformId: 'niconico' })).toBe('匿名');
    expect(operatorDisplayName({ name: '', is184: true, userId: '4046119' }, { platformId: 'niconico' })).toBe('匿名');
  });

  it('Twitch と Kick は、名前が無くても login を出す', () => {
    expect(operatorDisplayName({ name: '', comparable: true, login: 'lantern', uid: '8123456789' }, { platformId: 'twitch' })).toBe('lantern');
    expect(operatorDisplayName({ name: '', comparable: true, login: 'slugger', uid: '8123456789' }, { platformId: 'kick' })).toBe('slugger');
  });

  it('ニコの数値 ID だけ「ID 123456」と出し、内部 ID は出さない', () => {
    expect(operatorDisplayName({ name: '', comparable: true, uid: '4046119' }, { platformId: 'niconico' })).toBe('ID 4046119');
    expect(operatorDisplayName({ name: '', comparable: true, uid: 'a:abcdefg' }, { platformId: 'niconico' })).toBe('名前未取得');
    expect(operatorDisplayName({ name: '', comparable: true, uid: '8123456789' }, { platformId: 'twitch' })).toBe('名前未取得');
  });
});

function kpiMainNumber(value) {
  const m = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

describe('測れていない 0 はサマリーに出さない', () => {
  const platforms = ['niconico', 'youtube', 'twitch', 'kick', 'twitcasting', 'showroom', 'mixch', 'abema', 'tiktok', 'whowatch'];

  it('測れていないページの数 0 は出さず、視聴者数の山があればそちらを出す', () => {
    for (const platformId of platforms) {
      const model = buildOperatorReportModel({
        liveId: platformId === 'niconico' ? 'lv123' : 'lv900000000001',
        platformId,
        contentKind: 'live',
        comments: [comment({ userId: 'u1', nickname: '灯台', ytPlatform: platformId === 'niconico' ? '' : platformId })],
        pageCount: 0,
        visitorCount: 0,
        pageFacts: { viewCount: 0, commentCount: 0 },
        concurrentPeak: 4975,
      });
      for (const kpi of model.kpis) {
        const n = kpiMainNumber(kpi.value);
        expect(n, `${platformId} ${kpi.label}=${kpi.value}`).not.toBe(0);
        if (n != null) expect(n, `${platformId} ${kpi.label}`).toBeGreaterThan(0);
        expect(kpi.label, platformId).not.toBe('ページの数');
      }
      const peak = model.kpis.find((k) => k.key === 'concurrent');
      expect(peak, platformId).toBeTruthy();
      expect(peak.value).toBe('4,975人');
      expect(peak.label).toMatch(/の山$/);
    }
  });

  it('測れているページの数は、そのサービスの言葉のまま出す', () => {
    const model = buildOperatorReportModel({
      liveId: 'lv900000000001',
      platformId: 'abema',
      contentKind: 'live',
      comments: [comment({ userId: 'u1', nickname: '灯台', ytPlatform: 'abema' })],
      pageCount: 1200,
      concurrentPeak: 4975,
    });
    const views = model.kpis.find((k) => k.key === 'views');
    expect(views?.value).toBe('1,200');
    expect(views?.label).toBe('視聴数（ページの数）');
    expect(model.kpis.some((k) => k.key === 'concurrent')).toBe(false);
  });

  it('動画の再生数が測れていれば再生数を出し、0 なら出さない', () => {
    const withViews = buildOperatorReportModel({
      liveId: 'vid1',
      platformId: 'youtube',
      contentKind: 'video',
      comments: [comment({ userId: 'u1', nickname: '灯台', ytPlatform: 'youtube' })],
      pageCount: 12345,
    });
    expect(withViews.kpis.find((k) => k.key === 'views')?.label).toBe('再生数');
    expect(withViews.kpis.find((k) => k.key === 'views')?.value).toBe('12,345');

    const zero = buildOperatorReportModel({
      liveId: 'vid1',
      platformId: 'youtube',
      contentKind: 'video',
      comments: [comment({ userId: 'u1', nickname: '灯台', ytPlatform: 'youtube' })],
      pageCount: 0,
    });
    expect(zero.kpis.some((k) => k.key === 'views' || k.label === '再生数' || k.label === 'ページの数')).toBe(false);
    for (const kpi of zero.kpis) {
      const n = kpiMainNumber(kpi.value);
      expect(n).not.toBe(0);
    }
  });
});

