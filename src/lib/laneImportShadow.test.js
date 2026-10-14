import { describe, expect, it } from 'vitest';
import {
  LANE_IMPORT_SHADOW_MIN_GAP_MS,
  buildImportedLaneView,
  compareImportedToMirror,
  createLaneImportShadowState,
  formatLaneImportShadowLine,
  observeLaneImportShadow,
  rawAdRanking,
  rawGiftRankers
} from './laneImportShadow.js';

const row = (userId, commentNo, nickname = '') => ({ userId, commentNo: String(commentNo), nickname });

describe('rawGiftRankers / rawAdRanking(正規化済み→/live/ の生の形)', () => {
  it('★ギフトは supporterId/supporterName/contribution へ戻す(userPageUrl から uid)', () => {
    const [g] = rawGiftRankers([{ rank: 1, name: 'A', contribution: 500, userPageUrl: 'https://www.nicovideo.jp/user/123', thumbnailUrl: 't' }]);
    expect(g).toMatchObject({ rank: 1, supporterId: '123', supporterName: 'A', contribution: 500, supporterThumbnailUrl: 't' });
  });
  it('★広告は userId/advertiserName/totalContribution へ戻す', () => {
    const [a] = rawAdRanking([{ rank: 2, name: 'B', contribution: 900, userPageUrl: 'https://www.nicovideo.jp/user/77' }]);
    expect(a).toMatchObject({ rank: 2, userId: '77', advertiserName: 'B', totalContribution: 900 });
  });
  it('匿名(userPageUrl なし)は uid を作らない・不正入力は空配列', () => {
    expect(rawGiftRankers([{ name: 'x', contribution: 1 }])[0].supporterId).toBeUndefined();
    expect(rawGiftRankers(null)).toEqual([]);
    expect(rawAdRanking(undefined)).toEqual([]);
  });
});

describe('buildImportedLaneView(/live/ 規則)', () => {
  it('★配信者は数えない・userId 空は捨てる・件数の多い順に並ぶ', () => {
    const comments = [
      row('a:x', 1), row('a:y', 2), row('a:y', 3), row('a:z', 4), row('a:y', 5),
      row('', 6), row('999', 7), row('999', 8)
    ];
    const v = buildImportedLaneView({ comments, broadcasterUid: '999', liveId: 'lv1' });
    const tanu = v.buckets.tanu.map((t) => t.uid);
    expect(tanu).toEqual(['a:y', 'a:x', 'a:z']); // y=3 > x=1 = z=1(同数は先着順)
    expect(v.commenters).toBe(3);
  });
  it('入力が空でも落ちない', () => {
    expect(() => buildImportedLaneView(undefined)).not.toThrow();
    expect(buildImportedLaneView({}).buckets.tanu).toEqual([]);
  });
});

describe('compareImportedToMirror', () => {
  const imported = buildImportedLaneView({
    comments: [row('a:y', 1), row('a:y', 2), row('a:x', 3), row('a:z', 4)],
    liveId: 'lv1'
  });
  const cell = (userId) => ({ userId, displaySrc: '', title: '', idLine: '', nameLine: '' });
  it('★集合が同じで並びだけ違うと、同じ人=全員・先頭の並び一致が下がる', () => {
    const mirror = { tanu: [cell('a:x'), cell('a:y'), cell('a:z')] }; // uid 昇順(拡張の現行)
    const c = compareImportedToMirror(imported, mirror);
    expect(c.tanu).toMatchObject({ ext: 3, live: 3, both: 3, onlyExt: 0, onlyLive: 0, headN: 3 });
    expect(c.tanu.headSame).toBeLessThan(3);
  });
  it('★拡張だけ・規則だけの人を数える', () => {
    const mirror = { tanu: [cell('a:y'), cell('a:x'), cell('a:q')] };
    const c = compareImportedToMirror(imported, mirror);
    expect(c.tanu.onlyExt).toBe(1); // a:q
    expect(c.tanu.onlyLive).toBe(1); // a:z
  });
  it('鏡が無くても落ちない', () => {
    expect(() => compareImportedToMirror(imported, null)).not.toThrow();
    expect(compareImportedToMirror(imported, undefined).tanu.ext).toBe(0);
  });
});

describe('observeLaneImportShadow(間引き・計測・行)', () => {
  const input = {
    comments: [row('a:y', 1), row('a:x', 2)],
    liveId: 'lv1',
    mirror: { tanu: [{ userId: 'a:y' }, { userId: 'a:x' }] }
  };
  it('★間隔が足りなければ計算しない(skipped を数える)', () => {
    const st = createLaneImportShadowState();
    expect(observeLaneImportShadow(st, input, { nowMs: 1_000_000 })).toBe(true);
    expect(observeLaneImportShadow(st, input, { nowMs: 1_000_000 + LANE_IMPORT_SHADOW_MIN_GAP_MS - 1 })).toBe(false);
    expect(st.calls).toBe(1);
    expect(st.skipped).toBe(1);
    expect(observeLaneImportShadow(st, input, { nowMs: 1_000_000 + LANE_IMPORT_SHADOW_MIN_GAP_MS })).toBe(true);
    expect(st.calls).toBe(2);
  });
  it('★計算時間を控え、行に出る。観測前は空', () => {
    const st = createLaneImportShadowState();
    expect(formatLaneImportShadowLine(st)).toBe('');
    let t = 0;
    observeLaneImportShadow(st, input, { nowMs: 5, perfNow: () => (t += 3) });
    expect(st.lastMs).toBe(3);
    const line = formatLaneImportShadowLine(st);
    expect(line).toContain('/live/規則との差');
    expect(line).toContain('たぬ姉の人物: 拡張2/規則2(同じ人2');
    expect(line).toContain('計算1回');
  });
  it('★集合が食い違うと 🔴、並びだけ違うと 🟡、全部同じなら ✅', () => {
    const st1 = createLaneImportShadowState();
    observeLaneImportShadow(st1, input, { nowMs: 1 });
    expect(formatLaneImportShadowLine(st1)).toContain('✅');
    const st2 = createLaneImportShadowState();
    observeLaneImportShadow(st2, { ...input, mirror: { tanu: [{ userId: 'a:x' }, { userId: 'a:y' }] } }, { nowMs: 1 });
    expect(formatLaneImportShadowLine(st2)).toContain('🟡');
    const st3 = createLaneImportShadowState();
    observeLaneImportShadow(st3, { ...input, mirror: { tanu: [{ userId: 'a:q' }] } }, { nowMs: 1 });
    expect(formatLaneImportShadowLine(st3)).toContain('🔴');
  });
  it('不正な入力・null の state でも落ちない', () => {
    expect(observeLaneImportShadow(null, input, { nowMs: 1 })).toBe(false);
    const st = createLaneImportShadowState();
    expect(() => observeLaneImportShadow(st, /** @type {any} */ (null), { nowMs: 1 })).not.toThrow();
  });
});
