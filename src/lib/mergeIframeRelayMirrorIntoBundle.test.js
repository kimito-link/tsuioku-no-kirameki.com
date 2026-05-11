/**
 * mergeIframeRelayMirrorIntoBundle の単体テスト。
 *
 * v0.1.252 で popup-entry.js refreshOfficialEventDomBundle inline ロジックから
 * 抽出した純関数。bundle (`nls_event_dom_<lv>`) と iframe relay storage
 * (`nls_iframe_official_dom_<lv>`) の鏡 outerHTML field をマージする。
 */
import { describe, it, expect } from 'vitest';
import { mergeIframeRelayMirrorIntoBundle } from './mergeIframeRelayMirrorIntoBundle.js';

describe('mergeIframeRelayMirrorIntoBundle', () => {
  it('両方 null → null', () => {
    expect(mergeIframeRelayMirrorIntoBundle(null, null)).toBeNull();
    expect(mergeIframeRelayMirrorIntoBundle(undefined, undefined)).toBeNull();
  });

  it('Array や非 object は null として扱う', () => {
    expect(mergeIframeRelayMirrorIntoBundle([], [])).toBeNull();
    expect(mergeIframeRelayMirrorIntoBundle('string', 42)).toBeNull();
  });

  it('base のみ → base そのまま', () => {
    const base = {
      capturedAt: 100,
      eventBanner: { rank: 1 },
      contributionRankingMirrorHtml: null
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, null);
    expect(out).toBe(base);
  });

  it('iframe のみ・両 mirror null → null（iframe 側に有用なデータが無い）', () => {
    const iframe = { contributionRanking: [], eventBanner: null };
    expect(mergeIframeRelayMirrorIntoBundle(null, iframe)).toBeNull();
  });

  it('iframe のみ・contributionRanking 鏡あり → 最小 bundle を返す', () => {
    const iframe = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">a</ul>',
      giftHistoryMirrorHtml: null
    };
    const out = mergeIframeRelayMirrorIntoBundle(null, iframe);
    expect(out).not.toBeNull();
    expect(out.contributionRankingMirrorHtml).toBe(
      '<ul class="contribution-ranking-list">a</ul>'
    );
    expect(out.giftHistoryMirrorHtml).toBeNull();
  });

  it('iframe のみ・両 mirror あり → 両方含む最小 bundle', () => {
    const iframe = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">c</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">h</ul>'
    };
    const out = mergeIframeRelayMirrorIntoBundle(null, iframe);
    expect(out.contributionRankingMirrorHtml).toContain('contribution-ranking-list');
    expect(out.giftHistoryMirrorHtml).toContain('gift-history-list');
  });

  it('両方あり・base 鏡空・iframe 鏡あり → iframe 鏡で埋める', () => {
    const base = {
      capturedAt: 100,
      eventBanner: { rank: 1 },
      contributionRankingMirrorHtml: null,
      giftHistoryMirrorHtml: null
    };
    const iframe = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">iframe</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">iframe</ul>'
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.capturedAt).toBe(100);
    expect(out.eventBanner.rank).toBe(1);
    expect(out.contributionRankingMirrorHtml).toContain('iframe');
    expect(out.giftHistoryMirrorHtml).toContain('iframe');
  });

  it('両方あり・base 鏡あり・iframe 鏡あり → base 鏡を優先（Phase 1/2 ボタンの結果を保持）', () => {
    const base = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">base</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">base</ul>'
    };
    const iframe = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">iframe</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">iframe</ul>'
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.contributionRankingMirrorHtml).toContain('base');
    expect(out.giftHistoryMirrorHtml).toContain('base');
  });

  it('両方あり・base 鏡空文字列・iframe 鏡あり → iframe 鏡で埋める', () => {
    const base = {
      contributionRankingMirrorHtml: '',
      giftHistoryMirrorHtml: ''
    };
    const iframe = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">iframe</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">iframe</ul>'
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.contributionRankingMirrorHtml).toContain('iframe');
    expect(out.giftHistoryMirrorHtml).toContain('iframe');
  });

  it('両方あり・base 鏡あり・iframe 鏡 null → base そのまま (上書きしない)', () => {
    const base = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">base</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">base</ul>'
    };
    const iframe = {
      contributionRankingMirrorHtml: null,
      giftHistoryMirrorHtml: null
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.contributionRankingMirrorHtml).toContain('base');
    expect(out.giftHistoryMirrorHtml).toContain('base');
  });

  it('片側だけ補完 (contributionRanking のみ iframe 由来、giftHistory は base のみ)', () => {
    const base = {
      contributionRankingMirrorHtml: null,
      giftHistoryMirrorHtml: '<ul class="gift-history-list">base</ul>'
    };
    const iframe = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">iframe</ul>',
      giftHistoryMirrorHtml: null
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.contributionRankingMirrorHtml).toContain('iframe');
    expect(out.giftHistoryMirrorHtml).toContain('base');
  });

  it('iframe 側の非文字列 (number / object) は採用しない', () => {
    const base = {
      contributionRankingMirrorHtml: null,
      giftHistoryMirrorHtml: null
    };
    const iframe = {
      contributionRankingMirrorHtml: 42,
      giftHistoryMirrorHtml: { html: 'foo' }
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.contributionRankingMirrorHtml).toBeNull();
    expect(out.giftHistoryMirrorHtml).toBeNull();
  });

  it('input を mutate しない (純関数)', () => {
    const base = {
      contributionRankingMirrorHtml: null,
      giftHistoryMirrorHtml: null
    };
    const iframe = {
      contributionRankingMirrorHtml: '<ul>x</ul>',
      giftHistoryMirrorHtml: '<ul>y</ul>'
    };
    const baseSnapshot = { ...base };
    const iframeSnapshot = { ...iframe };
    mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(base).toEqual(baseSnapshot);
    expect(iframe).toEqual(iframeSnapshot);
  });

  it('実機シナリオ: Phase 1 ボタン → bundle に contribution 鏡保存後、サイドバー close で iframe relay 鏡 null', () => {
    // この場合は base が鏡を持っており、iframe 側は null。base を優先する。
    const base = {
      capturedAt: 1700,
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">click result</ul>',
      giftHistoryMirrorHtml: null,
      eventBanner: null
    };
    const iframe = {
      contributionRanking: [],
      contributionRankingMirrorHtml: null,
      giftHistoryMirrorHtml: null,
      capturedAt: 1800,
      frameUrl: 'https://koken.nicovideo.jp/...',
      frameSource: 'koken'
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.contributionRankingMirrorHtml).toContain('click result');
    expect(out.giftHistoryMirrorHtml).toBeNull();
    // base の他フィールドも温存
    expect(out.capturedAt).toBe(1700);
  });

  it('実機シナリオ: ユーザーが自然にサイドバーを開いた → iframe relay 経由で鏡が流れる、Phase 1/2 ボタン未押下', () => {
    // base bundle にはまだ鏡が無く、iframe relay 経由で鏡が来た
    const base = {
      capturedAt: 1700,
      eventBanner: null,
      contributionRankingMirrorHtml: null,
      giftHistoryMirrorHtml: null,
      programStats: { commentCount: 100, watchCount: 500 }
    };
    const iframe = {
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">iframe auto</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">iframe auto</ul>',
      capturedAt: 1800,
      frameUrl: 'https://koken.nicovideo.jp/...',
      frameSource: 'koken'
    };
    const out = mergeIframeRelayMirrorIntoBundle(base, iframe);
    expect(out.contributionRankingMirrorHtml).toContain('iframe auto');
    expect(out.giftHistoryMirrorHtml).toContain('iframe auto');
    expect(out.programStats.commentCount).toBe(100);
  });
});
