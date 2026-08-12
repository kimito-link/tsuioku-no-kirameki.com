import { describe, it, expect } from 'vitest';
import {
  shouldSkipLightSupplyOverwrite,
  judgeAndRecordLightSupply,
  formatLightSupplyGuardLine
} from './lightSupplyOverwriteGuard.js';

const base = {
  provisional: true,
  nextSupplyCount: 3,
  rosterEverSeen: 64,
  currentLiveId: 'lv351105288',
  rosterLiveId: 'lv351105288'
};

describe('shouldSkipLightSupplyOverwrite — 2026-08-04 実配信の再現', () => {
  it('★実測の 72枚→3枚 を止める(名簿64人に対し供給3件)', () => {
    const r = shouldSkipLightSupplyOverwrite(base);
    expect(r.skip).toBe(true);
    expect(r.reason).toBe('incomplete-light-supply');
  });

  it('DOM が 0枚でも名簿が守るので止まる(既存2ガードが素通りした窓)', () => {
    // この関数は DOM を一切参照しない=「DOM 0枚」を渡す手段が無いこと自体が仕様。
    // 引数に DOM 由来の値が無いことを構造で担保する。
    const r = shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 0 });
    expect(r.skip).toBe(true);
  });
});

describe('永久 stale にしない fail-safe(通す側)', () => {
  it('確定供給(provisional=false)は常に通す', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, provisional: false });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('settled');
  });

  it('配信が切り替わったら通す(前の配信の名簿で縛らない)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, currentLiveId: 'lv999' });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('live-switch');
  });

  it('現配信が不明なら通す(何を守るべきかが決まらない)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, currentLiveId: '' });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('live-unknown');
  });

  it('名簿が空(初回描画)は通す', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, rosterEverSeen: 0 });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('roster-empty');
  });

  it('供給が名簿に追いついていれば通す(同数)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 64 });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('supply-complete');
  });

  it('供給が名簿を超えていれば通す(増加=正常な更新を止めない)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 100 });
    expect(r.skip).toBe(false);
  });

  it('境界: 名簿より1件少ないだけでも見送る(v0.1.1233の「1枚でも減ったら」契約に揃える)', () => {
    expect(shouldSkipLightSupplyOverwrite({ ...base, nextSupplyCount: 63 }).skip).toBe(true);
  });

  it('大文字/前後空白の配信IDを同一視する(正規化)', () => {
    const r = shouldSkipLightSupplyOverwrite({
      ...base,
      currentLiveId: ' LV351105288 ',
      nextSupplyCount: 64
    });
    expect(r.reason).toBe('supply-complete');
  });
});

describe('★v0.1.1370 — 2026-08-12 実機の再発(24枚→3枚)を再現して止める', () => {
  /*
   * 実機速報:
   *   ★減った1回(最大24→3枚=21枚減・直前の供給元light_summary)
   *   軽い供給の上書き ✅ 見送り0回  ← 名簿19人に対し供給3件なのに素通り
   * 真因: 名簿がまだ配信IDを持たない瞬間(起動直後)に rosterLiveId が空で、
   *   旧実装は `!rosterLid` を【配信切替】として通していた。
   */
  const field = {
    provisional: true,
    nextSupplyCount: 3,
    rosterEverSeen: 19,
    currentLiveId: 'lv351157454',
    rosterLiveId: '' // ★名簿はまだこの配信を記録していない(起動直後の窓)
  };

  it('名簿IDが空でも【人数がある】なら守る(旧実装はここを live-switch で通していた)', () => {
    const r = shouldSkipLightSupplyOverwrite(field);
    expect(r.skip).toBe(true);
    expect(r.reason).toBe('incomplete-light-supply');
  });

  it('名簿IDが空かつ人数も0なら通す(初回描画を止めない=永久stale防止)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...field, rosterEverSeen: 0 });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('roster-unestablished');
  });

  it('別IDへの切替は従来どおり通す(未確立と切替を取り違えない)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...field, rosterLiveId: 'lv999999' });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('live-switch');
  });

  it('名簿IDが空でも供給が人数に追いついていれば通す(正常な更新は止めない)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...field, nextSupplyCount: 19 });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('supply-complete');
  });
});

/*
 * ★v0.1.1380: fail-open【5件目】。v1370 で塞いだつもりが名前を分けただけだった。
 *
 * 実機(2026-08-12・lv351160666):
 *   ★減った1回(最大58→17枚=41枚減・直前の供給元light_summary)
 *   軽い供給の上書き ✅ 見送り0回 → 通した理由の内訳: roster-unestablished1
 *   laneRosterDelta: everSeenMax 51 / lastLid lv351160666(=名簿は育っている)
 * ＝ガードが呼ばれた【その瞬間】だけ名簿が空で、41枚の縮小が通り抜けた。
 *
 * 真因(コードで確定): noteLaneRoster は【描画の後】(popup-entry.js:6960)に呼ばれる。
 *   配信の最初の light 供給では、既に58枚描いてあるのに名簿はまだ0件。
 */
describe('★v0.1.1380 — 名簿が空の窓で縮小が通り抜けるのを止める', () => {
  const field = {
    provisional: true,
    nextSupplyCount: 17, // 実機の供給
    rosterEverSeen: 0, // ★この瞬間だけ名簿は空
    currentLiveId: 'lv351160666',
    rosterLiveId: '',
    paintedTiles: 58 // ★実際には58枚描かれている
  };

  it('★58枚描いてあるのに17件の供給なら止める(実機の再現)', () => {
    const r = shouldSkipLightSupplyOverwrite(field);
    expect(r.skip).toBe(true);
    expect(r.reason).toBe('shrink-vs-painted');
  });

  it('増加・同数は通す(初回描画を止めない)', () => {
    expect(shouldSkipLightSupplyOverwrite({ ...field, nextSupplyCount: 58 }).skip).toBe(false);
    expect(shouldSkipLightSupplyOverwrite({ ...field, nextSupplyCount: 100 }).skip).toBe(false);
  });

  it('★まだ1枚も描いていないなら通す(本当の初回描画)', () => {
    const r = shouldSkipLightSupplyOverwrite({ ...field, paintedTiles: 0 });
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('roster-unestablished');
  });

  it('★paintedTiles 未指定なら従来動作(既存の呼び出しは挙動不変)', () => {
    const { paintedTiles, ...noPainted } = field;
    void paintedTiles;
    const r = shouldSkipLightSupplyOverwrite(noPainted);
    expect(r.skip).toBe(false);
    expect(r.reason).toBe('roster-unestablished');
  });

  it('名簿が育っていれば従来どおり名簿基準で判定する(paintedTilesに依存しない)', () => {
    const r = shouldSkipLightSupplyOverwrite({
      ...field,
      rosterEverSeen: 51,
      rosterLiveId: 'lv351160666',
      paintedTiles: 0
    });
    expect(r.skip).toBe(true);
    expect(r.reason).toBe('incomplete-light-supply');
  });
});

describe('judgeAndRecordLightSupply — 通した理由を必ず残す', () => {
  it('通したら passReasons に理由が記録される(旧実装は捨てていた)', () => {
    const diag = { skipCount: 0, observedCount: 0, worst: null, passReasons: {} };
    judgeAndRecordLightSupply(diag, { ...base, provisional: false });
    expect(diag.observedCount).toBe(1);
    expect(diag.skipCount).toBe(0);
    expect(diag.passReasons.settled).toBe(1);
  });

  it('同じ理由で複数回通ったら数が積み上がる', () => {
    const diag = { skipCount: 0, observedCount: 0, worst: null, passReasons: {} };
    const args = { ...base, rosterLiveId: '', rosterEverSeen: 0 };
    judgeAndRecordLightSupply(diag, args);
    judgeAndRecordLightSupply(diag, args);
    expect(diag.passReasons['roster-unestablished']).toBe(2);
    expect(diag.observedCount).toBe(2);
  });

  it('見送ったときは passReasons を汚さず worst を記録する', () => {
    const diag = { skipCount: 0, observedCount: 0, worst: null, passReasons: {} };
    judgeAndRecordLightSupply(diag, base); // 名簿64 vs 供給3
    expect(diag.skipCount).toBe(1);
    expect(diag.passReasons).toEqual({});
    expect(diag.worst).toEqual({ next: 3, roster: 64 });
  });

  it('計器が無くても判定は返る(計器の不在で本体を止めない)', () => {
    expect(judgeAndRecordLightSupply(null, base).skip).toBe(true);
  });
});

describe('formatLightSupplyGuardLine — 0の意味を区別する', () => {
  it('観測0回は「未計測」と明示する(異常なしと誤読させない)', () => {
    const line = formatLightSupplyGuardLine({ skipCount: 0, observedCount: 0 });
    expect(line).toContain('未計測');
    expect(line).not.toContain('✅');
  });

  it('観測ありで見送り0回は ✅ かつサンプル数を併記する', () => {
    const line = formatLightSupplyGuardLine({ skipCount: 0, observedCount: 12 });
    expect(line).toContain('✅');
    expect(line).toContain('12回観測');
  });

  it('見送りが起きたら回数と最大の食い違いを名指しする', () => {
    const line = formatLightSupplyGuardLine({
      skipCount: 2,
      observedCount: 9,
      worst: { next: 3, roster: 64 }
    });
    expect(line).toContain('2回見送り');
    expect(line).toContain('名簿64人');
    expect(line).toContain('供給3件');
  });

  it('材料が無ければ空文字(速報を壊さない)', () => {
    expect(formatLightSupplyGuardLine(null)).toBe('');
  });

  /*
   * ★v0.1.1370: 「✅見送り0回」だけでは【正常】と【穴で素通り】を区別できない。
   *   通した理由を並べることで、読み手が引き算せずに次の一手を決められるようにする。
   *   [[instrument-value-is-measured-by-fixes-2026-08-12]]: 読んで直せない計器は価値が低い。
   */
  it('通した理由の内訳を行に出す(素通りの原因が読み取れる)', () => {
    const line = formatLightSupplyGuardLine({
      skipCount: 0,
      observedCount: 3,
      passReasons: { 'roster-unestablished': 2, settled: 1 }
    });
    expect(line).toContain('通した理由の内訳');
    expect(line).toContain('roster-unestablished2');
    expect(line).toContain('settled1');
  });

  it('内訳は多い順に並ぶ(主犯が先頭に来る)', () => {
    const line = formatLightSupplyGuardLine({
      skipCount: 0,
      observedCount: 9,
      passReasons: { settled: 1, 'live-switch': 7 }
    });
    expect(line.indexOf('live-switch7')).toBeLessThan(line.indexOf('settled1'));
  });

  it('0件の理由は並べない(嘘の内訳を出さない)', () => {
    const line = formatLightSupplyGuardLine({
      skipCount: 0,
      observedCount: 1,
      passReasons: { settled: 1, 'live-switch': 0 }
    });
    expect(line).not.toContain('live-switch');
  });
});
