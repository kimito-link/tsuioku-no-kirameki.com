// v0.1.613: フォロー×コメント分析 と 応援者パワー診断 は同じ buildCommenterFollowAnalytics を
//   別々に呼んでいた(従来は同一 HTML 内で 2 回)。数千コメンターでは重複計算が DL 遅延の原因。
//   呼び出し元で 1 回だけ計算し precomputedAnalytics として両セクションに共有するよう変更した。
//   本テストは「フルレポート 1 枚の生成で buildCommenterFollowAnalytics が 1 回しか呼ばれない」
//   ことを spy で保証する回帰ガード。将来うっかり重複呼びが復活したら落ちる。
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 実装はそのまま動かしつつ呼び出し回数だけ数える spy で commenterFollowAnalytics.js を差し替える。
vi.mock('./commenterFollowAnalytics.js', async (importActual) => {
  const actual = /** @type {Record<string, unknown>} */ (await importActual());
  return {
    ...actual,
    buildCommenterFollowAnalytics: vi.fn(actual.buildCommenterFollowAnalytics)
  };
});

import { buildMarketingDashboardHtml } from './marketingChartsHtml.js';
import { aggregateMarketingReport } from './marketingAggregate.js';
import { buildCommenterFollowAnalytics } from './commenterFollowAnalytics.js';

/**
 * 数値 ID コメンター 6 名分のレポートを作る(両セクションが描画される条件)。
 * @returns {import('./marketingAggregate.js').MarketingReport}
 */
function makeReportWithNumericCommenters() {
  const base = Date.parse('2024-01-01T00:00:00Z');
  /** @type {import('./commentRecord.js').StoredComment[]} */
  const comments = [];
  for (let uid = 1; uid <= 6; uid += 1) {
    for (let i = 0; i < uid * 2; i += 1) {
      comments.push({
        id: `c-${uid}-${i}`,
        liveId: 'lv123',
        commentNo: String(uid * 100 + i),
        text: `コメ${uid}`,
        userId: String(uid),
        avatarUrl: uid === 1 ? 'https://example.com/av.jpg' : '',
        capturedAt: base + (uid * 1000 + i) * 1000
      });
    }
  }
  return aggregateMarketingReport(comments, 'lv123');
}

describe('v0.1.613: marketing HTML の buildCommenterFollowAnalytics 重複排除', () => {
  beforeEach(() => {
    vi.mocked(buildCommenterFollowAnalytics).mockClear();
  });

  it('フルレポート 1 枚で buildCommenterFollowAnalytics は 1 回だけ呼ばれる', () => {
    const html = buildMarketingDashboardHtml(makeReportWithNumericCommenters());
    // 両セクションが実際に描画されていること(precompute が両方に行き渡っている証拠)
    expect(html).toContain('id="mkt-commenter-follow-analytics"');
    expect(html).toContain('id="mkt-supporter-power"');
    // 共有 precompute により呼び出しは 1 回のみ(従来は 2 回)
    expect(vi.mocked(buildCommenterFollowAnalytics)).toHaveBeenCalledTimes(1);
    // しかも includeSupporterPower=true で呼ばれている(応援者パワー診断の superset)
    const [, callOpts] = vi.mocked(buildCommenterFollowAnalytics).mock.calls[0];
    expect(callOpts).toMatchObject({ includeSupporterPower: true });
  });

  it('共有(maskShare)向け出力でも buildCommenterFollowAnalytics は 1 回だけ', () => {
    const html = buildMarketingDashboardHtml(makeReportWithNumericCommenters(), {
      maskShareLabels: true
    });
    // 共有モードでは応援者パワー診断は Tier 集計のみ出る(個別 uid は伏せる)
    expect(html).toContain('id="mkt-supporter-power"');
    expect(vi.mocked(buildCommenterFollowAnalytics)).toHaveBeenCalledTimes(1);
  });
});
