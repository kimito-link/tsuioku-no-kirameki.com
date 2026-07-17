import { describe, it, expect } from 'vitest';
import {
  buildMarketingDashboardHtml,
  buildAudienceParticipationLeadSectionHtml
} from './marketingChartsHtml.js';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { analyzeAudienceEngagementGap } from './audienceEngagementGap.js';

/** @returns {import('./marketingAggregate.js').MarketingReport} */
function minimal() {
  const base = Date.now() - 3_600_000;
  /** @type {import('./commentRecord.js').StoredComment[]} */
  const comments = [];
  for (let i = 0; i < 50; i++) {
    const minute = i % 30;
    const offsetInMin = minute * 60_000 + (i % 17) * 900;
    comments.push({
      id: `c${i}`,
      liveId: 'lv123',
      commentNo: String(2000 + i),
      text:
        i === 3
          ? 'see https://example.com/x 😀'
          : i % 11 === 0
            ? `link https://nico.jp/${i}`
            : `hello ${i}`,
      userId: i === 0 ? 'u1' : `u${(i % 10) + 1}`,
      nickname: i < 20 ? 'Alice' : '',
      avatarUrl: i === 1 ? 'https://example.com/av.jpg' : '',
      capturedAt: base + offsetInMin,
      vpos: i * 400,
      is184: i % 6 === 0,
      selfPosted: i === 0
    });
  }
  return aggregateMarketingReport(comments, 'lv123');
}

/** @param {Partial<import('./eventRankingReportModel.js').EventRankingReportModel>} [overrides] */
function eventRankingFixture(overrides = {}) {
  return {
    eventName: '5月病なんか銀河系まで飛んでいけ！',
    self: {
      rank: 2,
      score: 12345,
      diffToNext: 100,
      broadcasterName: '公開配信者Link'
    },
    rows: [
      {
        rank: 1,
        score: 23456,
        name: 'こん太Channel',
        isAnonymous: false,
        thumbnailUrl: 'https://example.test/konta.jpg',
        userId: '111'
      },
      {
        rank: 2,
        score: 12345,
        name: '公開配信者Link',
        isAnonymous: false,
        thumbnailUrl: 'data:image/png;base64,evil',
        userId: '222'
      }
    ],
    capturedAt: Date.now() - 30_000,
    ageMs: 30_000,
    isStale: false,
    ...overrides
  };
}

describe('buildMarketingDashboardHtml', () => {
  it('完全な HTML ドキュメントを返す', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lv123');
  });

  it('単独HTML内にセクション順次発表・音・スキップの演出を埋め込む', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('mkt-section-reveal-enabled');
    expect(html).toContain('id="mktRevealControl"');
    expect(html).toContain('id="mktRevealSoundBtn"');
    expect(html).toContain('id="mktRevealSkipBtn"');
    expect(html).toContain("document.querySelectorAll('.mkt-section')");
    expect(html).toContain('window.AudioContext');
    expect(html).toContain('createOscillator');
    expect(html).toContain('prefers-reduced-motion:reduce');
    expect(html).toContain('mkt-section--reveal');

    const revealBlock = html.slice(html.indexOf('id="mktRevealControl"'));
    expect(revealBlock).not.toContain('chrome.');
  });

  it('eventRanking opt が無いときはイベント順位セクションを出さない', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).not.toContain('id="mkt-event-ranking"');
    expect(html).not.toContain('<h2>🏆 イベント順位</h2>');
  });

  it('eventRanking opt があるとイベント名・本人順位・参加配信者TOPを出す', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      eventRanking: eventRankingFixture({ isStale: true })
    });
    expect(html).toContain('id="mkt-event-ranking"');
    expect(html).toContain('5月病なんか銀河系まで飛んでいけ！');
    expect(html).toContain('公開配信者Link');
    expect(html).toContain('2位');
    expect(html).toContain('12,345');
    expect(html).toContain('あと💎100 で 1位');
    expect(html).toContain('参加配信者TOP');
    expect(html).toContain('こん太Channel');
    expect(html).toContain('💎23,456');
    expect(html).toContain('少し前に取得した値');
  });

  it('eventRanking の data: サムネは落とし https サムネだけ残す', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      eventRanking: eventRankingFixture({
        eventName: '悪い<script>alert(1)</script>',
        rows: [
          {
            rank: 1,
            score: 50,
            name: '安全サムネ',
            isAnonymous: false,
            thumbnailUrl: 'https://example.test/safe.jpg'
          },
          {
            rank: 2,
            score: 40,
            name: '<b>危険サムネ</b>',
            isAnonymous: false,
            thumbnailUrl: 'data:image/png;base64,evil'
          }
        ]
      })
    });
    expect(html).toContain('https://example.test/safe.jpg');
    expect(html).not.toContain('data:image/png;base64,evil');
    expect(html).toContain('onerror="this.onerror=null;this.hidden=true"');
    expect(html).toContain('悪い&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;危険サムネ&lt;/b&gt;');
    expect(html).not.toContain('悪い<script>alert(1)</script>');
  });

  it('maskShareLabels=true でも公開イベントランキングの配信者名は伏せない', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      maskShareLabels: true,
      eventRanking: eventRankingFixture()
    });
    expect(html).toContain('共有向けに表示名を伏せた出力');
    expect(html).toContain('イベント順位は公開ランキング由来');
    expect(html).toContain('公開配信者Link');
    expect(html).toContain('こん太Channel');
    expect(html).toContain('https://example.test/konta.jpg');
  });

  it('KPI セクションが含まれる', () => {
    const r = minimal();
    const html = buildMarketingDashboardHtml(r);
    expect(html).toContain('KPI サマリ');
    expect(html).toContain(String(r.totalComments));
  });

  it('タイムラインの SVG が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('コメントタイムライン');
    expect(html).toContain('<svg');
    expect(html).toContain('<polyline');
  });

  it('セグメント円グラフが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('ユーザーセグメント');
    expect(html).toContain('ヘビー');
  });

  it('トップコメンターが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('トップコメンター');
    expect(html).toContain('Alice');
  });

  it('giftUsers を渡すとギフトの流れセクション（mkt-gift-flow）が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      giftUsers: [
        {
          userId: '88210441',
          nickname: 'ギフター',
          throwCount: 3,
          capturedAt: Date.now() - 60_000
        }
      ]
    });
    expect(html).toContain('id="mkt-gift-flow"');
    expect(html).toContain('ギフター');
    expect(html).toContain('ギフト前後');
  });

  it('giftEvents と保存履歴を渡すとギフト深掘りセクションが含まれる', () => {
    const base = Date.now() - 900_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'g1', liveId: 'lv123', commentNo: '1', text: 'わこつ', userId: 'u1', nickname: '静かな支援者', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'g2', liveId: 'lv123', commentNo: '2', text: 'ナイス', userId: 'u2', nickname: '見る人', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'g3', liveId: 'lv123', commentNo: '3', text: 'ありがとう 8888', userId: 'u3', nickname: '見る人2', capturedAt: base + 230_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'g4', liveId: 'lv123', commentNo: '4', text: 'ありがとう 最高', userId: 'u4', nickname: '見る人3', capturedAt: base + 240_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      giftEvents: [
        {
          userId: 'u1',
          nickname: '静かな支援者',
          itemId: 'gift1',
          itemName: '花束',
          point: 1200,
          message: '',
          contributionRank: 1,
          capturedAt: base + 180_000
        }
      ],
      giftHistoryThrows: [
        {
          userId: 'u1',
          nickname: '静かな支援者',
          throwCount: 2,
          totalPoints: 1200,
          capturedAt: base + 180_000
        }
      ],
      officialEventDomBundle: /** @type {any} */ ({
        programStats: { giftPoints: 2400 },
        contributionRanking: [
          { rank: 1, name: '静かな支援者', contribution: 1200, isAnonymous: false }
        ]
      })
    });

    expect(html).toContain('id="mkt-gift-deep"');
    expect(html).toContain('ギフト深掘り');
    expect(html).toContain('たくさんギフトが飛ぶ人の傾向');
    expect(html).toContain('ギフトが飛んだタイミング');
    expect(html).toContain('静かな支援者');
    expect(html).toContain('ランキング上位の応援者');
    expect(html).toContain('開始から約3分');
    expect(html).toContain('data-label="送り主"');
    expect(html).toContain('@media(max-width:560px)');
  });

  it('ギフト sub-app 履歴を渡すと投げ履歴セクション（誰が・何を・いくら）が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      giftSubAppHistory: {
        history: [
          {
            itemName: '提灯',
            senderName: '名無し',
            points: 10,
            time: '2:45:10',
            thumbnailUrl: 'https://example.com/item.png'
          },
          {
            itemName: '提灯',
            senderName: '応援さん',
            points: 30,
            time: '2:30:33'
          }
        ],
        totalCounts: [{ itemName: '提灯', count: 5, thumbnailUrl: 'https://example.com/item.png' }]
      }
    });
    expect(html).toContain('id="mkt-gift-ledger"');
    expect(html).toContain('ギフト投げ履歴');
    expect(html).toContain('誰が・何を・いくら');
    expect(html).toContain('名無し');
    expect(html).toContain('提灯');
    expect(html).toContain('2:45:10');
    expect(html).toContain('×5');
    expect(html).toContain('data-label="アイテム"');
    expect(html).toContain('送り主別（誰が・何を・合計いくら）');
    expect(html).toContain('送り主別 pt（グラフ）');
    expect(html).toContain('アイテム別 pt（グラフ）');
    expect(html).toContain('mkt-gift-chart-table');
    expect(html).toContain('応援さん');
    expect(html).toContain('送り主 2 名');
    expect(html).toContain('data-label="サムネ"');
    expect(html).toContain('data-label="アカウント"');
    expect(html).toContain('data-label="ID"');
    expect(html).toContain('mkt-gift-ledger-item__thumb');
    expect(html).toContain('example.com/item.png');
    expect(html).toContain('取得できたサムネ');
  });

  it('koken API 形式の giftSubAppHistory で投げ履歴に koken 出典が出る', () => {
    const html = buildMarketingDashboardHtml(minimal(), {
      giftSubAppHistory: {
        source: 'koken-api',
        history: [
          {
            itemName: 'わこちゅ',
            senderName: 'spspspspsp',
            points: 300,
            time: '1:51:41',
            userId: '1532216'
          }
        ],
        totalCounts: [{ itemName: 'わこちゅ', count: 1 }]
      }
    });
    expect(html).toContain('koken 公式 API');
    expect(html).toContain('koken API');
    expect(html).toContain('わこちゅ');
    expect(html).toContain('spspspspsp');
    expect(html).toContain('1532216');
    expect(html).toContain('data-label="アカウント"');
  });

  it('コメント・ギフト・広告から応援者ちくらんβセクションを出す', () => {
    const base = Date.now() - 600_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'sc1', liveId: 'lv123', commentNo: '1', text: 'わこつ', userId: '88210441', nickname: '応援リーダー', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'sc2', liveId: 'lv123', commentNo: '2', text: '8888', userId: '88210441', nickname: '応援リーダー', capturedAt: base + 120_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'sc3', liveId: 'lv123', commentNo: '3', text: '広告しました', userId: '900001', nickname: '広告の人', capturedAt: base + 180_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'sc4', liveId: 'lv123', commentNo: '4', text: '配信者コメント', userId: '55555', nickname: '配信者本人', capturedAt: base + 240_000, vpos: 0, is184: false, selfPosted: true },
      { id: 'sc5', liveId: 'lv123', commentNo: '5', text: '匿名応援', userId: '', nickname: '匿名', capturedAt: base + 300_000, vpos: 0, is184: true, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      broadcasterUserId: '55555',
      giftEvents: [
        {
          userId: '88210441',
          nickname: '応援リーダー',
          itemId: 'gift-a',
          itemName: '花束',
          point: 500,
          capturedAt: base + 260_000
        }
      ],
      giftHistoryThrows: [
        {
          userId: '88210441',
          nickname: '応援リーダー',
          throwCount: 2,
          totalPoints: 800,
          capturedAt: base + 260_000
        }
      ],
      officialEventDomBundle: /** @type {any} */ ({
        adContributionRanking: [
          { userId: '900001', name: '広告の人', contribution: 1200 }
        ]
      })
    });
    const section = html.match(/<section class="mkt-section mkt-section--supporter-chikuran"[\s\S]*?<\/section>/)?.[0] || '';
    expect(section).toContain('id="mkt-supporter-chikuran"');
    expect(section).toContain('応援者ちくらん β');
    expect(section).toContain('公式順位ではありません');
    expect(section).toContain('応援リーダー');
    expect(section).toContain('href="https://www.nicovideo.jp/user/88210441"');
    expect(section).toContain('data-label="応援者"');
    expect(section).toContain('data-label="ローカル勢い"');
    expect(section).toContain('ギフト貢献度');
    expect(section).toContain('広告');
    expect(section).not.toContain('配信者本人');
    expect(html).toContain('応援者ちくらんβ');
    expect(html).toContain('.mkt-supporter-table');
  });

  it('共有伏せ字では応援者ちくらんβの実名リンクとサムネを出さない', () => {
    const base = Date.now() - 600_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'sm1', liveId: 'lv123', commentNo: '1', text: 'わこつ', userId: '88210441', nickname: '応援リーダー', avatarUrl: 'https://example.test/avatar.jpg', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'sm2', liveId: 'lv123', commentNo: '2', text: '8888', userId: '88210441', nickname: '応援リーダー', avatarUrl: 'https://example.test/avatar.jpg', capturedAt: base + 120_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      maskShareLabels: true,
      giftEvents: [
        {
          userId: '88210441',
          nickname: '応援リーダー',
          itemId: 'gift-a',
          itemName: '花束',
          point: 500,
          capturedAt: base + 260_000
        }
      ]
    });
    const section = html.match(/<section class="mkt-section mkt-section--supporter-chikuran"[\s\S]*?<\/section>/)?.[0] || '';
    expect(section).toContain('id="mkt-supporter-chikuran"');
    expect(section).not.toContain('href="https://www.nicovideo.jp/user/88210441"');
    expect(section).not.toContain('応援リーダー');
    expect(section).not.toContain('https://example.test/avatar.jpg');
  });

  it('多種類の入力データからマーケ総合サマリを出す', () => {
    const base = Date.now() - 1_200_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'md1', liveId: 'lv123', commentNo: '1', text: 'わこつ 最高', userId: '88210441', nickname: '応援リーダー', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'md2', liveId: 'lv123', commentNo: '2', text: '8888', userId: '88210441', nickname: '応援リーダー', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'md3', liveId: 'lv123', commentNo: '3', text: '広告しました', userId: '900001', nickname: '広告の人', capturedAt: base + 120_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'md4', liveId: 'lv123', commentNo: '4', text: 'ギフトだ', userId: '900002', nickname: 'ギフトの人', capturedAt: base + 180_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      sessionSummaryRows: [
        { liveId: 'lv123', capturedAt: base, viewerCountFromDom: 400, officialCommentCount: 10 },
        { liveId: 'lv123', capturedAt: base + 300_000, viewerCountFromDom: 1200, officialCommentCount: 80 }
      ],
      pastBroadcasts: [
        { liveId: 'lv122', comments: comments.slice(0, 2) }
      ],
      giftUsers: [
        { userId: '88210441', nickname: '応援リーダー', throwCount: 2, capturedAt: base + 240_000 }
      ],
      giftEvents: [
        { userId: '88210441', nickname: '応援リーダー', itemId: 'gift-a', itemName: '花束', point: 500, capturedAt: base + 240_000 },
        { userId: '900002', nickname: 'ギフトの人', itemId: 'gift-b', itemName: 'クラッカー', point: 300, capturedAt: base + 360_000 }
      ],
      giftHistoryThrows: [
        { userId: '88210441', nickname: '応援リーダー', throwCount: 2, totalPoints: 500, capturedAt: base + 240_000 }
      ],
      officialEventDomBundle: /** @type {any} */ ({
        programStats: { watchCount: 1500, commentCount: 90, giftPoints: 900 },
        giftHistory: [
          { advertiserName: '応援リーダー', giftName: '花束', point: 500, time: '00:04' }
        ],
        contributionRanking: [
          { userId: '88210441', name: '応援リーダー', contribution: 500 }
        ],
        adContributionRanking: [
          { userId: '900001', name: '広告の人', contribution: 1200 }
        ]
      }),
      eventRanking: eventRankingFixture()
    });
    const section = html.match(/<section class="mkt-section mkt-section--data-summary"[\s\S]*?<\/section>/)?.[0] || '';
    expect(section).toContain('id="mkt-data-summary"');
    expect(section).toContain('マーケ総合サマリ');
    expect(section).toContain('10/10');
    expect(section).toContain('来場・公式コメント');
    expect(section).toContain('ギフト送信者・イベント');
    expect(section).toContain('ニコニ広告');
    expect(section).toContain('応援者ちくらんβ');
    expect(section).toContain('イベント順位');
    expect(section).toContain('花束');
    expect(section).toContain('クラッカー');
    expect(section).toContain('data-label="領域"');
    expect(section).toContain('data-label="データ"');
    expect(html).toContain('マーケ総合サマリ');
    expect(html).toContain('.mkt-data-matrix');
    const funnel = html.match(/<section class="mkt-section mkt-section--funnel"[\s\S]*?<\/section>/)?.[0] || '';
    expect(funnel).toContain('id="mkt-marketing-funnel"');
    expect(funnel).toContain('マーケファネル');
    expect(funnel).toContain('来場から支援までの流れ');
    expect(funnel).toContain('優先度ボード');
    expect(funnel).toContain('データ診断');
    expect(funnel).toContain('来場→発言');
    expect(funnel).toContain('応援者→ギフト');
    expect(funnel).toContain('ギフト後の反応');
    expect(funnel).toContain('data-label="前段比"');
    expect(funnel).toContain('時系列サンプル');
    expect(html).toContain('.mkt-funnel-table');
    const segmentAction = html.match(/<section class="mkt-section mkt-section--segment-action"[\s\S]*?<\/section>/)?.[0] || '';
    expect(segmentAction).toContain('id="mkt-segment-action"');
    expect(segmentAction).toContain('層別マーケ診断');
    expect(segmentAction).toContain('ヘビー・中間');
    expect(segmentAction).toContain('一見・ライト');
    expect(segmentAction).toContain('匿名コメント');
    expect(segmentAction).toContain('応援の重なり');
    expect(segmentAction).toContain('data-label="層"');
    expect(segmentAction).toContain('ギフト主導');
    expect(html).toContain('.mkt-segment-action-table');
    const skills = html.match(/<section class="mkt-section mkt-section--analysis-skills"[\s\S]*?<\/section>/)?.[0] || '';
    expect(skills).toContain('id="mkt-analysis-skills"');
    expect(skills).toContain('分析スキルボード');
    expect(skills).toContain('Build');
    expect(skills).toContain('Run');
    expect(skills).toContain('Diagnose');
    expect(skills).toContain('必要時だけ');
    expect(skills).toContain('応援者ちくらんβ');
    expect(skills).toContain('ギフト深掘り');
    expect(skills).toContain('data-label="スキル"');
    expect(html).toContain('.mkt-skill-table');
    const harness = html.match(/<section class="mkt-section mkt-section--harness"[\s\S]*?<\/section>/)?.[0] || '';
    expect(harness).toContain('id="mkt-harness-scaling"');
    expect(harness).toContain('分析ハーネス設計');
    expect(harness).toContain('System scaling');
    expect(harness).toContain('記憶基盤');
    expect(harness).toContain('動的コンテキスト');
    expect(harness).toContain('スキルルーティング');
    expect(harness).toContain('検証・ガバナンス');
    expect(harness).toContain('信頼性ゲート');
    expect(harness).toContain('data-label="層"');
    expect(harness).toContain('data-label="ゲート"');
    expect(html).toContain('.mkt-harness-layer-table');
  });

  it('目次直下に来場とコメント参加の先頭ブロックを出す', () => {
    const base = Date.now() - 900_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'a1', liveId: 'lv123', commentNo: '1', text: 'わこつ', userId: 'u1', nickname: 'A', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'a2', liveId: 'lv123', commentNo: '2', text: '8888', userId: 'u2', nickname: 'B', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      sessionSummaryRows: [
        { liveId: 'lv123', capturedAt: base, viewerCountFromDom: 500, officialCommentCount: 2 }
      ],
      officialEventDomBundle: /** @type {any} */ ({
        programStats: { watchCount: 1000, commentCount: 10 }
      })
    });
    expect(html).toContain('id="mkt-participation-lead"');
    expect(html).toContain('来場と応援参加');
    expect(html).toContain('来場 1,000 人');
    expect(html).toContain('アイテムを投げた人');
    expect(html).toContain('広告をした人');
    expect(html.indexOf('mkt-participation-lead')).toBeLessThan(html.indexOf('mkt-analysis-skills'));
  });

  it('buildAudienceParticipationLeadSectionHtml は HTML レポート向けに詳細リンクを省略できる', () => {
    const base = Date.now() - 900_000;
    const comments = [
      { id: 'a1', liveId: 'lv123', commentNo: '1', text: 'hi', userId: 'u1', nickname: 'A', capturedAt: base, vpos: 0, is184: false, selfPosted: false }
    ];
    const report = aggregateMarketingReport(comments, 'lv123');
    const html = buildAudienceParticipationLeadSectionHtml(
      analyzeAudienceEngagementGap(
        {
          liveId: 'lv123',
          comments,
          visitorCount: 500,
          officialCommentCount: 1
        },
        { liveId: 'lv123' }
      ),
      report,
      { sectionId: 'sec-participation-lead', showDetailLink: false, extraSectionClass: 'card' }
    );
    expect(html).toContain('id="sec-participation-lead"');
    expect(html).toContain('card mkt-section');
    expect(html).not.toContain('mkt-audience-gap');
  });

  it('来場未取得でも先頭ブロックにコメント人数と案内を出す', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('id="mkt-participation-lead"');
    expect(html).toContain('来場者数');
    expect(html).toContain('未取得');
    expect(html).toContain('コメントした人');
    expect(html).toContain('アイテムを投げた人');
    expect(html).toContain('広告をした人');
  });

  it('公式来場者数があると来場→コメント変換率セクションを出す', () => {
    const base = Date.now() - 900_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'a1', liveId: 'lv123', commentNo: '1', text: 'わこつ', userId: 'u1', nickname: 'A', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'a2', liveId: 'lv123', commentNo: '2', text: '8888', userId: 'u2', nickname: 'B', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'a3', liveId: 'lv123', commentNo: '3', text: 'ナイス', userId: 'u3', nickname: 'C', capturedAt: base + 120_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      sessionSummaryRows: [
        { liveId: 'lv123', capturedAt: base, viewerCountFromDom: 300, officialCommentCount: 3 },
        { liveId: 'lv123', capturedAt: base + 300_000, viewerCountFromDom: 900, officialCommentCount: 20 }
      ],
      officialEventDomBundle: /** @type {any} */ ({
        programStats: { watchCount: 1200, commentCount: 24 }
      })
    });

    expect(html).toContain('id="mkt-audience-gap"');
    expect(html).toContain('来場→コメント変換率');
    expect(html).toContain('静かな観客');
    expect(html).toContain('100人あたりコメント');
    expect(html).toContain('来場が増えたのに静かだった時間');
    expect(html).toContain('data-label="来場増"');
  });

  it('トップコメンターの数値 ID は niconico ユーザーページへのリンクで包まれる（手元用）', () => {
    // minimal() の user u1..u10 は数値でないため、リンク化されない。
    // 数値 ID を持つレポートを作って挙動を確認する。
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '88210441',
        nickname: 'のら',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
    expect(html).toContain('href="https://www.nicovideo.jp/user/88210441"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // displayUserLabel により「のら（88210441）」形式で表示されリンクで包まれる。
    expect(html).toContain('>のら（88210441）</a>');
  });

  it('複数の匿名 (a:xxxx) ユーザーを TOP に載せると、shortId 付きラベルで識別できる', () => {
    // 旧実装は `nickname || userId` だけだったため、nickname='匿名' が複数人並ぶと
    // ランキング上で見分けが付かなかった。displayUserLabel を通して
    // 「匿名（<shortId>）」形になり、ユーザごとに区別できる。
    // shortUserKeyDisplay は 18 文字までは丸ごと出す（a:XXX…YYY に切るのは 19 文字以上）。
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'a1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hi',
        userId: 'a:AbCdEfGhIjKlMnOp',
        nickname: '匿名',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      },
      {
        id: 'a2',
        liveId: 'lv123',
        commentNo: '2',
        text: 'hi',
        userId: 'a:ZyWvUtSrQpOnMlKj',
        nickname: '匿名',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
    // 2 人とも nickname は「匿名」だが、ラベルに shortId が付くので識別できる。
    // a:AbCdEfGhIjKlMnOp はちょうど 18 文字なのでそのまま表示される。
    expect(html).toContain('匿名（a:AbCdEfGhIjKlMnOp）');
    expect(html).toContain('匿名（a:ZyWvUtSrQpOnMlKj）');
    // リンクにはなっていない（匿名はプロフィールページが無い）
    expect(html).not.toContain('href="https://www.nicovideo.jp/user/a:');
  });

  it('maskShareLabels のときはトップコメンター名をリンクにしない（共有配慮）', () => {
    // 伏せ字名をリンクで包むと、リンク先（/user/<uid>）から本人を特定できて台無しになる。
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '88210441',
        nickname: 'のら',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      { maskShareLabels: true }
    );
    expect(html).not.toContain('href="https://www.nicovideo.jp/user/88210441"');
  });

  it('時間帯ヒートマップが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('時間帯ヒートマップ');
    expect(html).toContain('mkt-hour');
  });

  it('XSS: liveId にタグが入ってもエスケープされる', () => {
    const r = minimal();
    r.liveId = '<script>alert(1)</script>';
    const html = buildMarketingDashboardHtml(r);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('りんく・こん太・たぬ姉の案内ブロックが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('りんく・こん太・たぬ姉から');
    expect(html).toContain('mkt-advice--tanu');
    expect(html).toContain('mkt-advice--link');
    expect(html).toContain('mkt-advice--konta');
    expect(html).toContain('mkt-advice-row');
    expect(html).toContain('mkt-advice__bubble');
    expect(html).toContain('mkt-advice__avatar');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('追憶のきらめき');
  });

  it('冒頭案内にりんく・こん太・たぬ姉の吹き出しが各1つずつ', () => {
    const html = buildMarketingDashboardHtml(minimal());
    const sectionMatch = html.match(
      /<section class="mkt-section mkt-section--advice"[\s\S]*?<\/section>/
    );
    expect(sectionMatch).toBeTruthy();
    const introBlock = String(sectionMatch?.[0] || '');
    // v0.1.475: adviceCard が <details> 構造になったため mkt-advice--role は details タグに付く
    expect((introBlock.match(/mkt-advice-details mkt-advice--link/g) || []).length).toBe(1);
    expect((introBlock.match(/mkt-advice-details mkt-advice--konta/g) || []).length).toBe(1);
    expect((introBlock.match(/mkt-advice-details mkt-advice--tanu/g) || []).length).toBe(1);
  });

  it('機能一覧とスタイル否定しない文言・分析メモの案内が含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('このページでできること');
    expect(html).toContain('mkt-section--features');
    expect(html).toContain('分析メモ');
    expect(html).toContain('どんな配信も否定しません');
    expect(html).toContain('縛られる必要もありません');
  });

  it('maskShareLabels でトップコメンター名が伏せ字になり example.com のサムネURLが出ない', () => {
    const html = buildMarketingDashboardHtml(minimal(), { maskShareLabels: true });
    expect(html).toContain('共有向けに表示名を伏せた出力');
    expect(html).not.toContain('Alice');
    expect(html).toContain('A•••');
    expect(html).not.toContain('example.com');
  });

  it('本文・属性・累積・vpos のセクションが含まれる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('コメント本文・属性の傾向');
    expect(html).toContain('累積コメント数と5分窓');
    expect(html).toContain('再生位置（vpos）の三分割');
    expect(html).toContain('自分投稿（selfPosted）');
    expect(html).toContain('184（既知のみ）');
  });

  it('commentsForAnalytics があると配信内容の流れを時間帯別に出す', () => {
    const base = Date.now() - 1_000_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'n1', liveId: 'lv123', commentNo: '1', text: 'わこつ 初見です', userId: 'u1', nickname: '', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'n2', liveId: 'lv123', commentNo: '2', text: '今日も楽しい', userId: 'u2', nickname: '', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n3', liveId: 'lv123', commentNo: '3', text: 'ゲーム展開がすごい', userId: 'u3', nickname: '', capturedAt: base + 360_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n4', liveId: 'lv123', commentNo: '4', text: 'ナイス ナイス', userId: 'u4', nickname: '', capturedAt: base + 420_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n5', liveId: 'lv123', commentNo: '5', text: '8888 おめでとう', userId: 'u5', nickname: '', capturedAt: base + 780_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'n6', liveId: 'lv123', commentNo: '6', text: 'ありがとう 最高', userId: 'u6', nickname: '', capturedAt: base + 840_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments
    });
    expect(html).toContain('id="mkt-narrative"');
    expect(html).toContain('配信内容の流れ');
    expect(html).toContain('冒頭');
    expect(html).toContain('中盤');
    expect(html).toContain('終盤');
    expect(html).toContain('初見');
    expect(html).toContain('8888 おめでとう');
  });

  it('maskShareLabels の配信内容の流れでは代表コメント本文を省略する', () => {
    const base = Date.now() - 1_000_000;
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      { id: 'm1', liveId: 'lv123', commentNo: '1', text: '秘密の代表コメント 初見', userId: 'u1', nickname: '', capturedAt: base, vpos: 0, is184: false, selfPosted: false },
      { id: 'm2', liveId: 'lv123', commentNo: '2', text: '最高', userId: 'u2', nickname: '', capturedAt: base + 60_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm3', liveId: 'lv123', commentNo: '3', text: 'ナイス', userId: 'u3', nickname: '', capturedAt: base + 120_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm4', liveId: 'lv123', commentNo: '4', text: '8888', userId: 'u4', nickname: '', capturedAt: base + 180_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm5', liveId: 'lv123', commentNo: '5', text: 'ありがとう', userId: 'u5', nickname: '', capturedAt: base + 240_000, vpos: 0, is184: false, selfPosted: false },
      { id: 'm6', liveId: 'lv123', commentNo: '6', text: 'おつ', userId: 'u6', nickname: '', capturedAt: base + 300_000, vpos: 0, is184: false, selfPosted: false }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'), {
      commentsForAnalytics: comments,
      maskShareLabels: true
    });
    expect(html).toContain('共有向け出力では話題語と代表コメント本文を省略');
    const section = html.match(/<section id="mkt-narrative"[\s\S]*?<\/section>/)?.[0] || '';
    expect(section).not.toContain('秘密の代表コメント');
  });

  it('末尾に nl-marketing-export-v1 の JSON が埋め込まれパースできる', () => {
    const html = buildMarketingDashboardHtml(minimal());
    expect(html).toContain('id="nl-marketing-export-v1"');
    const m = html.match(/id="nl-marketing-export-v1">([\s\S]*?)<\/script>/);
    expect(m, 'script 内 JSON').toBeTruthy();
    const p = JSON.parse(/** @type {string} */ (m?.[1]));
    expect(p.schemaVersion).toBe(1);
    expect(p.report.totalComments).toBeGreaterThan(0);
    expect(p.report.quarterEngagement).toBeDefined();
  });

  it('maskShareLabels 時は埋め込み JSON のトップユーザー名が伏せ字になる', () => {
    const html = buildMarketingDashboardHtml(minimal(), { maskShareLabels: true });
    const m = html.match(/id="nl-marketing-export-v1">([\s\S]*?)<\/script>/);
    expect(m).toBeTruthy();
    const p = JSON.parse(/** @type {string} */ (m?.[1]));
    const nick = String(p.report.topUsers[0]?.nickname || '');
    expect(nick).not.toContain('Alice');
    expect(nick.length).toBeGreaterThan(0);
  });

  /*
   * 0.1.12 (F1/F3) — 「最低サムネ」と「サムネ付きユーザー一覧」の追加。
   * - sectionTopUsers: avatarUrl 無しの数値 ID にニコ既定 CDN URL を当てる、
   *   匿名 a:... には identiconResolver を呼ぶ。
   * - sectionUsersWithThumbnails: 解決できたユーザーをグリッド表示。共有伏せ字は出さない。
   */
  it('数値 ID に avatarUrl 無しなら、ニコ既定 user icon CDN URL を最低サムネとして当てる', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '4046119',
        nickname: '配信者応援ちゃんねる',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
    expect(html).toContain(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/404/4046119.jpg'
    );
    // ランキング表とサムネ付き一覧の両方に出る
    expect(html).toContain('class="mkt-rank-av"');
    expect(html).toContain('mkt-section--thumb-grid');
    expect(html).toContain('class="mkt-thumb-grid__avatar"');
    expect(html).toContain(
      'onerror="this.onerror=null;this.src=\'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg\'"'
    );
  });

  it('匿名 a: には identiconResolver の戻りを最低サムネとして当てる', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'a1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hi',
        userId: 'a:qkmBBq0GJKpVURQb',
        nickname: '匿名',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      {
        anonymousIdenticonResolver: (uid) =>
          `data:image/svg+xml;utf8,<svg data-uid="${uid}"/>`
      }
    );
    expect(html).toContain('data-uid=&quot;a:qkmBBq0GJKpVURQb&quot;');
    expect(html).toContain('mkt-section--thumb-grid');
  });

  it('avatarUrl が http/https ならそれを優先（identiconResolver より優先）', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'a1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hi',
        userId: 'a:abcdefghij',
        nickname: '匿名',
        avatarUrl: 'https://example.test/real-avatar.jpg',
        capturedAt: Date.now(),
        vpos: 0,
        is184: true,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      {
        anonymousIdenticonResolver: () => 'data:image/svg+xml,<svg/>'
      }
    );
    expect(html).toContain('https://example.test/real-avatar.jpg');
    expect(html).not.toContain('data:image/svg+xml,<svg/>');
  });

  it('maskShareLabels=true のときは「サムネ付きユーザー一覧」セクションを出さない', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '4046119',
        nickname: 'のら',
        avatarUrl: '',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      { maskShareLabels: true }
    );
    // CSS の class 名は <style> ブロックに常時含まれるので、section 要素そのものが
    // レンダリングされていないかをチェックする（aria-label 文言は section 内にしか出ない）。
    expect(html).not.toContain('aria-label="サムネ付きユーザー一覧"');
    expect(html).not.toContain('<h2>サムネ付きユーザー一覧</h2>');
    expect(html).not.toContain('class="mkt-thumb-grid__cell"');
  });

  it('maskShareLabels=true は sectionTopUsers でも avatar 画像を出さない（識別補助しない）', () => {
    /** @type {import('./commentRecord.js').StoredComment[]} */
    const comments = [
      {
        id: 'x1',
        liveId: 'lv123',
        commentNo: '1',
        text: 'hello',
        userId: '4046119',
        nickname: 'のら',
        avatarUrl: 'https://example.test/real-avatar.jpg',
        capturedAt: Date.now(),
        vpos: 0,
        is184: false,
        selfPosted: false
      }
    ];
    const html = buildMarketingDashboardHtml(
      aggregateMarketingReport(comments, 'lv123'),
      { maskShareLabels: true }
    );
    expect(html).toContain('mkt-rank-av--empty');
    expect(html).not.toContain('https://example.test/real-avatar.jpg');
    expect(html).not.toContain('https://secure-dcdn.cdn.nimg.jp/nicoaccount/');
  });

  it('興味タグ来場システムコメがあると専用セクションを出す', () => {
    const base = Date.now() - 600_000;
    const comments = [
      {
        id: 'ia1',
        liveId: 'lv123',
        commentNo: '100',
        text: '「料理」が好きな1人が来場しました',
        userId: null,
        capturedAt: base
      },
      {
        id: 'ia2',
        liveId: 'lv123',
        commentNo: '101',
        text: '「雑談」が好きな2人が来場しました',
        userId: null,
        capturedAt: base + 60_000
      },
      {
        id: 'u1',
        liveId: 'lv123',
        commentNo: '102',
        text: '通常コメント',
        userId: 'u1',
        capturedAt: base + 120_000
      }
    ];
    const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
    expect(html).toContain('id="mkt-interest-arrival"');
    expect(html).toContain('興味タグ別来場（公式システムコメ）');
    expect(html).toContain('ニコ公式の集計通知');
    expect(html).toContain('料理');
    expect(html).toContain('雑談');
    expect(html).toContain('来場人数（合算）');
  });

  describe('v0.1.611 Phase 3-A: 応援者パワー診断セクション', () => {
    it('数値ID コメンターがいるなら応援者パワー診断セクションが出る', () => {
      const base = Date.parse('2024-01-01T00:00:00Z');
      /** @type {import('./commentRecord.js').StoredComment[]} */
      const comments = [];
      // 数値 ID コメンター 6 名(smallSample mode で動く・5 名以上)
      for (let uid = 1; uid <= 6; uid += 1) {
        for (let i = 0; i < uid * 2; i += 1) {
          comments.push({
            id: `c-${uid}-${i}`,
            liveId: 'lv123',
            commentNo: String(uid * 100 + i),
            text: `コメ${uid}`,
            userId: String(uid),
            capturedAt: base + (uid * 1000 + i) * 1000
          });
        }
      }
      const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
      expect(html).toContain('id="mkt-supporter-power"');
      expect(html).toContain('応援者パワー診断');
      expect(html).toContain('mkt-spd-badge');
      expect(html).toContain('mkt-spd-tier-table');
      expect(html).toContain('mkt-spd-top-table');
      // 説明: 重み付けの示唆
      expect(html).toContain('応援量45%');
    });

    it('TOC に応援者パワー診断のリンクが含まれる', () => {
      const base = Date.parse('2024-01-01T00:00:00Z');
      /** @type {import('./commentRecord.js').StoredComment[]} */
      const comments = [];
      for (let uid = 1; uid <= 5; uid += 1) {
        comments.push({
          id: `c-${uid}`,
          liveId: 'lv123',
          commentNo: String(uid),
          text: 'x',
          userId: String(uid),
          capturedAt: base + uid * 1000
        });
      }
      const html = buildMarketingDashboardHtml(aggregateMarketingReport(comments, 'lv123'));
      expect(html).toContain('応援者パワー診断（S/A/B/C/D/E）');
    });

    describe('v0.1.612: サムネ + nicovideo.jp/user リンク', () => {
      /** @returns {import('./marketingAggregate.js').MarketingReport} */
      function makeReport() {
        const base = Date.parse('2024-01-01T00:00:00Z');
        /** @type {import('./commentRecord.js').StoredComment[]} */
        const comments = [];
        for (let uid = 1; uid <= 6; uid += 1) {
          for (let i = 0; i < uid * 2; i += 1) {
            comments.push({
              id: `c-${uid}-${i}`,
              liveId: 'lv123',
              commentNo: String(uid * 100 + i),
              text: 'x',
              userId: String(uid),
              avatarUrl: uid === 1 ? 'https://example.com/av.jpg' : '',
              capturedAt: base + (uid * 1000 + i) * 1000
            });
          }
        }
        return aggregateMarketingReport(comments, 'lv123');
      }

      it('応援者パワー診断の表に <a class="mkt-spd-user-link"> が含まれる(数値uid 名前リンク)', () => {
        const html = buildMarketingDashboardHtml(makeReport());
        expect(html).toContain('mkt-spd-user-link');
        // nicovideo.jp/user リンクが少なくとも 1 つ応援者パワー診断セクションに含まれる
        const spdSection = html.split('id="mkt-supporter-power"')[1] || '';
        expect(spdSection).toContain('https://www.nicovideo.jp/user/');
      });

      it('応援者パワー診断の表にサムネ class が含まれる', () => {
        const html = buildMarketingDashboardHtml(makeReport());
        expect(html).toContain('mkt-spd-thumb');
      });

      it('avatarUrl がある人は <img> でサムネが出る', () => {
        const html = buildMarketingDashboardHtml(makeReport());
        // 応援者パワー診断セクション内に <img class="mkt-spd-thumb" がある
        const spdSection = html.split('id="mkt-supporter-power"')[1] || '';
        expect(spdSection).toContain('mkt-spd-thumb');
      });

      it('表ヘッダに「サムネ」列が含まれる', () => {
        const html = buildMarketingDashboardHtml(makeReport());
        const spdSection = html.split('id="mkt-supporter-power"')[1] || '';
        expect(spdSection).toMatch(/<th>サムネ<\/th>/);
      });
    });
  });
});
