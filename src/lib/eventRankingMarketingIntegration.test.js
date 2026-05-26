import { describe, it, expect } from 'vitest';
import { buildEventRankingReportModel } from './eventRankingReportModel.js';
import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';
import { aggregateMarketingReport } from './marketingAggregate.js';

/**
 * Phase C 接続テスト（2026-05-26・会議）。
 *
 * popup-entry の marketing 書き出し callsite は、storage `nls_event_score_ranking_<lv>` の
 * 生データ →（Claude 正本）`buildEventRankingReportModel` →（codex）
 * `buildMarketingDashboardHtml({ eventRanking })` の順で渡す。
 *
 * このテストは「正本 model の出力形」と「marketing レンダラが期待する opts 形」が
 * 食い違わない（contract drift しない）ことを、両方の実関数を通して固定する。
 * （DOM/dev パネルを起動せず seam だけを検証＝実拡張 e2e の補完）
 */

const NOW = 1_700_000_000_000;

/** content-entry が storage に書く生データの形（selfStatus + rows + capturedAt）。 */
function rawEventStorage() {
  return {
    rows: [
      {
        rank: 1,
        score: 4_965_200,
        name: 'あめ',
        isAnonymous: false,
        thumbnailUrl: 'https://example.test/ame.jpg'
      },
      {
        // 非httpサムネは正本 model 側で空に倒る → marketing にも出ない
        rank: 2,
        score: 3_452_500,
        name: 'この',
        isAnonymous: false,
        thumbnailUrl: 'data:image/png;base64,AAAA'
      },
      {
        rank: 3,
        score: 2_825_600,
        name: 'ぴとな',
        isAnonymous: false,
        thumbnailUrl: ''
      }
    ],
    selfStatus: {
      rank: 2,
      score: 3_452_500,
      diffToNext: 1_512_700,
      eventName: '5月病なんか銀河系まで飛んでいけ！',
      broadcasterName: 'この'
    },
    capturedAt: NOW - 1000,
    liveId: 'lv888888888'
  };
}

/** marketing レンダラに渡す有効な MarketingReport を実 aggregator で組む。 */
function realReport() {
  const base = NOW - 3_600_000;
  /** @type {import('./commentRecord.js').StoredComment[]} */
  const comments = [];
  for (let i = 0; i < 30; i++) {
    comments.push({
      id: `c${i}`,
      liveId: 'lv888888888',
      commentNo: String(1000 + i),
      text: `hello ${i}`,
      userId: `u${(i % 8) + 1}`,
      nickname: i < 10 ? 'Alice' : '',
      avatarUrl: '',
      capturedAt: base + i * 60_000,
      vpos: i * 400,
      is184: i % 5 === 0,
      selfPosted: false
    });
  }
  return aggregateMarketingReport(comments, 'lv888888888');
}

describe('イベント順位: 正本 model → marketing レンダラ の接続', () => {
  it('生 storage → buildEventRankingReportModel → buildMarketingDashboardHtml でセクションが出る', () => {
    const model = buildEventRankingReportModel(rawEventStorage(), { nowMs: NOW });
    expect(model, '正本 model が生成される').not.toBeNull();

    const html = buildMarketingDashboardHtml(realReport(), { eventRanking: model });

    // セクション + TOC が出る。
    expect(html).toContain('id="mkt-event-ranking"');
    expect(html).toContain('🏆 イベント順位');
    // イベント名・本人順位・差・TOP行。
    expect(html).toContain('5月病なんか銀河系まで飛んでいけ！');
    expect(html).toContain('この');
    expect(html).toContain('あめ');
    expect(html).toContain('ぴとな');
    // https サムネは残り、data: は出ない（正本 model が strip 済 + レンダラも二重防御）。
    expect(html).toContain('https://example.test/ame.jpg');
    expect(html).not.toContain('data:image/png;base64,AAAA');
  });

  it('イベント不参加（model=null）ならセクションは出ない', () => {
    // 生データが空＝model は null。
    const model = buildEventRankingReportModel({ rows: [], selfStatus: null }, { nowMs: NOW });
    expect(model).toBeNull();
    const html = buildMarketingDashboardHtml(realReport(), { eventRanking: model });
    expect(html).not.toContain('id="mkt-event-ranking"');
    expect(html).not.toContain('🏆 イベント順位');
  });
});
