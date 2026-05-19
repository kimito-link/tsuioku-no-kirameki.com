/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import {
  collectOfficialEventDomBundle,
  fetchNicoadContributionRankingFromPublishPage,
  mergeGiftHistoryDomScrapeArrays,
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

/** @returns {import('./officialEventBannerDom.js').GiftHistoryEntry} */
function gh(time, name, point, gift = 'g') {
  return {
    time,
    advertiserName: name,
    isAnonymous: name === '名無し',
    point,
    thumbnailUrl: '',
    giftName: gift
  };
}

describe('mergeGiftHistoryDomScrapeArrays', () => {
  it('next が部分集合でも prev の行を保持（ユニオン）', () => {
    const prev = [gh('20:01', 'A', 10), gh('20:02', 'B', 20), gh('20:03', 'C', 30)];
    const next = [gh('20:03', 'C', 30), gh('20:02', 'B', 20)];
    const merged = mergeGiftHistoryDomScrapeArrays(prev, next);
    expect(merged).toHaveLength(3);
    expect(merged?.map((e) => e.advertiserName).join(',')).toBe('C,B,A');
  });

  it('next が空相当なら prev を返す', () => {
    const prev = [gh('20:01', 'A', 10)];
    expect(mergeGiftHistoryDomScrapeArrays(prev, null)).toEqual(prev);
    expect(mergeGiftHistoryDomScrapeArrays(prev, [])).toEqual(prev);
  });

  it('prev が空なら next のコピー', () => {
    const next = [gh('20:01', 'A', 10)];
    expect(mergeGiftHistoryDomScrapeArrays(null, next)).toEqual(next);
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

  it('giftHistory: next が仮想リストの部分集合でも prev を上書き消去しない', () => {
    const prev = {
      capturedAt: 1,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      programStats: null,
      giftHistory: [gh('20:01', 'A', 10), gh('20:02', 'B', 20), gh('20:03', 'C', 30)]
    };
    const next = {
      capturedAt: 2,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      programStats: null,
      giftHistory: [gh('20:03', 'C', 30)]
    };
    const merged = mergeOfficialEventDomBundle(prev, next);
    expect(merged?.giftHistory).toHaveLength(3);
    expect(merged?.giftHistory?.map((e) => e.advertiserName).join(',')).toBe('C,A,B');
  });

  it('adContributionRanking: next が空配列でも prev の行を消さない', () => {
    const prev = {
      capturedAt: 1,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      adContributionRanking: [
        { rank: 1, name: 'x', contribution: 5, isAnonymous: false, thumbnailUrl: '' }
      ],
      adRankingMirrorHtml: '<ul>old</ul>',
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null,
      programStats: null,
      giftHistory: null
    };
    const next = {
      capturedAt: 2,
      eventBanner: null,
      eventBalloon: null,
      contributionRanking: null,
      adContributionRanking: [],
      adRankingMirrorHtml: '<ul>new</ul>',
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null,
      programStats: null,
      giftHistory: null
    };
    const merged = mergeOfficialEventDomBundle(prev, next);
    expect(merged?.adContributionRanking).toHaveLength(1);
    expect(merged?.adRankingMirrorHtml).toBe('<ul>new</ul>');
  });
});

describe('fetchNicoadContributionRankingFromPublishPage', () => {
  it('構造化行が 0 でも mirrorHtml が取れれば空配列 + 非列挙 mirrorHtml を返す', async () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="content-supporter-section_abc">
        <ul class="wrapper_decoy"><li class="oops">no ranker</li></ul>
        <ul class="wrapper_real">
          <li class="item"><p>incomplete</p></li>
        </ul>
      </div>
    </body></html>`;
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => html });
    // @ts-expect-error test override
    globalThis.fetch = fetchSpy;

    const res = await fetchNicoadContributionRankingFromPublishPage('lv123');
    expect(Array.isArray(res)).toBe(true);
    expect(res?.length).toBe(0);
    expect(/** @type {any} */ (res)?.mirrorHtml).toContain('wrapper_real');
    expect(/** @type {any} */ (res)?.mirrorHtml).toContain('incomplete');
  });
});

describe('AD汚染回帰: contributionRanking sticky vs adContributionRanking 非 sticky', () => {
  // ⚠️ 観測サンプル到着まで gift/ad 弁別 selector は書かない。本 block は出荷済
  //    mergeOfficialEventDomBundle の挙動 pin のみ。新 selector を足したら BLOCK
  //    違反（会議室 critic 2026-05-19 裁定）。将来 gift 専用 field を作る時、:225 の
  //    sticky な contributionRanking に相乗りすると false-positive が恒久 pin される
  //    ＝新 field は :226-231 の非 sticky パターン必須、を実行可能契約で先行固定。

  /** @param {object} over @returns {any} */
  const bundle = (over) => ({
    capturedAt: 1,
    eventBanner: null,
    eventBalloon: null,
    contributionRanking: null,
    adContributionRanking: null,
    adRankingMirrorHtml: null,
    eventCumulativeScoreMirrorHtml: null,
    eventCurrentRankMirrorHtml: null,
    programStats: null,
    giftHistory: [],
    ...over
  });
  const poisoned = [
    { rank: 1, name: 'スポンサーＡ', contribution: 23692, isAnonymous: false, thumbnailUrl: '' }
  ];

  it('contributionRanking は sticky＝prev 汚染が next=null でも恒久 pin（miss=no-op が崩壊）', () => {
    const m1 = mergeOfficialEventDomBundle(
      bundle({ capturedAt: 1, contributionRanking: poisoned }),
      bundle({ capturedAt: 2, contributionRanking: null })
    );
    expect(m1?.contributionRanking).toBe(poisoned);
  });

  it('adContributionRanking は非 sticky＝両空で null（false-positive を pin しない）', () => {
    const m2 = mergeOfficialEventDomBundle(
      bundle({ capturedAt: 1, adContributionRanking: poisoned }),
      bundle({ capturedAt: 2, adContributionRanking: [] })
    );
    expect(m2?.adContributionRanking).toBe(poisoned); // next 空配列 → prev 非空温存
    const m3 = mergeOfficialEventDomBundle(
      bundle({ capturedAt: 1, adContributionRanking: null }),
      bundle({ capturedAt: 2, adContributionRanking: [] })
    );
    expect(m3?.adContributionRanking).toBe(null);
  });

  it('FIX3: 部分 bundle（giftHistory 欠落）でも merge は throw しない（null 耐性 pin）', () => {
    expect(() =>
      mergeOfficialEventDomBundle(
        { capturedAt: 1, contributionRanking: poisoned },
        { capturedAt: 2, contributionRanking: null }
      )
    ).not.toThrow();
  });
});
