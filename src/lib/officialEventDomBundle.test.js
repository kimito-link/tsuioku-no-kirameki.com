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

  it('v0.1.250: ul.contribution-ranking-list 居る時、bundle.contributionRankingMirrorHtml に outerHTML が入る', () => {
    document.body.innerHTML = `
      <ul class="contribution-ranking-list">
        <li class="ranker">
          <button class="button">
            <p class="rank"><svg></svg></p>
            <p class="text"><span class="ranker-name"><strong class="ranker-name-value">なぎ</strong></span></p>
            <p class="contribution">5,000 <svg></svg></p>
          </button>
        </li>
      </ul>`;
    const b = collectOfficialEventDomBundle(document);
    expect(b).not.toBeNull();
    expect(typeof b.contributionRankingMirrorHtml).toBe('string');
    expect(b.contributionRankingMirrorHtml).toContain('contribution-ranking-list');
    expect(b.contributionRankingMirrorHtml).toContain('なぎ');
  });

  it('v0.1.251: ul.gift-history-list 居る時、bundle.giftHistoryMirrorHtml に outerHTML が入る', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="x.png" alt="ギフト">
          <p class="time">1:23:45</p>
          <p class="text"><span class="advertiser-name">名無し <small class="honorific">さん</small></span></p>
          <p class="point">100 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const b = collectOfficialEventDomBundle(document);
    expect(b).not.toBeNull();
    expect(typeof b.giftHistoryMirrorHtml).toBe('string');
    expect(b.giftHistoryMirrorHtml).toContain('gift-history-list');
    expect(b.giftHistoryMirrorHtml).toContain('名無し');
  });

  it('v0.1.250+251: 鏡 outerHTML のみが取れていて他の構造化値が無い場合でも bundle が返る', () => {
    // 通常は contribution-ranking-list / gift-history-list が居る = scrapeContributionRankingFromDom
    // も拾うので bundle になるが、CSS Modules ハッシュ化されて partial match のみ通る場合などは
    // 鏡だけ取れて構造化版は null になるパスもある。本テストは鏡 only でも非 null になることを検証。
    document.body.innerHTML = `
      <ul class="___contribution-ranking-list___ABCDEF">
        <li class="ranker">a</li>
      </ul>`;
    const b = collectOfficialEventDomBundle(document);
    expect(b).not.toBeNull();
    expect(b.contributionRankingMirrorHtml).toContain('contribution-ranking-list');
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

  it('v0.1.250+251: contributionRankingMirrorHtml / giftHistoryMirrorHtml も同じ next 優先で prev fallback', () => {
    const prev = {
      capturedAt: 1,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      adContributionRanking: null,
      adRankingMirrorHtml: null,
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null,
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">old</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">old</ul>',
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
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null,
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">new</ul>',
      giftHistoryMirrorHtml: null,
      programStats: null,
      giftHistory: null
    };
    const merged = mergeOfficialEventDomBundle(prev, next);
    // next が値を持っている方は next を採用
    expect(merged.contributionRankingMirrorHtml).toBe('<ul class="contribution-ranking-list">new</ul>');
    // next が null なら prev で温存（Phase 1/2 ボタンで取った鏡をサイドバー close 後も保持）
    expect(merged.giftHistoryMirrorHtml).toBe('<ul class="gift-history-list">old</ul>');
  });

  it('v0.1.250+251: 鏡 field 自体が無い旧 bundle（v0.1.249 以前）でも merge は壊れない', () => {
    // 旧 storage に v0.1.249 以前の bundle が残ってる場合（contributionRankingMirrorHtml が undefined）
    const prev = {
      capturedAt: 1,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      adContributionRanking: null,
      adRankingMirrorHtml: null,
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null,
      // contributionRankingMirrorHtml / giftHistoryMirrorHtml が undefined
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
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null,
      contributionRankingMirrorHtml: '<ul class="contribution-ranking-list">fresh</ul>',
      giftHistoryMirrorHtml: '<ul class="gift-history-list">fresh</ul>',
      programStats: null,
      giftHistory: null
    };
    const merged = mergeOfficialEventDomBundle(prev, next);
    expect(merged.contributionRankingMirrorHtml).toBe('<ul class="contribution-ranking-list">fresh</ul>');
    expect(merged.giftHistoryMirrorHtml).toBe('<ul class="gift-history-list">fresh</ul>');
  });
});
