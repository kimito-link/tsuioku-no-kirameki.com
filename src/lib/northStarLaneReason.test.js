import { describe, it, expect } from 'vitest';
import { determineNorthStarLaneState } from './northStarLaneReason.js';

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

    it('v0.1.248: NDGR rank 単独では no_event（field 6 は意味確定していないため除外）', () => {
      // 実機 lv350505652 で NDGR=1 だが真値 7 位の乖離が観測された。
      // memory feedback_ndgr_field6_silence.md に従い NDGR field 6 単独 ok は撤去。
      const bundle = {};
      const snap = { officialNicoEventRankNdgr: 50 };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe('no_event');
    });

    it('mirror html で ok', () => {
      const bundle = { eventCurrentRankMirrorHtml: '<span class="rank-field">現在 2 位</span>' };
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

    it('レーン 3 (イベント累計) → no_event (event 関連すべて null)', () => {
      expect(determineNorthStarLaneState('eventScore', { bundle, snap })).toBe('no_event');
    });

    it('レーン 4 (番組累計) → ok (550 pt)', () => {
      expect(determineNorthStarLaneState('programPoints', { bundle, snap })).toBe('ok');
    });

    it('v0.1.248: レーン 5 (イベント順位) → no_event (NDGR 単独は誤情報の可能性、撤去)', () => {
      // v0.1.241 では NDGR fallback で ok にしていたが、v0.1.248 で memory rule に
      // 従い NDGR field 6 単独 → no_event に変更。実機 lv350505652 で誤値が観測された。
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe('no_event');
    });

    it('+α (広告ランキング) → ok (5 件取れている)', () => {
      expect(determineNorthStarLaneState('adRanking', { bundle, snap })).toBe('ok');
    });
  });
});
