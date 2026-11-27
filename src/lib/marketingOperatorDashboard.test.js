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

  it('プロフィールカードは他のカードと同じく main の幅に収める', () => {
    const liveId = 'lv123';
    const comments = commentsFor('niconico', liveId);
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      commentsForAnalytics: comments,
      contentKind: 'live',
      broadcastTitle: '歌枠',
      broadcasterProfile: {
        userId: '4046119',
        name: '灯台',
        avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg',
        description: '歌います',
      },
    });
    const mainAt = html.indexOf('<main class="mkt-main">');
    const mainEnd = html.indexOf('</main>', mainAt);
    const main = html.slice(mainAt, mainEnd);
    expect(main).toContain('aria-label="配信者プロフィール"');
    expect(main).toContain('<section class="mkt-section mkt-section--bcaster"');
    const beforeMain = html.slice(0, mainAt);
    expect(beforeMain).not.toContain('aria-label="配信者プロフィール"');
    expect(beforeMain).not.toContain('<section class="mkt-section mkt-section--bcaster"');
  });
});

describe('比較データが無いときの章立て', () => {
  it('誰が来てくれたか は出さず、先頭を確認できずの文にしない', () => {
    const liveId = 'lv123';
    const comments = commentsFor('niconico', liveId);
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      commentsForAnalytics: comments,
      contentKind: 'live',
    });
    const appendixAt = html.indexOf('id="mkt-appendix"');
    const operatorHtml = appendixAt >= 0 ? html.slice(0, appendixAt) : html;
    expect(operatorHtml).not.toContain('誰が来てくれたか');
    expect(operatorHtml).not.toMatch(/また来てくれた人の数は出していません|過去との照合/);
    const keys = sectionKeysFromHtml(html);
    expect(keys).not.toContain('who');
    expect(keys[0]).toBe('top');
  });
});

describe('控えアイコンの顔', () => {
  it('Twitch の liveIcons をよく書いてくれた人に出す', () => {
    const liveId = 'lv900000000003';
    const comments = commentsFor('twitch', liveId).map((c, i) => ({
      ...c,
      login: `viewer${i}`,
      ytPlatform: 'twitch',
    }));
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'twitch',
      commentsForAnalytics: comments,
      contentKind: 'live',
      liveIcons: {
        viewer0: 'https://static-cdn.jtvnw.net/jtv_user_pictures/viewer0.png',
      },
    });
    expect(html).toContain('src="https://static-cdn.jtvnw.net/jtv_user_pictures/viewer0.png"');
    expect(html).not.toContain('usericon/defaults/');
  });
});

function operatorNameCells(html) {
  const appendixAt = html.indexOf('id="mkt-appendix"');
  const op = appendixAt >= 0 ? html.slice(0, appendixAt) : html;
  /** @type {string[]} */
  const names = [];
  for (const m of op.matchAll(/class="mkt-op-name">([^<]*)/g)) {
    names.push(String(m[1] || '').trim());
  }
  const gift = op.match(/id="mkt-op-gifts"[\s\S]*?<\/section>/);
  if (gift) {
    for (const row of gift[0].matchAll(/<tr><td>[^<]*<\/td><td>([^<]*)<\/td>/g)) {
      names.push(String(row[1] || '').trim());
    }
  }
  return names;
}

describe('名前セルは空欄にしない', () => {
  it('どのサービスでも、名前セルを空欄にしない', () => {
    const platforms = ['niconico', 'youtube', 'twitch', 'kick', 'twitcasting', 'showroom', 'mixch', 'abema', 'tiktok', 'whowatch'];
    for (const platform of platforms) {
      const liveId = platform === 'niconico' ? 'lv123' : 'lv900000000001';
      const comments = [
        {
          id: `${platform}-anon`,
          liveId,
          commentNo: '1',
          text: '匿名です',
          userId: '',
          nickname: '',
          is184: true,
          capturedAt: T0,
          ytPlatform: platform === 'niconico' ? '' : platform,
        },
        {
          id: `${platform}-idonly`,
          liveId,
          commentNo: '2',
          text: 'IDだけ',
          userId: platform === 'niconico' ? '4046119' : platform === 'youtube' ? 'UC1111111111111111111111' : '8123456789',
          nickname: '',
          login: platform === 'twitch' || platform === 'kick' ? 'lantern' : '',
          capturedAt: T0 + 60_000,
          ytPlatform: platform === 'niconico' ? '' : platform,
        },
        {
          id: `${platform}-gift`,
          liveId,
          commentNo: '3',
          text: 'gift',
          userId: platform === 'niconico' ? '425541' : '8123456790',
          nickname: '',
          login: platform === 'twitch' || platform === 'kick' ? 'gifter' : '',
          capturedAt: T0 + 120_000,
          ytPlatform: platform === 'niconico' ? 'niconico' : platform,
          ytKind: platform === 'niconico' ? 'niconico_gift' : platform === 'twitch' ? 'tw_sub' : 'text',
          ytAmount: 100,
          ytCurrency: platform === 'niconico' ? 'PT' : 'USD',
        },
      ];
      const pastBroadcasts = [
        {
          liveId: 'lv-past',
          comments: [{ userId: comments[1].userId, nickname: '', text: '前の回' }],
        },
      ];
      const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
        ...(platform === 'niconico' ? {} : { platform }),
        commentsForAnalytics: comments,
        pastBroadcasts,
        contentKind: 'live',
      });
      const names = operatorNameCells(html);
      expect(names.length, platform).toBeGreaterThan(0);
      for (const name of names) {
        expect(name, `${platform} empty name cell`).not.toBe('');
      }
      if (platform === 'niconico') {
        expect(names).toContain('匿名');
        expect(names).toContain('ID 4046119');
      }
      if (platform === 'twitch' || platform === 'kick') {
        expect(names).toContain('lantern');
      }
    }
  });
});

function operatorKpiCards(html) {
  const appendixAt = html.indexOf('id="mkt-appendix"');
  const op = appendixAt >= 0 ? html.slice(0, appendixAt) : html;
  /** @type {Array<{ value: string, label: string, hint: string }>} */
  const cards = [];
  const re = /class="mkt-op-kpi"><b>([^<]*)<\/b><span>([^<]*)<\/span><em>([^<]*)<\/em>/g;
  let m;
  while ((m = re.exec(op))) {
    cards.push({ value: m[1], label: m[2], hint: m[3] });
  }
  return cards;
}

function kpiMainNumber(value) {
  const m = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

describe('測れていない 0 はサマリーに出さない', () => {
  const platforms = ['niconico', 'youtube', 'twitch', 'kick', 'twitcasting', 'showroom', 'mixch', 'abema', 'tiktok', 'whowatch'];

  it('どのサービスでも、測れていない 0 のカードは出さず、視聴者数の山があればそれを出す', () => {
    for (const platform of platforms) {
      const liveId = platform === 'niconico' ? 'lv123' : 'lv900000000001';
      const comments = commentsFor(platform, liveId);
      const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
        ...(platform === 'niconico' ? {} : { platform }),
        commentsForAnalytics: comments,
        contentKind: 'live',
        pageCount: 0,
        visitorCount: 0,
        pageFacts: { viewCount: 0, commentCount: 0 },
        sessionSummaryRows: [
          { liveId, capturedAt: T0, officialViewerCount: 2100, source: 'official' },
          { liveId, capturedAt: T0 + 10 * 60_000, officialViewerCount: 4975, source: 'official' },
        ],
      });
      const cards = operatorKpiCards(html);
      expect(cards.length, platform).toBeGreaterThan(0);
      for (const card of cards) {
        const n = kpiMainNumber(card.value);
        expect(n, `${platform} ${card.label}=${card.value}`).not.toBe(0);
        if (n != null) expect(n, `${platform} ${card.label}`).toBeGreaterThan(0);
        expect(card.label, platform).not.toBe('ページの数');
        expect(`${card.label}${card.hint}`, platform).not.toMatch(/^ページの数ページの表示$/);
      }
      expect(cards.some((c) => c.value === '4,975人' && /の山$/.test(c.label)), platform).toBe(true);
    }
  });

  it('測れているページの数（ABEMA など）は残し、測れていない 0 だけを隠す', () => {
    const liveId = 'lv900000000001';
    const comments = commentsFor('abema', liveId);
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, liveId), {
      platform: 'abema',
      commentsForAnalytics: comments,
      contentKind: 'live',
      pageCount: 1200,
      sessionSummaryRows: [
        { liveId, capturedAt: T0, officialViewerCount: 4975, source: 'official' },
      ],
    });
    const cards = operatorKpiCards(html);
    expect(cards.some((c) => c.label === '視聴数（ページの数）' && c.value === '1,200')).toBe(true);
    expect(cards.some((c) => /の山$/.test(c.label))).toBe(false);
    for (const card of cards) {
      const n = kpiMainNumber(card.value);
      expect(n).not.toBe(0);
    }
  });
});

