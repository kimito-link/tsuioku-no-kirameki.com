import { describe, it, expect } from 'vitest';
import {
  determineNorthStarLaneState,
  hasEventParticipationSignal
} from './northStarLaneReason.js';

describe('determineNorthStarLaneState', () => {
  describe('共通: 起動直後 (bundle/snap 両方空)', () => {
    it('全レーンで not_yet を返す', () => {
      for (const lane of [
        'contributionRanking',
        'giftHistory',
        'eventScore',
        'programPoints',
        'eventRank',
        'adRanking'
      ]) {
        expect(determineNorthStarLaneState(lane, {})).toBe('not_yet');
        expect(determineNorthStarLaneState(lane, { bundle: null, snap: null })).toBe('not_yet');
      }
    });
  });

  describe('contributionRanking レーン', () => {
    it('count > 0 で ok', () => {
      const bundle = { contributionRanking: [{ rank: 1 }, { rank: 2 }] };
      expect(determineNorthStarLaneState('contributionRanking', { bundle })).toBe('ok');
    });

    it('count = 0 で iframe_unrendered', () => {
      const bundle = { contributionRanking: [], programStats: {} };
      expect(determineNorthStarLaneState('contributionRanking', { bundle })).toBe('iframe_unrendered');
    });

    it('contributionRanking が null でも iframe_unrendered', () => {
      const bundle = { programStats: {} };
      expect(determineNorthStarLaneState('contributionRanking', { bundle })).toBe('iframe_unrendered');
    });
  });

  describe('giftHistory レーン', () => {
    it('count > 0 で ok', () => {
      const bundle = { giftHistory: [{ point: 100 }] };
      expect(determineNorthStarLaneState('giftHistory', { bundle })).toBe('ok');
    });

    it('giftPoints = 0 で no_program_gift', () => {
      const bundle = { giftHistory: [], programStats: { giftPoints: 0 } };
      expect(determineNorthStarLaneState('giftHistory', { bundle })).toBe('no_program_gift');
    });

    it('NDGR giftPoints = 0 でも no_program_gift', () => {
      const bundle = { giftHistory: [] };
      const snap = { officialGiftPointsNdgr: 0 };
      expect(determineNorthStarLaneState('giftHistory', { bundle, snap })).toBe('no_program_gift');
    });

    it('ギフト発生あり (giftPoints > 0) かつ history 0 件で iframe_unrendered', () => {
      const bundle = { giftHistory: [], programStats: { giftPoints: 550 } };
      expect(determineNorthStarLaneState('giftHistory', { bundle })).toBe('iframe_unrendered');
    });
  });

  describe('eventScore レーン', () => {
    it('banner score 取得済で ok', () => {
      const bundle = { eventBanner: { score: 207835 } };
      expect(determineNorthStarLaneState('eventScore', { bundle })).toBe('ok');
    });

    it('balloon eventTotalScore で ok', () => {
      const bundle = { eventBalloon: { eventTotalScore: 100 } };
      expect(determineNorthStarLaneState('eventScore', { bundle })).toBe('ok');
    });

    it('mirror html で ok', () => {
      const bundle = { eventCumulativeScoreMirrorHtml: '<span class="score">1,000</span>' };
      expect(determineNorthStarLaneState('eventScore', { bundle })).toBe('ok');
    });

    it('NDGR score で ok', () => {
      const bundle = {};
      const snap = { officialEventGiftScoreNdgr: 12345 };
      expect(determineNorthStarLaneState('eventScore', { bundle, snap })).toBe('ok');
    });

    it('全部 null で no_event', () => {
      const bundle = { eventBanner: null, eventBalloon: null };
      const snap = { officialEventGiftScoreNdgr: null };
      expect(determineNorthStarLaneState('eventScore', { bundle, snap })).toBe('no_event');
    });
  });

  describe('eventRank レーン', () => {
    it('banner rank で ok', () => {
      const bundle = { eventBanner: { rank: 5 } };
      expect(determineNorthStarLaneState('eventRank', { bundle })).toBe('ok');
    });

    it('v0.1.282: NDGR rank presence は ok にしない（数値非表示）が参加は示す → event_present_unscrapable', () => {
      const bundle = { programStats: { giftPoints: 100 } };
      const snap = { officialNicoEventRankNdgr: 50 };
      // 'ok' でない＝NDGR 順位"数値"は表示しない（field6 silence 維持）。
      // 旧 iframe_unrendered（issue3 で非表示）から、参加事実を可視化する
      // event_present_unscrapable へ（ユーザー報告「参加してるのに出ない」修正）。
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe(
        'event_present_unscrapable'
      );
    });

    it('v0.1.282: NDGR rank presence のみ・ギフト無 → event_present_unscrapable（旧 no_event の誤判定を是正）', () => {
      const bundle = {};
      const snap = { officialNicoEventRankNdgr: 50 };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe(
        'event_present_unscrapable'
      );
    });

    it('mirror html で ok', () => {
      const bundle = { eventCurrentRankMirrorHtml: '<span class="rank-field">現在 2 位</span>' };
      expect(determineNorthStarLaneState('eventRank', { bundle })).toBe('ok');
    });

    it('貢献度ランキング DOM があれば ok（イベント順位レーン併記用）', () => {
      const bundle = { contributionRanking: [{ name: 'a', contribution: 1 }] };
      expect(determineNorthStarLaneState('eventRank', { bundle })).toBe('ok');
    });

    it('全部 null で no_event', () => {
      const bundle = { eventBanner: null };
      const snap = { officialNicoEventRankNdgr: null };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe('no_event');
    });

    it('v0.1.248: banner.rank あり + NDGR null でも ok（真値は DOM banner）', () => {
      const bundle = { eventBanner: { rank: 7 } };
      const snap = { officialNicoEventRankNdgr: null };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe('ok');
    });
  });

  describe('programPoints レーン', () => {
    it('DOM giftPoints で ok', () => {
      const bundle = { programStats: { giftPoints: 550 } };
      expect(determineNorthStarLaneState('programPoints', { bundle })).toBe('ok');
    });

    it('giftPoints = 0 でも ok（0 件も値として有効）', () => {
      const bundle = { programStats: { giftPoints: 0 } };
      expect(determineNorthStarLaneState('programPoints', { bundle })).toBe('ok');
    });

    it('NDGR giftPoints で ok', () => {
      const bundle = {};
      const snap = { officialGiftPointsNdgr: 550 };
      expect(determineNorthStarLaneState('programPoints', { bundle, snap })).toBe('ok');
    });

    it('programStats あるが giftPoints が null → no_program_gift', () => {
      const bundle = { programStats: { giftPoints: null, watchCount: 100 } };
      expect(determineNorthStarLaneState('programPoints', { bundle })).toBe('no_program_gift');
    });

    it('programStats 自体無い → not_yet (但し bundle はある)', () => {
      const bundle = {};
      const snap = {};
      expect(determineNorthStarLaneState('programPoints', { bundle, snap })).toBe('not_yet');
    });
  });

  describe('adRanking レーン', () => {
    it('count > 0 で ok', () => {
      const bundle = { adContributionRanking: [{ rank: 1 }] };
      expect(determineNorthStarLaneState('adRanking', { bundle })).toBe('ok');
    });

    it('mirror html で ok', () => {
      const bundle = { adRankingMirrorHtml: '<ul>...</ul>' };
      expect(determineNorthStarLaneState('adRanking', { bundle })).toBe('ok');
    });

    it('全部 null で fetch_error', () => {
      const bundle = { adContributionRanking: null };
      expect(determineNorthStarLaneState('adRanking', { bundle })).toBe('fetch_error');
    });
  });

  describe('未知の laneId', () => {
    it('missing を返す', () => {
      const bundle = {};
      expect(determineNorthStarLaneState('unknownLane', { bundle })).toBe('missing');
    });
  });

  describe('実機 lv350503428 シナリオ統合検証', () => {
    const bundle = {
      contributionRanking: null,
      giftHistory: null,
      eventBanner: null,
      eventBalloon: null,
      adContributionRanking: [{}, {}, {}, {}, {}],
      adRankingMirrorHtml: null,
      programStats: { giftPoints: 550 },
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null
    };
    const snap = {
      officialNicoEventRankNdgr: 50,
      officialEventGiftScoreNdgr: null,
      officialGiftPointsNdgr: 550
    };

    it('レーン 1 (貢献度) → iframe_unrendered (gift sidebar Vue mount 不全)', () => {
      expect(determineNorthStarLaneState('contributionRanking', { bundle, snap })).toBe('iframe_unrendered');
    });

    it('レーン 2 (ギフト履歴) → iframe_unrendered (giftPoints > 0 でも sidebar 取れず)', () => {
      expect(determineNorthStarLaneState('giftHistory', { bundle, snap })).toBe('iframe_unrendered');
    });

    it('v0.1.282: レーン 3 (イベント累計) → event_present_unscrapable（NDGR 順位50 presence 有・scrape不可。旧 no_event は誤判定＝ユーザー報告の本症状）', () => {
      // 注: この fixture の snap は officialNicoEventRankNdgr:50 を持つ。
      // 旧テストの「event 関連すべて null」は誤記で、実態は「参加中だが
      // cross-origin scrape 不可」＝ユーザー実機の「参加してるのに出ない」。
      expect(determineNorthStarLaneState('eventScore', { bundle, snap })).toBe(
        'event_present_unscrapable'
      );
    });

    it('レーン 4 (番組累計) → ok (550 pt)', () => {
      expect(determineNorthStarLaneState('programPoints', { bundle, snap })).toBe('ok');
    });

    it('v0.1.282: レーン 5 (イベント順位) → event_present_unscrapable（NDGR 順位"数値"は出さず参加事実のみ可視化）', () => {
      // field6 silence 維持: 'ok' でない＝NDGR 順位数値は表示しない。
      // 旧 iframe_unrendered（issue3 で非表示＝参加してるのに消える）を是正。
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe(
        'event_present_unscrapable'
      );
    });

    it('+α (広告ランキング) → ok (5 件取れている)', () => {
      expect(determineNorthStarLaneState('adRanking', { bundle, snap })).toBe('ok');
    });
  });
});

describe('hasEventParticipationSignal', () => {
  it('NDGR イベント順位 presence → true（数値は使わず presence のみ）', () => {
    expect(
      hasEventParticipationSignal(null, { officialNicoEventRankNdgr: 2 })
    ).toBe(true);
    expect(
      hasEventParticipationSignal(null, { officialNicoEventRankNdgr: 288 })
    ).toBe(true);
  });

  it('NDGR スコア/タイトル presence → true', () => {
    expect(
      hasEventParticipationSignal(null, { officialEventGiftScoreNdgr: 1500 })
    ).toBe(true);
    expect(
      hasEventParticipationSignal(null, { officialNicoEventTitleNdgr: '出前館' })
    ).toBe(true);
  });

  it('bundle のイベント痕跡 → true', () => {
    expect(hasEventParticipationSignal({ eventBanner: {} }, null)).toBe(true);
    expect(
      hasEventParticipationSignal(
        { eventCurrentRankMirrorHtml: '<span>2</span>' },
        null
      )
    ).toBe(true);
  });

  it('シグナル皆無 → false（真のイベント不参加）', () => {
    expect(hasEventParticipationSignal(null, null)).toBe(false);
    expect(hasEventParticipationSignal({}, {})).toBe(false);
    expect(
      hasEventParticipationSignal(
        { programStats: { giftPoints: 11900 } },
        { officialGiftPointsNdgr: 11900, officialNicoEventTitleNdgr: '' }
      )
    ).toBe(false);
  });
});

describe('event_present_unscrapable（v0.1.282 参加検出・実機 lv350558940 相当）', () => {
  // 実機: NDGR 順位2 はあるが score/title 無し・iframe scrape 不可
  const snapParticipating = {
    officialNicoEventRankNdgr: 2,
    officialEventGiftScoreNdgr: null,
    officialNicoEventTitleNdgr: '',
    officialGiftPointsNdgr: 11900
  };
  const bundleNoScrape = {
    eventBanner: null,
    eventBalloon: null,
    eventCumulativeScoreMirrorHtml: null,
    eventCurrentRankMirrorHtml: null,
    contributionRanking: null,
    programStats: { giftPoints: 11900 }
  };

  it('eventScore: 参加シグナル有・値無 → event_present_unscrapable（旧 no_event）', () => {
    expect(
      determineNorthStarLaneState('eventScore', {
        bundle: bundleNoScrape,
        snap: snapParticipating
      })
    ).toBe('event_present_unscrapable');
  });

  it('eventRank: 参加シグナル有・scrape無 → event_present_unscrapable（旧 iframe_unrendered）', () => {
    expect(
      determineNorthStarLaneState('eventRank', {
        bundle: bundleNoScrape,
        snap: snapParticipating
      })
    ).toBe('event_present_unscrapable');
  });

  it('真のイベント不参加（NDGR シグナル皆無）は従来どおり no_event', () => {
    const snapNoEvent = {
      officialNicoEventRankNdgr: null,
      officialEventGiftScoreNdgr: null,
      officialNicoEventTitleNdgr: '',
      officialGiftPointsNdgr: 0
    };
    const bundleNoEvent = { programStats: { giftPoints: 0 } };
    expect(
      determineNorthStarLaneState('eventScore', {
        bundle: bundleNoEvent,
        snap: snapNoEvent
      })
    ).toBe('no_event');
    expect(
      determineNorthStarLaneState('eventRank', {
        bundle: bundleNoEvent,
        snap: snapNoEvent
      })
    ).toBe('no_event');
  });

  it('実値が取れていれば従来どおり ok（参加検出が ok を奪わない・回帰防止）', () => {
    expect(
      determineNorthStarLaneState('eventScore', {
        bundle: { eventBanner: { score: 1500 } },
        snap: snapParticipating
      })
    ).toBe('ok');
    expect(
      determineNorthStarLaneState('eventRank', {
        bundle: { eventBanner: { rank: 2 } },
        snap: snapParticipating
      })
    ).toBe('ok');
  });
});
