import { describe, expect, it } from 'vitest';
import {
  OPERATOR_SECTION_ORDER,
  buildOperatorReportModel,
  officialEstimatesForOperator,
  inventedNumberViolations,
  resolveOperatorContentKind,
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
    const html = renderOperatorReportHtml(model);
    expect(html).not.toMatch(/新規\s*100%/);
    expect(html).not.toMatch(/全員が.?新規/);
    expect(html).toMatch(/過去の配信を読み込んでいない|突き合わせていない/);
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
    const html = renderOperatorReportHtml(model);
    expect(html).toMatch(/灯台/);
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
