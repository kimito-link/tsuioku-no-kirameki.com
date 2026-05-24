import { describe, it, expect } from 'vitest';
import {
  determineNorthStarLaneState,
  hasEventParticipationSignal,
  officialEventConfirmedFromDom
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

    it('v0.1.359: NDGR score 単独（公式DOM証拠なし）は no_event（誤表示根絶）', () => {
      // 旧挙動は ok だったが、非イベント配信で NDGR に score が乗り「72」等を
      // 誤表示していた。公式 DOM 証拠が無ければ NDGR score 単独では出さない。
      const bundle = {};
      const snap = { officialEventGiftScoreNdgr: 12345 };
      expect(determineNorthStarLaneState('eventScore', { bundle, snap })).toBe('no_event');
    });

    it('v0.1.359: 公式DOM証拠ありなら NDGR score を補助として ok', () => {
      // banner（参加確証）が在れば、具体スコアが NDGR 由来でも ok（目安併用可）。
      const bundle = { eventBanner: { rank: 3 } };
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

    it('v0.1.359: NDGR rank + NDGR タイトルのみ（公式DOM証拠なし）→ ok にしない', () => {
      // v0.1.325 では NDGR タイトルを確証材料にして ok（目安）にしていたが、
      // タイトル自体が文字化けや別文脈値のことがあり誤表示の温床だった。
      // v0.1.359: 公式 DOM 証拠（banner/balloon/鏡）が無ければ NDGR の title/rank
      // だけでは ok にしない（実機の「現在N位」誤表示を根絶）。
      const bundle = { programStats: { giftPoints: 100 } };
      const snap = { officialNicoEventRankNdgr: 50, officialNicoEventTitleNdgr: 'はるまつり' };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe('no_event');
    });

    it('v0.1.359: 公式DOM証拠（banner）ありで NDGR rank → 目安として ok', () => {
      // banner で参加確証が取れていれば、具体順位が NDGR 由来でも目安表示で ok。
      const bundle = { eventBanner: { score: 1000 } };
      const snap = { officialNicoEventRankNdgr: 50 };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe('ok');
    });

    it('v0.1.359: NDGR rank 単独（公式DOM証拠なし）→ ok にしない（誤表示防止）', () => {
      // 実機: イベント不参加の配信で NDGR rank が乗り「現在N位」と誤表示していた。
      const bundle = {};
      const snap = { officialNicoEventRankNdgr: 50 };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).not.toBe('ok');
    });

    it('v0.1.359: NDGR rank + giftPoints のみ（公式DOM証拠なし）→ ok にしない', () => {
      // giftPoints>0 はギフト配信の証だがイベント参加の証ではない。rank を出さない。
      const bundle = { programStats: { giftPoints: 900 } };
      const snap = { officialNicoEventRankNdgr: 50 };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).not.toBe('ok');
    });

    it('mirror html で ok', () => {
      const bundle = { eventCurrentRankMirrorHtml: '<span class="rank-field">現在 2 位</span>' };
      expect(determineNorthStarLaneState('eventRank', { bundle })).toBe('ok');
    });

    it('v0.1.284: 貢献度ランキング DOM のみでは ok にしない（コメントユーザー混入の誤認回避）', () => {
      // v0.1.284: ユーザー指摘「イベント現在順位レーンに配信者じゃなくコメント
      // ユーザーが出る」を是正。eventRank レーンの「参考として貢献度上位 10 件」
      // 併記表示は撤去済（contributionRanking レーンが正本）。よって貢献度の
      // 件数だけで eventRank を ok にしない＝該当データは無いので no_event/
      // 別 reason に倒れる（このケースでは banner/NDGR/giftPoints 無 → no_event）。
      const bundle = { contributionRanking: [{ name: 'a', contribution: 1 }] };
      expect(determineNorthStarLaneState('eventRank', { bundle })).toBe('no_event');
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

    it('v0.1.359: レーン 3 (イベント累計) → NDGR 順位50 単独・公式DOM証拠なしは no_event', () => {
      // この fixture の snap は officialNicoEventRankNdgr:50 を持つが、banner/balloon/
      // 鏡 HTML が全て無い＝公式 DOM 証拠なし。v0.1.359 では NDGR を参加確証にしない
      // ため no_event（非イベント配信での誤表示「72」等を根絶）。
      expect(determineNorthStarLaneState('eventScore', { bundle, snap })).toBe('no_event');
    });

    it('レーン 4 (番組累計) → ok (550 pt)', () => {
      expect(determineNorthStarLaneState('programPoints', { bundle, snap })).toBe('ok');
    });

    it('v0.1.325: レーン 5 (イベント順位) → NDGR 順位50 単独・参加シグナル無しは ok にしない', () => {
      // v0.1.325: この fixture の snap は officialNicoEventRankNdgr:50 だが、イベント
      // タイトル/バナー/バルーン/スコアが全て無い＝イベント参加が確証できない。
      // 実機 lv350589034 で不参加配信に rank=50 が出た誤表示を是正し、rank 以外の
      // 参加シグナルが無ければ ok にしない（誤った「現在50位」を出さない）。
      // この fixture は giftPoints:550>0 なので iframe_unrendered（ギフトはあるが
      // sidebar 取れず）に倒れる。
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).not.toBe('ok');
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

describe('event_present_unscrapable（v0.1.359: 公式DOM証拠あり・具体値なし）', () => {
  // v0.1.359: event_present_unscrapable は「公式 DOM 証拠（banner 等）で参加は
  // 確証できるが、具体的なスコア/順位がまだ取れていない」ときに限る。
  // NDGR シグナルだけでは参加確証にならない（誤表示根絶）ため no_event に倒す。

  it('v0.1.359: NDGR rank だけで DOM 証拠なし → eventScore は no_event（旧 unscrapable）', () => {
    // 旧挙動は event_present_unscrapable だったが、NDGR を参加確証にしない方針へ。
    const bundleNoScrape = {
      eventBanner: null,
      eventBalloon: null,
      eventCumulativeScoreMirrorHtml: null,
      eventCurrentRankMirrorHtml: null,
      programStats: { giftPoints: 11900 }
    };
    const snapNdgrOnly = {
      officialNicoEventRankNdgr: 2,
      officialEventGiftScoreNdgr: null,
      officialNicoEventTitleNdgr: '',
      officialGiftPointsNdgr: 11900
    };
    expect(
      determineNorthStarLaneState('eventScore', { bundle: bundleNoScrape, snap: snapNdgrOnly })
    ).toBe('no_event');
    expect(
      determineNorthStarLaneState('eventRank', { bundle: bundleNoScrape, snap: snapNdgrOnly })
    ).toBe('no_event');
  });

  it('v0.1.359: banner で参加確証ありだが具体スコア/順位が無い → event_present_unscrapable', () => {
    // banner は在るが score/rank も鏡も NDGR 値も無い（scrape まだ）。
    const bundle = { eventBanner: {} };
    const snap = {};
    expect(
      determineNorthStarLaneState('eventScore', { bundle, snap })
    ).toBe('event_present_unscrapable');
    expect(
      determineNorthStarLaneState('eventRank', { bundle, snap })
    ).toBe('event_present_unscrapable');
  });

  it('真のイベント不参加（DOM 証拠も NDGR も皆無）は no_event', () => {
    const snapNoEvent = {
      officialNicoEventRankNdgr: null,
      officialEventGiftScoreNdgr: null,
      officialNicoEventTitleNdgr: '',
      officialGiftPointsNdgr: 0
    };
    const bundleNoEvent = { programStats: { giftPoints: 0 } };
    expect(
      determineNorthStarLaneState('eventScore', { bundle: bundleNoEvent, snap: snapNoEvent })
    ).toBe('no_event');
    expect(
      determineNorthStarLaneState('eventRank', { bundle: bundleNoEvent, snap: snapNoEvent })
    ).toBe('no_event');
  });

  it('公式DOM証拠ありで実値も取れていれば ok（回帰防止）', () => {
    expect(
      determineNorthStarLaneState('eventScore', {
        bundle: { eventBanner: { score: 1500 } },
        snap: {}
      })
    ).toBe('ok');
    expect(
      determineNorthStarLaneState('eventRank', {
        bundle: { eventBanner: { rank: 2 } },
        snap: {}
      })
    ).toBe('ok');
  });
});

describe('officialEventConfirmedFromDom (v0.1.359)', () => {
  it('eventBanner があれば true', () => {
    expect(officialEventConfirmedFromDom({ eventBanner: { rank: 1 } })).toBe(true);
  });

  it('eventBalloon.eventTotalScore が数値なら true', () => {
    expect(
      officialEventConfirmedFromDom({ eventBalloon: { eventTotalScore: 100 } })
    ).toBe(true);
  });

  it('event 系 mirror HTML があれば true', () => {
    expect(
      officialEventConfirmedFromDom({ eventCumulativeScoreMirrorHtml: '<span>1</span>' })
    ).toBe(true);
    expect(
      officialEventConfirmedFromDom({ eventCurrentRankMirrorHtml: '<span>現在1位</span>' })
    ).toBe(true);
  });

  it('NDGR 値しか無い bundle は false（NDGR は確証材料にしない）', () => {
    // 表示ゲートでは NDGR を信用しない。bundle に DOM 証拠が無ければ false。
    expect(officialEventConfirmedFromDom({ programStats: { giftPoints: 900 } })).toBe(
      false
    );
    expect(officialEventConfirmedFromDom({})).toBe(false);
  });

  it('eventBalloon があっても eventTotalScore が無ければ false', () => {
    // 番組累計ポイントは非イベントでも出るので balloon の存在だけでは採らない。
    expect(officialEventConfirmedFromDom({ eventBalloon: { programPoints: 500 } })).toBe(
      false
    );
  });

  it('null / 非オブジェクトは false', () => {
    expect(officialEventConfirmedFromDom(null)).toBe(false);
    expect(officialEventConfirmedFromDom(undefined)).toBe(false);
    expect(officialEventConfirmedFromDom('x')).toBe(false);
  });
});
