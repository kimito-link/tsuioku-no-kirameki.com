import { describe, it, expect } from 'vitest';
import {
  isNorthStarLaneWaitingState,
  getNorthStarWaitFootnote,
  getNorthStarWaitRotationMessages,
  buildNorthStarLaneWaitingShellHtml,
  NORTH_STAR_WAITING_STATES,
  NORTH_STAR_WAIT_HONEST_THRESHOLD_MS,
  isNorthStarEventLaneWaitTimedOut,
  NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS,
  NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS
} from './northStarLaneWaitingUi.js';

describe('northStarLaneWaitingUi', () => {
  it('NORTH_STAR_WAITING_STATES に not_yet / iframe_unrendered', () => {
    expect(NORTH_STAR_WAITING_STATES.has('not_yet')).toBe(true);
    expect(NORTH_STAR_WAITING_STATES.has('iframe_unrendered')).toBe(true);
    expect(NORTH_STAR_WAITING_STATES.has('missing')).toBe(false);
  });

  it('isNorthStarLaneWaitingState', () => {
    expect(isNorthStarLaneWaitingState('not_yet')).toBe(true);
    expect(isNorthStarLaneWaitingState('iframe_unrendered')).toBe(true);
    expect(isNorthStarLaneWaitingState('no_event')).toBe(false);
  });

  it('getNorthStarWaitFootnote はレーンと state で変える', () => {
    expect(getNorthStarWaitFootnote('contributionRanking', 'not_yet')).toContain('貢献度');
    expect(getNorthStarWaitFootnote('programPoints', 'not_yet')).toContain('番組累計');
    expect(getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered')).toContain(
      '貢献度'
    );
    expect(getNorthStarWaitFootnote('giftHistory', 'iframe_unrendered')).toContain('ギフト');
  });

  it('getNorthStarWaitRotationMessages は各状態で3件以上', () => {
    const a = getNorthStarWaitRotationMessages('contributionRanking', 'iframe_unrendered');
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a[0].badge.length).toBeGreaterThan(0);
    expect(a[0].line.length).toBeGreaterThan(0);
    const b = getNorthStarWaitRotationMessages('programPoints', 'not_yet');
    expect(b.length).toBeGreaterThanOrEqual(3);
  });

  describe('v0.1.605: 取得経路の正直化', () => {
    it('eventBroadcasters / eventVotingSupporters は「公式から問い合わせ中」と伝える', () => {
      const eb = getNorthStarWaitRotationMessages('eventBroadcasters', 'not_yet');
      const ev = getNorthStarWaitRotationMessages('eventVotingSupporters', 'not_yet');
      expect(eb.length).toBeGreaterThanOrEqual(3);
      expect(ev.length).toBeGreaterThanOrEqual(3);
      expect(eb.some((m) => /公式から/.test(m.line))).toBe(true);
      expect(ev.some((m) => /公式から/.test(m.line))).toBe(true);
    });

    it('default 文言は「配信ページから」を含まない（DOM scrape 時代の誤情報を撤去）', () => {
      // 既知の laneId 以外（=default 分岐）を意図的に渡す。
      const d = getNorthStarWaitRotationMessages('__unknown_lane__', 'not_yet');
      expect(d.length).toBeGreaterThanOrEqual(3);
      for (const m of d) {
        expect(m.line).not.toMatch(/配信ページから/);
      }
    });

    it('eventBroadcasters / eventVotingSupporters / default は「配信ページから」を含まない', () => {
      for (const lid of ['eventBroadcasters', 'eventVotingSupporters', '__unknown__']) {
        const msgs = getNorthStarWaitRotationMessages(lid, 'not_yet');
        for (const m of msgs) {
          expect(m.line).not.toMatch(/配信ページからデータを受け取り中/);
        }
      }
    });
  });

  it('buildNorthStarLaneWaitingShellHtml は data 属性と待機 UI 断片を含む', () => {
    const h = buildNorthStarLaneWaitingShellHtml('contributionRanking');
    expect(h).toContain('data-lane-id="contributionRanking"');
    expect(h).toContain('nl-north-star-lane-wait__short');
    expect(h).not.toContain('<script');
  });

  describe('v0.1.332: 待機UIの正直化（elapsedMs 第3引数）', () => {
    const TH = NORTH_STAR_WAIT_HONEST_THRESHOLD_MS;

    it('閾値は 45-60s の範囲（設計値）', () => {
      expect(TH).toBeGreaterThanOrEqual(45_000);
      expect(TH).toBeLessThanOrEqual(60_000);
    });

    it('後方互換: elapsedMs 省略時は現行と完全一致（footnote）', () => {
      // 引数省略 = undefined。現行の文言と同一であること。
      expect(getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered')).toBe(
        getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered', undefined)
      );
      // v0.1.619: koken API 直叩き化で「まだ開いていない（タブ未オープン）」→「問い合わせ中」へ。
      expect(getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered')).toContain(
        '問い合わせ中'
      );
    });

    it('後方互換: elapsedMs 省略時は現行と完全一致（rotation）', () => {
      const a = getNorthStarWaitRotationMessages('contributionRanking', 'iframe_unrendered');
      const b = getNorthStarWaitRotationMessages(
        'contributionRanking',
        'iframe_unrendered',
        undefined
      );
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThanOrEqual(3); // 現行のローテーション3件
    });

    it('閾値未満は現行文言のまま（footnote / rotation）', () => {
      // v0.1.619: 閾値未満の iframe_unrendered は「問い合わせ中」（API 直叩き化）。
      expect(
        getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered', TH - 1)
      ).toContain('問い合わせ中');
      const msgs = getNorthStarWaitRotationMessages(
        'contributionRanking',
        'iframe_unrendered',
        TH - 1
      );
      expect(msgs.length).toBeGreaterThanOrEqual(3);
    });

    it('閾値超は確定文言へ単方向遷移（footnote）', () => {
      const f = getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered', TH + 1);
      expect(f).toContain('取得できない');
      expect(f).toContain('配信者側の設定');
    });

    it('閾値超は確定メッセージ1件のみ（rotation・ちかちか防止）', () => {
      const msgs = getNorthStarWaitRotationMessages(
        'contributionRanking',
        'iframe_unrendered',
        TH + 1
      );
      expect(msgs).toHaveLength(1);
      expect(msgs[0].line).toContain('出ないみたい');
    });

    it('境界値: ちょうど閾値で確定文言（>=）', () => {
      expect(getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered', TH)).toContain(
        '取得できない'
      );
    });

    it('giftHistory も同様に閾値超で確定文言', () => {
      expect(getNorthStarWaitFootnote('giftHistory', 'iframe_unrendered', TH + 1)).toContain(
        '取得できない'
      );
    });

    it('not_yet（起動直後）には確定文言を出さない（閾値超でも）', () => {
      // 起動直後の not_yet は「取得不能」と言い切らない（取れる可能性がある段階）。
      expect(getNorthStarWaitFootnote('contributionRanking', 'not_yet', TH + 1)).toContain(
        '待っています'
      );
    });

    it('数値（順位/件数）を一切出さない（field6 silence 遵守）', () => {
      const f = getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered', TH + 1);
      const msgs = getNorthStarWaitRotationMessages(
        'contributionRanking',
        'iframe_unrendered',
        TH + 1
      );
      expect(f).not.toMatch(/\d/); // 確定文言に数字を含めない
      expect(msgs[0].line).not.toMatch(/\d/);
    });

    it('eventScore など対象外レーンは確定文言を出さない（contributionRanking/giftHistory のみ）', () => {
      // iframe_unrendered + 閾値超でも、対象外レーンは現行の汎用待機文言のまま。
      const f = getNorthStarWaitFootnote('eventScore', 'iframe_unrendered', TH + 1);
      expect(f).not.toContain('取得できない');
    });
  });

  describe('v0.1.615: イベント系レーン固まりタイムアウト', () => {
    const TO = NORTH_STAR_EVENT_LANE_WAIT_TIMEOUT_MS;

    it('タイムアウト定数は短すぎず長すぎない（5-30s・確定文言50sより手前）', () => {
      expect(TO).toBeGreaterThanOrEqual(5_000);
      expect(TO).toBeLessThan(NORTH_STAR_WAIT_HONEST_THRESHOLD_MS);
    });

    it('対象レーンは event 系2つのみ（貢献度/ギフトは別経路なので含めない）', () => {
      expect(NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS.has('eventBroadcasters')).toBe(true);
      expect(NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS.has('eventVotingSupporters')).toBe(true);
      expect(NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS.has('contributionRanking')).toBe(false);
      expect(NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS.has('giftHistory')).toBe(false);
      expect(NORTH_STAR_EVENT_LANE_TIMEOUT_TARGETS.size).toBe(2);
    });

    it('閾値以上は true（>=・畳む）', () => {
      expect(isNorthStarEventLaneWaitTimedOut(TO)).toBe(true);
      expect(isNorthStarEventLaneWaitTimedOut(TO + 1)).toBe(true);
    });

    it('閾値未満は false（まだ待つ＝畳まない）', () => {
      expect(isNorthStarEventLaneWaitTimedOut(TO - 1)).toBe(false);
      expect(isNorthStarEventLaneWaitTimedOut(0)).toBe(false);
    });

    it('undefined / 非数値 / NaN / Infinity は false（後方互換・暴発防止）', () => {
      expect(isNorthStarEventLaneWaitTimedOut(undefined)).toBe(false);
      expect(isNorthStarEventLaneWaitTimedOut(NaN)).toBe(false);
      // @ts-expect-error 故意に型外を渡して頑健性を確認
      expect(isNorthStarEventLaneWaitTimedOut('13000')).toBe(false);
      // Number.isFinite ガードにより Infinity も false（有界経過 ms 以外は畳まない）。
      expect(isNorthStarEventLaneWaitTimedOut(Infinity)).toBe(false);
    });

    it('timeoutMs を明示で上書きできる', () => {
      expect(isNorthStarEventLaneWaitTimedOut(6_000, 5_000)).toBe(true);
      expect(isNorthStarEventLaneWaitTimedOut(4_000, 5_000)).toBe(false);
    });
  });
});
