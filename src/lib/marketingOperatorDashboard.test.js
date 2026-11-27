import { describe, expect, it } from 'vitest';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';
import { OPERATOR_SECTION_ORDER, inventedNumberViolations, buildOperatorReportModel } from './marketingOperatorReport.js';
import { OPERATOR_REPORT_CSS } from './marketingOperatorReportHtml.js';

const T0 = Date.parse('2026-11-27T12:00:00.000Z');

function commentsFor(platform, liveId, extraLast = {}) {
  return [0, 1, 2, 3].map((i) => ({
    id: `${platform}${i}`,
    liveId,
    commentNo: String(i + 1),
    text: `こんにちは ${i}`,
    userId: `u${i}`,
    nickname: `viewer-${i}`,
    capturedAt: T0 + i * 60_000,
    ytPlatform: platform,
    ytKind: 'text',
    ...(i === 3 ? extraLast : {}),
  }));
}

function sectionKeysFromHtml(html) {
  const keys = [];
  const re = /id="mkt-op-([a-z]+)"/g;
  let m;
  while ((m = re.exec(html))) keys.push(m[1]);
  return keys.filter((k) => k !== 'lead');
}

describe('運営者向けマーケ HTML の契約', () => {
  it('どのサービスでも章の順は同じで、従来の分析は閉じて付く', () => {
    const platforms = ['youtube', 'twitch', 'kick', 'twitcasting', 'showroom', 'mixch', 'abema', 'tiktok', 'whowatch'];
    for (const platform of platforms) {
      const liveId = 'lv900000000001';
      const comments = commentsFor(platform, liveId);
      const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
        platform,
        commentsForAnalytics: comments,
        contentKind: 'live',
        broadcastTitle: '夜の配信',
      });
      expect(html).toContain('class="mkt-shell--warm"');
      expect(html).toContain('運営者向け');
      expect(html).toMatch(/この(?:配信|動画|番組)の記録/);
      expect(html).not.toContain('おへんじ待ち');
      const keys = sectionKeysFromHtml(html);
      for (let i = 1; i < keys.length; i += 1) {
        expect(OPERATOR_SECTION_ORDER.indexOf(keys[i])).toBeGreaterThan(OPERATOR_SECTION_ORDER.indexOf(keys[i - 1]));
      }
      expect(html).toContain('id="mkt-appendix"');
      expect(html).toMatch(/<details class="mkt-appendix" id="mkt-appendix">/);
      expect(html).not.toMatch(/<details[^>]*id="mkt-appendix"[^>]*open/);
      expect(html).toContain('詳しい分析（従来のグラフと表）');
    }
  });

  it('公式の単価が無い応援は件数だけ出し、金額を作らない', () => {
    const liveId = 'lv900000000001';
    const comments = commentsFor('kick', liveId, {
      ytKind: 'superchat',
      ytAmount: 100,
      ytCurrency: 'KICKS',
      text: 'Kicks',
      ytPlatform: 'kick',
    });
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'kick',
      commentsForAnalytics: comments,
      contentKind: 'live',
    });
    const gifts = html.slice(html.indexOf('id="mkt-op-gifts"'), html.indexOf('id="mkt-appendix"'));
    expect(gifts).not.toMatch(/推定[^<]*円/);
    expect(gifts).not.toMatch(/¥\s*\d/);
    expect(html).not.toContain('100%が新しい人');
    const model = buildOperatorReportModel({
      liveId,
      platformId: 'kick',
      contentKind: 'live',
      comments,
    });
    expect(inventedNumberViolations(model)).toEqual([]);
  });

  it('YouTube の Super Chat は公式の単価があるので推定を出す', () => {
    const liveId = 'lv912345678901';
    const comments = commentsFor('youtube', liveId, {
      ytKind: 'superchat',
      ytAmount: 5,
      ytCurrency: 'USD',
      text: 'SC',
    });
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'youtube',
      commentsForAnalytics: comments,
      contentKind: 'live',
    });
    const gifts = html.slice(html.indexOf('id="mkt-op-gifts"'), html.indexOf('id="mkt-appendix"'));
    expect(gifts).toContain('推定');
    expect(inventedNumberViolations(buildOperatorReportModel({
      liveId, platformId: 'youtube', contentKind: 'live', comments,
    }))).toEqual([]);
  });

  it('動画ではおへんじできるコメント、関連チップは見えているときだけ', () => {
    const liveId = 'lv912345678902';
    const comments = commentsFor('youtube', liveId);
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'youtube',
      commentsForAnalytics: comments,
      contentKind: 'video',
      videoThreads: [
        {
          commentId: 'Ug1',
          name: '春風ごま',
          text: '夜の歌が好きです',
          likeCount: 46,
          creatorHeart: false,
          isCreator: false,
          parentId: '',
          replyLevel: 0,
        },
      ],
      relatedChip: {
        chipLabel: 'すべて',
        chipLabels: ['すべて', '関連動画'],
        videos: [
          { videoId: 'abcdefghijk', title: '歌枠', channel: '君斗りんく', href: '/watch?v=abcdefghijk', duration: '8:20', isOwn: true },
        ],
        ownCount: 1,
        capturedAt: T0,
      },
    });
    expect(html).toContain('おへんじできるコメント');
    expect(html).not.toContain('声をかけてくれた人');
    expect(html).toContain('書き出したとき選ばれていたチップは「すべて」');
    expect(html).toContain('歌枠');
    expect(html).toContain('自分の動画');
  });

  it('コメントのサービス名を優先し、Twitch を YouTube ライブと書かない', () => {
    const liveId = 'lv944571565015';
    const comments = commentsFor('twitch', liveId);
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'youtube',
      commentsForAnalytics: comments,
      contentKind: 'live',
      broadcastTitle: 'ハイゲ前日',
    });
    const kicker = (html.match(/mkt-header__kicker">([^<]+)/) || [])[1] || '';
    expect(kicker).toContain('Twitch の記録');
    expect(kicker).not.toContain('YouTube');
    expect(html).toContain('ハイゲ前日');
  });

  it('YouTube 動画の見出しは公式の呼び方と watch id で、仮 lv は出さない', () => {
    const liveId = 'lv927058321372';
    const comments = commentsFor('youtube', liveId, {
      likeCount: 12,
      text: '夜の歌が好きです',
    });
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'youtube',
      commentsForAnalytics: comments,
      contentKind: 'video',
      broadcastTitle: '夜の歌',
      watchId: 'kKl0E22tU78',
    });
    const kicker = (html.match(/mkt-header__kicker">([^<]+)/) || [])[1] || '';
    const sub = (html.match(/mkt-header__sub">([^<]+)/) || [])[1] || '';
    expect(kicker).toContain('YouTube 動画 の記録');
    expect(sub).toContain('kKl0E22tU78');
    expect(sub).not.toContain('lv927058321372');
    expect(kicker).not.toContain('ニコニコ');
    expect(html).toContain('夜の歌');
    expect(html).toContain('コメントのいいね合計');
  });

  it('いいね数が無いときは、いいね列を出さない', () => {
    const liveId = 'lv123';
    const comments = commentsFor('niconico', liveId);
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      commentsForAnalytics: comments,
      contentKind: 'live',
    });
    expect(html).toContain('ニコニコ生放送 の記録');
    expect(html).not.toContain('コメントのいいね合計');
  });

  it('配信ではギフトがあると「声をかけてくれた人」が出る', () => {
    const liveId = 'lv900000000003';
    const comments = commentsFor('twitch', liveId, {
      ytKind: 'tw_sub',
      ytPlatform: 'twitch',
      text: 'subscribed',
    });
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'twitch',
      commentsForAnalytics: comments,
      contentKind: 'live',
    });
    expect(html).toContain('声をかけてくれた人');
    expect(html).not.toContain('おへんじ待ち');
  });
});

describe('暖色の配信者プロフィール', () => {
  it('自己紹介とチップの色を暖色に上書きする', () => {
    expect(OPERATOR_REPORT_CSS).toMatch(/\.mkt-shell--warm \.mkt-bcaster__bio\{[^}]*background:#fff7ec/);
    expect(OPERATOR_REPORT_CSS).toMatch(/\.mkt-shell--warm \.mkt-bcaster__chip\{[^}]*background:#fff7ec/);
  });
});
