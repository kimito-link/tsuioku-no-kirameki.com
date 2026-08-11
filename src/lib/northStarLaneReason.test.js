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

    /*
     * ★v0.1.1339: 実機で起きていた片肺の再現(2026-08-12)。
     *   koken API 経由で履歴が取れていて画面は正しく描けているのに、
     *   判定が bundle.giftHistory(公式サイドバーのDOM)しか見ないため
     *   速報だけが永久に「取得中」と言い続けていた。
     *   contributionRanking / adRanking は v0.1.617 で同じ配線が済んでいた。
     */
    it('★API経路(ledgerRows)で取れていれば ok(公式DOMが空でも)', () => {
      const bundle = { giftHistory: [], programStats: { giftPoints: 2950 } };
      const giftHistoryApiRows = [{ points: 500, senderLabel: 'テスト' }];
      expect(
        determineNorthStarLaneState('giftHistory', { bundle, giftHistoryApiRows })
      ).toBe('ok');
    });

    it('★API経路(rooms)でも ok になる(投げ一覧が無く送り主別だけの場合)', () => {
      const bundle = { giftHistory: [], programStats: { giftPoints: 2950 } };
      const giftHistoryApiRows = [{ userKey: '123', nickname: 'テスト', count: 500 }];
      expect(
        determineNorthStarLaneState('giftHistory', { bundle, giftHistoryApiRows })
      ).toBe('ok');
    });

    it('API経路が空配列なら従来どおり iframe_unrendered(誤って ok にしない)', () => {
      const bundle = { giftHistory: [], programStats: { giftPoints: 2950 } };
      expect(
        determineNorthStarLaneState('giftHistory', { bundle, giftHistoryApiRows: [] })
      ).toBe('iframe_unrendered');
    });

    it('★ギフト0件配信の判定はAPI経路より優先されない(0件なら no_program_gift のまま)', () => {
      // giftPoints=0 = 本当にギフトが無い配信。API rows も当然空。
      const bundle = { giftHistory: [], programStats: { giftPoints: 0 } };
      expect(
        determineNorthStarLaneState('giftHistory', { bundle, giftHistoryApiRows: [] })
      ).toBe('no_program_gift');
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

    it('v0.1.325: NDGR rank + イベント参加シグナル（タイトル等）あり → ok（目安表示）', () => {
      // v0.1.325: NDGR rank 単独では ok にしない（実機 lv350589034 で不参加配信に
      // rank=50 が出た誤表示を是正）。rank 以外のイベント参加シグナル（ここでは
      // イベントタイトル）が確証できる時だけ ok＝目安表示する。
      const bundle = { programStats: { giftPoints: 100 } };
      const snap = { officialNicoEventRankNdgr: 50, officialNicoEventTitleNdgr: 'はるまつり' };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).toBe('ok');
    });

    it('v0.1.325: NDGR rank 単独（イベント参加シグナル無し）→ ok にしない（誤表示防止）', () => {
      // 実機 lv350589034: イベント不参加の配信で NDGR rank=50 が乗り「現在50位」と
      // 誤表示していた。rank 以外の確証が無ければ ok にしない（feedback_ndgr_field6_silence）。
      const bundle = {};
      const snap = { officialNicoEventRankNdgr: 50 };
      expect(determineNorthStarLaneState('eventRank', { bundle, snap })).not.toBe('ok');
    });

    it('v0.1.325: NDGR rank + giftPoints のみ（イベント参加シグナル無し）→ ok にしない', () => {
      // giftPoints>0 はギフト配信の証だがイベント参加の証ではない。rank=50 を出さない。
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

  describe('v0.1.851 取得結果(adResult/contribResult)で3状態を正しく分ける', () => {
    const snap = {};
    it('adRanking: 通信成功(ok:true)だが0件 → no_ranking_data(該当無し・赤にしない)', () => {
      expect(
        determineNorthStarLaneState('adRanking', {
          bundle: {}, snap,
          adResult: { ok: true, status: 200, rows: null }
        })
      ).toBe('no_ranking_data');
    });
    it('adRanking: 本物の失敗(ok:false) → fetch_error(赤)', () => {
      expect(
        determineNorthStarLaneState('adRanking', {
          bundle: {}, snap,
          adResult: { ok: false, status: null, rows: null }
        })
      ).toBe('fetch_error');
    });
    it('adRanking: 未取得(ok:null) → not_yet(赤にしない)', () => {
      expect(
        determineNorthStarLaneState('adRanking', {
          bundle: {}, snap,
          adResult: { ok: null, status: null, rows: null }
        })
      ).toBe('not_yet');
    });
    it('adRanking: rows>0 は adResult より先に ok(優先度テーブル不変)', () => {
      expect(
        determineNorthStarLaneState('adRanking', {
          bundle: {}, snap, nicoadApiRows: [{ rank: 1 }],
          adResult: { ok: true, status: 200, rows: [{ rank: 1 }] }
        })
      ).toBe('ok');
    });
    it('contributionRanking: 成功0件 → no_ranking_data / 失敗 → fetch_error', () => {
      expect(
        determineNorthStarLaneState('contributionRanking', {
          bundle: {}, snap, contribResult: { ok: true, status: 200, rows: [] }
        })
      ).toBe('no_ranking_data');
      expect(
        determineNorthStarLaneState('contributionRanking', {
          bundle: {}, snap, contribResult: { ok: false, status: null, rows: null }
        })
      ).toBe('fetch_error');
    });
    it('result 省略時は従来挙動(後方互換)=adRanking fetch_error / contrib iframe_unrendered', () => {
      expect(determineNorthStarLaneState('adRanking', { bundle: {}, snap })).toBe('fetch_error');
      expect(determineNorthStarLaneState('contributionRanking', { bundle: {}, snap })).toBe('iframe_unrendered');
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

  it('v0.1.325: eventRank: NDGR rank 単独（title空・score無）は ok にしない（誤表示防止）', () => {
    // v0.1.325: snapParticipating は rank=2 だが title 空・score null・banner 無し
    // ＝イベント参加が rank 以外で確証できない。実機 lv350589034 で不参加配信に
    // rank が出た誤表示を是正し、rank 単独では ok にしない。giftPoints>0 なので
    // iframe_unrendered に倒れる（ギフトはあるが sidebar 取れず）。
    expect(
      determineNorthStarLaneState('eventRank', {
        bundle: bundleNoScrape,
        snap: snapParticipating
      })
    ).not.toBe('ok');
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

  describe('v0.1.617: API 直叩き rows を考慮（問い合わせ中を出さない）', () => {
    const snap = { liveId: 'lv1' };

    it('contributionRanking: kokenApiRows>0 なら bundle 空でも ok', () => {
      expect(
        determineNorthStarLaneState('contributionRanking', {
          bundle: {},
          snap,
          kokenApiRows: [{ rank: 1, name: 'SEM', contribution: 250000 }]
        })
      ).toBe('ok');
    });

    it('contributionRanking: kokenApiRows 空 + bundle 空なら従来どおり iframe_unrendered', () => {
      expect(
        determineNorthStarLaneState('contributionRanking', {
          bundle: {},
          snap,
          kokenApiRows: []
        })
      ).toBe('iframe_unrendered');
    });

    it('contributionRanking: kokenApiRows 省略なら旧ロジックと完全同一（後方互換）', () => {
      expect(
        determineNorthStarLaneState('contributionRanking', { bundle: {}, snap })
      ).toBe('iframe_unrendered');
      expect(
        determineNorthStarLaneState('contributionRanking', {
          bundle: { contributionRanking: [{ rank: 1 }] },
          snap
        })
      ).toBe('ok');
    });

    it('adRanking: nicoadApiRows>0 なら bundle 空でも ok（fetch_error を出さない）', () => {
      expect(
        determineNorthStarLaneState('adRanking', {
          bundle: {},
          snap,
          nicoadApiRows: [{ rank: 1, name: '広告主', contribution: 10000 }]
        })
      ).toBe('ok');
    });

    it('adRanking: nicoadApiRows 空 + bundle 空なら従来どおり fetch_error', () => {
      expect(
        determineNorthStarLaneState('adRanking', {
          bundle: {},
          snap,
          nicoadApiRows: []
        })
      ).toBe('fetch_error');
    });

    it('adRanking: nicoadApiRows 省略なら旧ロジックと完全同一（後方互換）', () => {
      expect(determineNorthStarLaneState('adRanking', { bundle: {}, snap })).toBe(
        'fetch_error'
      );
      expect(
        determineNorthStarLaneState('adRanking', {
          bundle: { adContributionRanking: [{ rank: 1 }] },
          snap
        })
      ).toBe('ok');
    });

    it('API rows が非配列（不正値）なら無視して従来ロジック（暴発防止）', () => {
      expect(
        determineNorthStarLaneState('contributionRanking', {
          bundle: {},
          snap,
          // @ts-expect-error 故意に型外
          kokenApiRows: 'x'
        })
      ).toBe('iframe_unrendered');
    });
  });
});
