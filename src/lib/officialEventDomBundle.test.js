/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  collectOfficialEventDomBundle,
  mergeOfficialEventDomBundle
} from './officialEventDomBundle.js';

describe('collectOfficialEventDomBundle', () => {
  it('4 種全部居る場合は 1 つに束ねる', () => {
    document.body.innerHTML = `
      <a class="wrapper">
        <p class="owner-name">あかねこ。さんが参加しています！</p>
        <span class="rank-num">2</span>
        <span class="score">207,835</span>
        <span class="name">ギフトのモト争奪戦</span>
        <img class="thumbnail" src="x.jpg" />
      </a>
      <table class="point-field">
        <tr><th class="point-title">イベント累計スコア：</th><td class="point-value">207,835</td></tr>
        <tr><th class="point-title">番組累計ポイント：</th><td class="point-value">1,740 pt</td></tr>
      </table>
      <ul class="contribution-ranking-list">
        <li class="ranker"><button>
          <p class="rank"><svg></svg></p>
          <p class="text"><span class="ranker-name"><strong class="ranker-name-value" data-button-disabled="false">なぎ</strong></span></p>
          <p class="contribution">5,000 <svg></svg></p>
        </button></li>
      </ul>
      <ul class="program-statistics-menu">
        <li title="来場者数"><span class="count" data-value="3266"></span></li>
        <li title="ギフトポイント"><span class="count" data-value="1770"></span></li>
      </ul>`;
    const b = collectOfficialEventDomBundle(document, { nowMs: 1700000000000 });
    expect(b).not.toBeNull();
    expect(b.capturedAt).toBe(1700000000000);
    expect(b.eventBanner?.rank).toBe(2);
    expect(b.eventBalloon?.eventTotalScore).toBe(207835);
    expect(b.contributionRanking?.length).toBe(1);
    expect(b.programStats?.giftPoints).toBe(1770);
  });

  it('全部空なら null', () => {
    document.body.innerHTML = '<div></div>';
    expect(collectOfficialEventDomBundle(document)).toBeNull();
  });

  it('一部しか無くても 1 つ以上ヒットすれば bundle を返す', () => {
    document.body.innerHTML = `
      <ul class="program-statistics-menu">
        <li title="来場者数"><span class="count" data-value="100"></span></li>
      </ul>`;
    const b = collectOfficialEventDomBundle(document);
    expect(b).not.toBeNull();
    expect(b.programStats?.watchCount).toBe(100);
    expect(b.eventBanner).toBeNull();
  });

  it('v0.1.240: bundle に eventCumulativeScoreMirrorHtml / eventCurrentRankMirrorHtml が null で含まれる', () => {
    document.body.innerHTML = `
      <ul class="program-statistics-menu">
        <li title="来場者数"><span class="count" data-value="100"></span></li>
      </ul>`;
    const b = collectOfficialEventDomBundle(document);
    expect(b).not.toBeNull();
    expect(b.eventCumulativeScoreMirrorHtml).toBeNull();
    expect(b.eventCurrentRankMirrorHtml).toBeNull();
  });
});

describe('mergeOfficialEventDomBundle', () => {
  it('prev null なら next そのまま', () => {
    const next = { capturedAt: 1, eventBanner: { rank: 1 }, eventBalloon: null, contributionRanking: null, programStats: null };
    expect(mergeOfficialEventDomBundle(null, next)).toBe(next);
  });

  it('next null なら prev そのまま', () => {
    const prev = { capturedAt: 1, eventBanner: { rank: 1 }, eventBalloon: null, contributionRanking: null, programStats: null };
    expect(mergeOfficialEventDomBundle(prev, null)).toBe(prev);
  });

  it('next で取れない欄は prev の値で温存', () => {
    const prev = {
      capturedAt: 1,
      eventBanner: { rank: 9, score: 100, title: 'a', iconUrl: '', ownerText: '', href: '' },
      eventBalloon: { eventTotalScore: 1000, programTotalPoints: 50 },
      contributionRanking: [{ rank: 1, name: 'x', contribution: 5, isAnonymous: false, thumbnailUrl: '' }],
      programStats: { watchCount: 100, commentCount: 50, timeshiftReservationCount: null, adPoints: null, giftPoints: null }
    };
    const next = {
      capturedAt: 2,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      programStats: { watchCount: 200, commentCount: 80, timeshiftReservationCount: null, adPoints: null, giftPoints: null }
    };
    const merged = mergeOfficialEventDomBundle(prev, next);
    expect(merged.eventBanner.rank).toBe(9);
    expect(merged.eventBalloon.eventTotalScore).toBe(1000);
    expect(merged.contributionRanking.length).toBe(1);
    expect(merged.programStats.watchCount).toBe(200);
    expect(merged.capturedAt).toBe(2);
  });

  it('v0.1.240: eventCumulativeScoreMirrorHtml / eventCurrentRankMirrorHtml は next 優先で prev fallback', () => {
    const prev = {
      capturedAt: 1,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      adContributionRanking: null,
      adRankingMirrorHtml: null,
      eventCumulativeScoreMirrorHtml: '<span class="score">100</span>',
      eventCurrentRankMirrorHtml: '<span class="rank-field">5</span>',
      programStats: null,
      giftHistory: null
    };
    const next = {
      capturedAt: 2,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      adContributionRanking: null,
      adRankingMirrorHtml: null,
      eventCumulativeScoreMirrorHtml: '<span class="score">200</span>',
      eventCurrentRankMirrorHtml: null,
      programStats: null,
      giftHistory: null
    };
    const merged = mergeOfficialEventDomBundle(prev, next);
    // next が値を持っている方は next を採用
    expect(merged.eventCumulativeScoreMirrorHtml).toBe('<span class="score">200</span>');
    // next が null なら prev で温存
    expect(merged.eventCurrentRankMirrorHtml).toBe('<span class="rank-field">5</span>');
  });
});
