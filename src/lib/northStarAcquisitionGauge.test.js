import { describe, it, expect } from 'vitest';
import {
  acquisitionPctFromNorthStarLaneState,
  acquisitionPctTitle,
  acquisitionTierFromPct
} from './northStarAcquisitionGauge.js';

describe('northStarAcquisitionGauge', () => {
  it('acquisitionPctFromNorthStarLaneState', () => {
    expect(acquisitionPctFromNorthStarLaneState('ok')).toBe(100);
    expect(acquisitionPctFromNorthStarLaneState('no_event')).toBe(100);
    expect(acquisitionPctFromNorthStarLaneState('no_program_gift')).toBe(100);
    expect(acquisitionPctFromNorthStarLaneState('not_yet')).toBeNull();
    expect(acquisitionPctFromNorthStarLaneState('iframe_unrendered')).toBeNull();
    expect(acquisitionPctFromNorthStarLaneState('fetch_error')).toBe(0);
    expect(acquisitionPctFromNorthStarLaneState('missing')).toBe(0);
  });

  it('acquisitionTierFromPct', () => {
    expect(acquisitionTierFromPct(null)).toBe('wait');
    expect(acquisitionTierFromPct(0)).toBe('none');
    expect(acquisitionTierFromPct(20)).toBe('low');
    expect(acquisitionTierFromPct(50)).toBe('mid');
    expect(acquisitionTierFromPct(80)).toBe('high');
    expect(acquisitionTierFromPct(100)).toBe('full');
  });
});

describe('acquisitionPctTitle(0.1.2131 で popup-entry から外出し)', () => {
  /** 外出し前の popup-entry の分岐をそのまま写したもの(答え合わせ用) */
  const before = (laneId, metric, pct) => {
    if (pct == null) return 'パーセントではありません。ニコ生側の一覧がDOMに出るまでの待機表示です。';
    if (pct >= 100) {
      let t = 'この「%」はレーンの公式DOM鏡像の成立度（成立時は設計上ここが100%）です。番組累計ポイントの増え方やギフト履歴の行数とは別の指標です。';
      if (laneId === 'giftHistory' && metric === 'throws') t = '一覧の数字は「投げた回数」です（pt ではありません）。公式のギフト履歴合計ptや、レーン「番組累計ポイント」（ティッカーのギフトpt累計）とは別指標です。';
      else if (laneId === 'giftHistory' && metric === 'points') t = '公式履歴タブ由来のユーザー別「履歴上の合計pt」です。レーン「番組累計ポイント」（番組全体のギフトpt累計）とは別物です。';
      return t;
    }
    return 'レーン単位の取得失敗・未取得を示します。ギフト履歴の「取り逃し率」ではありません。';
  };
  it('全部の組み合わせで外出し前と同じ文を返す', () => {
    for (const laneId of ['giftHistory', 'contributionRanking', 'adRanking', '']) {
      for (const metric of ['throws', 'points', '']) {
        for (const pct of [null, 0, 50, 99, 100, 120]) {
          expect(acquisitionPctTitle(laneId, metric, pct)).toBe(before(laneId, metric, pct));
        }
      }
    }
  });
});
