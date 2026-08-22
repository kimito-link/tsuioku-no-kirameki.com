import { describe, it, expect } from 'vitest';
import {judgePaintPerComment,
  judgeValueFreshness,
  judgeVersionApplied,
  worstVerdict, dominantRepaintCause } from './anomalyVerdict.js';

/**
 * anomalyVerdict.js — 計器に「正常域」を持たせ異常を名指しする純関数群。
 * 2026-08-04 の会議(why-fixes-dont-stick)の結論を実装したもの。
 *
 * ★このテストの肝は「実際に見落とした値」をそのまま固定すること。
 *   架空の値でテストしても、同じ見落としは防げない。
 */

describe('judgePaintPerComment — 実際に見落とした値で固定する', () => {
  // 2026-08-04 実測: 3分で描画+2013回・コメント+26件 = 77回/件。
  // ユーザーは「ちかちかする」と報告していたが、当時どの計器も異常と言わなかった。
  it('【実測・見落とした値】コメント26件で描画2013回 → badと名指しする', () => {
    const v = judgePaintPerComment(2013, 26);
    expect(v.level).toBe('bad');
    expect(v.detail).toContain('77');
  });

  // 同日の健全な配信(コメント9937件・描画3回)。ここをbadにすると誤報だらけになる。
  it('【実測・健全な値】コメント9937件で描画3回 → ok', () => {
    expect(judgePaintPerComment(3, 9937).level).toBe('ok');
  });

  it('境界: 10回/件ちょうどはbad(暴走と断言してよい水準)', () => {
    expect(judgePaintPerComment(200, 20).level).toBe('bad');
  });

  it('境界: 3回/件ちょうどはwarn(設計上の上限)', () => {
    expect(judgePaintPerComment(60, 20).level).toBe('warn');
  });

  it('3回/件未満はok', () => {
    expect(judgePaintPerComment(59, 20).level).toBe('ok');
  });

  // 母数が小さいと比が跳ねる。起動直後の数件で誤報を出すと計器全体が信用されなくなり、
  // 読み飛ばされる=今回の見落としと同じ結末になる。
  it('母数20件未満はunknown(誤報を出さない)', () => {
    const v = judgePaintPerComment(1000, 19);
    expect(v.level).toBe('unknown');
    expect(v.label).toBe('判定不能');
  });

  it('値が壊れていてもunknownで返す(例外を投げない)', () => {
    expect(judgePaintPerComment(null, 100).level).toBe('unknown');
    expect(judgePaintPerComment(100, undefined).level).toBe('unknown');
    expect(judgePaintPerComment(-1, 100).level).toBe('unknown');
  });
});

describe('judgeValueFreshness — 化石値を新しい値と誤認しない', () => {
  // 2026-08-04 実測: 読み上げ欄が「最終発話88789秒前(約24時間)」の化石値を出し続け、
  // それを見て「変更が効いていない」と誤読して版を重ねた。
  it('【実測・誤認した値】24時間前の値 → badで「化石値」と名指しする', () => {
    const v = judgeValueFreshness(88789 * 1000, 60_000);
    expect(v.level).toBe('bad');
    expect(v.label).toBe('化石値');
    expect(v.detail).toContain('判断してはいけません');
  });

  it('新鮮な値(30秒前)はok', () => {
    expect(judgeValueFreshness(30_000, 60_000).level).toBe('ok');
  });

  it('境界: 10分ちょうどからbad', () => {
    expect(judgeValueFreshness(10 * 60_000, 60_000).level).toBe('bad');
  });

  it('新鮮域を超え10分未満はwarn', () => {
    expect(judgeValueFreshness(5 * 60_000, 60_000).level).toBe('warn');
  });

  it('観測時刻が無ければunknown', () => {
    expect(judgeValueFreshness(null, 60_000).level).toBe('unknown');
  });
});

describe('judgeVersionApplied — 反映3手順の抜けを先に言う', () => {
  it('版が一致すればok', () => {
    expect(judgeVersionApplied('0.1.1247', '0.1.1247').level).toBe('ok');
  });

  // pull しても拡張リロード+F5をしないと届かない。届いていない状態で症状を測ると、
  // 直っていない理由を延々と探すことになる(実際に今日それをやった)。
  it('版が違えばbadで、リロードとF5を促す', () => {
    const v = judgeVersionApplied('0.1.1244', '0.1.1247');
    expect(v.level).toBe('bad');
    expect(v.detail).toContain('リロード');
    expect(v.detail).toContain('F5');
  });

  it('版数が取れなければunknown', () => {
    expect(judgeVersionApplied('', '0.1.1247').level).toBe('unknown');
  });
});

describe('worstVerdict — 最も重い判定を先頭に出す', () => {
  it('badがあればbadを返す', () => {
    const v = worstVerdict([
      { level: 'ok', label: 'a', detail: '' },
      { level: 'bad', label: 'b', detail: '' },
      { level: 'warn', label: 'c', detail: '' }
    ]);
    expect(v.label).toBe('b');
  });

  it('badが無ければwarnを返す', () => {
    const v = worstVerdict([
      { level: 'ok', label: 'a', detail: '' },
      { level: 'warn', label: 'c', detail: '' }
    ]);
    expect(v.label).toBe('c');
  });

  // unknownはokより重い。「測れていない」を「正常」と混同すると、
  // 計器が沈黙しているだけの状態を健全と誤認する(今回の構造的な失敗そのもの)。
  it('unknownはokより重い(測れていないことを正常と混同しない)', () => {
    const v = worstVerdict([
      { level: 'ok', label: 'a', detail: '' },
      { level: 'unknown', label: 'u', detail: '' }
    ]);
    expect(v.label).toBe('u');
  });

  it('空配列や壊れた入力でも落ちない', () => {
    expect(worstVerdict([]).level).toBe('ok');
    expect(worstVerdict(/** @type {any} */ (null)).level).toBe('ok');
    expect(worstVerdict(/** @type {any} */ ([null, 'x'])).level).toBe('ok');
  });
});

describe('★描き直しの原因を名指しする(分母に置いただけの値を原因にしない)', () => {
  // ★2026-08-23 ユーザーの速報の実データ
  const REAL = {
    self_write_skipped: 3310,
    'storage_changed:nls_panel_summary_*': 219,
    'storage_changed:nls_watch_snapshot_*': 196,
    'storage_changed:nls_ctail_*': 8,
    'storage_changed:nls_comment_ingest_log_v1': 25
  };

  it('★止めた回数(self_write_skipped)は分母に入れない', () => {
    const c = dominantRepaintCause(REAL);
    // 3310 を除いた 448 が分母
    expect(c.topName).toBe('storage_changed:nls_panel_summary_*');
    expect(Math.round(c.topShare * 100)).toBe(49);
  });

  it('★実データでコメント由来が少数派だと分かる', () => {
    const c = dominantRepaintCause(REAL);
    expect(c.commentShare).toBeLessThan(0.5);
  });

  it('★コメントが少数派なら「1コメントあたり」と言わない', () => {
    const v = judgePaintPerComment(1106, 143, REAL);
    expect(v.detail).toContain('原因の大半はコメント以外');
    expect(v.detail).toContain('storage_changed:nls_panel_summary_*');
  });

  it('★コメントが主因ならこれまで通り「1コメントあたり」と言う(退化させない)', () => {
    const v = judgePaintPerComment(100, 25, { 'storage_changed:nls_ctail_*': 90, other: 10 });
    expect(v.detail).toContain('1コメントあたり');
    expect(v.detail).not.toContain('原因の大半はコメント以外');
  });

  it('★内訳が無いときは今まで通り(壊さない)', () => {
    const v = judgePaintPerComment(1106, 143);
    expect(v.detail).toContain('1コメントあたり');
    expect(v.level).toBe('warn');
  });

  it('★壊れた内訳を測れたことにしない', () => {
    expect(dominantRepaintCause(null).measured).toBe(false);
    expect(dominantRepaintCause({}).measured).toBe(false);
    expect(dominantRepaintCause({ self_write_skipped: 99 }).measured).toBe(false);
    expect(dominantRepaintCause({ a: 'x', b: -1 }).measured).toBe(false);
  });
});