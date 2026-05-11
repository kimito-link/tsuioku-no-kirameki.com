import { describe, it, expect } from 'vitest';
import { buildOfficialDomFromRelayEvent } from './iframeOfficialDomFromRelay.js';

const AUDITION_URL =
  'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv1&frontend_id=9';
const KOKEN_URL =
  'https://koken.nicovideo.jp/supporter/contents/live/lv1/gift';
const NICOAD_URL =
  'https://nicoad.nicovideo.jp/live/publish/lv1?frontend_id=9';
const GIFT_URL =
  'https://gift.nicovideo.jp/live/lv1/purchase?frontend_id=9';

const SAMPLE_RANKING = [
  { name: 'a', contribution: 100 },
  { name: 'b', contribution: 50 }
];
const SAMPLE_BANNER = { ownerName: '配信者', rank: 5, score: 1234 };

describe('buildOfficialDomFromRelayEvent', () => {
  it('null/undefined/非オブジェクト入力 → shouldWrite=false / no-data', () => {
    expect(buildOfficialDomFromRelayEvent(null)).toMatchObject({
      shouldWrite: false,
      reason: 'no-data',
      frameSource: 'unknown'
    });
    expect(buildOfficialDomFromRelayEvent(undefined).shouldWrite).toBe(false);
    expect(
      buildOfficialDomFromRelayEvent(/** @type {any} */ ('string'))
    ).toMatchObject({ shouldWrite: false, reason: 'no-data' });
  });

  it('入力が完全に空（contributionRanking 無 / eventBanner 無）→ no-data', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: AUDITION_URL
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.reason).toBe('no-data');
  });

  it('contributionRanking 空配列 + eventBanner 無 → no-input', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: AUDITION_URL,
      contributionRanking: []
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.reason).toBe('no-input');
  });

  // ==== audition: 信頼源 ====
  it('audition + contributionRanking → 採用', () => {
    const r = buildOfficialDomFromRelayEvent(
      { frameUrl: AUDITION_URL, contributionRanking: SAMPLE_RANKING },
      { nowMs: 12345 }
    );
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('accepted');
    expect(r.frameSource).toBe('audition');
    expect(r.payload?.contributionRanking).toHaveLength(2);
    expect(r.payload?.eventBanner).toBeNull();
    expect(r.payload?.capturedAt).toBe(12345);
    expect(r.payload?.frameUrl).toBe(AUDITION_URL);
    expect(r.payload?.frameSource).toBe('audition');
  });

  it('audition + eventBanner → 採用', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: AUDITION_URL,
      eventBanner: SAMPLE_BANNER
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.payload?.eventBanner).toEqual(SAMPLE_BANNER);
  });

  it('audition + contributionRanking + eventBanner 両方 → 両方採用', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: AUDITION_URL,
      contributionRanking: SAMPLE_RANKING,
      eventBanner: SAMPLE_BANNER
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.payload?.contributionRanking).toHaveLength(2);
    expect(r.payload?.eventBanner).toEqual(SAMPLE_BANNER);
  });

  // ==== koken: contributionRanking 信頼、eventBanner 非信頼 ====
  it('koken + contributionRanking → 採用', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: KOKEN_URL,
      contributionRanking: SAMPLE_RANKING
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.frameSource).toBe('koken');
    expect(r.payload?.contributionRanking).toHaveLength(2);
  });

  it('koken + eventBanner のみ → drop（all-dropped）', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: KOKEN_URL,
      eventBanner: SAMPLE_BANNER
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.reason).toBe('all-dropped');
    expect(r.frameSource).toBe('koken');
  });

  // ==== nicoad: 全 drop（v0.1.230 修正の核） ====
  it('v0.1.230 core: nicoad + contributionRanking → drop（広告ランキング混入を阻止）', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: NICOAD_URL,
      contributionRanking: SAMPLE_RANKING
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.reason).toBe('all-dropped');
    expect(r.frameSource).toBe('nicoad');
  });

  it('v0.1.230 core: nicoad + eventBanner → drop', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: NICOAD_URL,
      eventBanner: SAMPLE_BANNER
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.reason).toBe('all-dropped');
  });

  it('v0.1.230 core: nicoad で contributionRanking + eventBanner 両方ありでも両方 drop', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: NICOAD_URL,
      contributionRanking: SAMPLE_RANKING,
      eventBanner: SAMPLE_BANNER
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.reason).toBe('all-dropped');
  });

  // ==== gift / unknown: drop ====
  it('gift iframe → drop', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: GIFT_URL,
      contributionRanking: SAMPLE_RANKING
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.frameSource).toBe('gift');
  });

  it('unknown frameUrl → drop', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: 'https://example.com/foo',
      contributionRanking: SAMPLE_RANKING
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.frameSource).toBe('unknown');
  });

  it('frameUrl 欠落 → unknown / drop', () => {
    const r = buildOfficialDomFromRelayEvent({
      contributionRanking: SAMPLE_RANKING
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.frameSource).toBe('unknown');
  });

  // ==== payload metadata ====
  it('payload に frameUrl / frameSource / capturedAt が含まれる', () => {
    const r = buildOfficialDomFromRelayEvent(
      { frameUrl: AUDITION_URL, contributionRanking: SAMPLE_RANKING },
      { nowMs: 1700000000000 }
    );
    expect(r.payload?.frameUrl).toBe(AUDITION_URL);
    expect(r.payload?.frameSource).toBe('audition');
    expect(r.payload?.capturedAt).toBe(1700000000000);
  });

  it('frameUrl が 200 字超でも slice される（XSS / メモリ防護）', () => {
    const longUrl = 'https://audition.nicovideo.jp/' + 'a'.repeat(500);
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: longUrl,
      contributionRanking: SAMPLE_RANKING
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.payload?.frameUrl.length).toBeLessThanOrEqual(200);
  });

  it('contributionRanking が配列でない場合は無視', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: AUDITION_URL,
      contributionRanking: /** @type {any} */ ('not-an-array')
    });
    expect(r.shouldWrite).toBe(false);
  });

  it('eventBanner が object でない場合は無視', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: AUDITION_URL,
      eventBanner: /** @type {any} */ ('not-an-object')
    });
    expect(r.shouldWrite).toBe(false);
  });

  // ==== v0.1.252: 鏡 outerHTML フィールド ====
  it('v0.1.252: koken + contributionRankingMirrorHtml + giftHistoryMirrorHtml 両方採用', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: KOKEN_URL,
      contributionRanking: SAMPLE_RANKING,
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">...</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">...</ul>'
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.payload?.contributionRankingMirrorHtml).toBe(
      '<ul class="contribution-ranking-list">...</ul>'
    );
    expect(r.payload?.giftHistoryMirrorHtml).toBe('<ul class="gift-history-list">...</ul>');
  });

  it('v0.1.252: audition + contributionRankingMirrorHtml 採用、giftHistoryMirrorHtml は drop', () => {
    // audition iframe には履歴タブ無いので giftHistory 鏡は信頼しない
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: AUDITION_URL,
      contributionRanking: SAMPLE_RANKING,
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">...</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">...</ul>'
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.payload?.contributionRankingMirrorHtml).toBe(
      '<ul class="contribution-ranking-list">...</ul>'
    );
    expect(r.payload?.giftHistoryMirrorHtml).toBeNull();
  });

  it('v0.1.252: 鏡のみ（構造化 contributionRanking 空 / eventBanner 無）でも accepted', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: KOKEN_URL,
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">...</ul>'
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('accepted');
    expect(r.payload?.contributionRanking).toEqual([]);
    expect(r.payload?.contributionRankingMirrorHtml).toContain('contribution-ranking-list');
  });

  it('v0.1.252: nicoad で鏡 outerHTML があっても drop（広告ランキング混入と同じ理由）', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: NICOAD_URL,
      contributionRankingMirrorHtml: '<ul>nicoad の偽 contribution-ranking</ul>',
      giftHistoryMirrorHtml: '<ul>nicoad の偽 gift-history</ul>'
    });
    expect(r.shouldWrite).toBe(false);
    expect(r.reason).toBe('all-dropped');
  });

  it('v0.1.252: 鏡 outerHTML 空文字列は null として扱う', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: KOKEN_URL,
      contributionRanking: SAMPLE_RANKING,
      contributionRankingMirrorHtml: '',
      giftHistoryMirrorHtml: ''
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.payload?.contributionRankingMirrorHtml).toBeNull();
    expect(r.payload?.giftHistoryMirrorHtml).toBeNull();
  });

  it('v0.1.252: 鏡 outerHTML が文字列でない場合は null として扱う', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: KOKEN_URL,
      contributionRanking: SAMPLE_RANKING,
      contributionRankingMirrorHtml: /** @type {any} */ ({ html: '<ul></ul>' }),
      giftHistoryMirrorHtml: /** @type {any} */ (42)
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.payload?.contributionRankingMirrorHtml).toBeNull();
    expect(r.payload?.giftHistoryMirrorHtml).toBeNull();
  });

  it('v0.1.252: koken の giftHistoryMirrorHtml 単独でも accepted', () => {
    const r = buildOfficialDomFromRelayEvent({
      frameUrl: KOKEN_URL,
      giftHistoryMirrorHtml: '<ul class="gift-history-list"><li class="item">a</li></ul>'
    });
    expect(r.shouldWrite).toBe(true);
    expect(r.reason).toBe('accepted');
    expect(r.payload?.giftHistoryMirrorHtml).toContain('gift-history-list');
  });
});
