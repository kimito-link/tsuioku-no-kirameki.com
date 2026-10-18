import { describe, expect, it } from 'vitest';
import { mergeTailRowsIntoDisplay } from './mergeTailRowsIntoDisplay.js';

const LV = 'lv888888888';
const T0 = 1_800_000_000_000;

/** csummary.recent 由来の薄い行(commentNo/text/capturedAt のみ・id は合成) */
const thin = (n) => ({ id: `nls_tail_${LV}_${n - 1}`, liveId: LV, commentNo: String(n), text: `mock body ${n}`, capturedAt: T0 + n * 1000 });
/** ctail 由来の豊かな行 */
const rich = (n) => ({ id: `c-${n}`, liveId: LV, commentNo: String(n), text: `mock body ${n}`, userId: `u${n}`, nickname: `nick${n}`, avatarUrl: `https://example.com/${n}.jpg`, capturedAt: T0 + n * 1000 });

describe('mergeTailRowsIntoDisplay', () => {
  it('★summary 25 行 + tail 25 行(同じコメント)は 25 行になる(e2e の 25→50 の再現)', () => {
    const base = Array.from({ length: 25 }, (_, i) => thin(i + 1));
    const tail = Array.from({ length: 25 }, (_, i) => rich(i + 1));
    expect(mergeTailRowsIntoDisplay(base, tail, { liveId: LV })).toHaveLength(25);
  });

  it('★重複は捨てずに統合する: 薄い summary 行に tail の userId・ニックネーム・アイコンを補う', () => {
    const out = mergeTailRowsIntoDisplay([thin(1)], [rich(1)], { liveId: LV });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ commentNo: '1', userId: 'u1', nickname: 'nick1', avatarUrl: 'https://example.com/1.jpg' });
  });

  it('commentNo が無い行も、同じ人・同じ文言・近い時刻なら畳む(既存 storedCommentDedupeKey と同じ規則)', () => {
    const a = { liveId: LV, userId: 'u1', text: 'こんにちは', capturedAt: T0 };
    const b = { liveId: LV, userId: 'u1', text: 'こんにちは', capturedAt: T0 + 30_000 };
    expect(mergeTailRowsIntoDisplay([a], [b], { liveId: LV })).toHaveLength(1);
  });

  it('★重ならない行は両方残る(順序は base → 新規 tail)', () => {
    const base = [thin(1), thin(2)];
    const tail = [rich(2), rich(3), rich(4)];
    const out = mergeTailRowsIntoDisplay(base, tail, { liveId: LV });
    expect(out.map((r) => r.commentNo)).toEqual(['1', '2', '3', '4']);
  });

  it('★別バケット(10分以上あと)の同じ文言は別の発言として残す', () => {
    const a = { liveId: LV, userId: 'u1', text: '草', capturedAt: T0 };
    const b = { liveId: LV, userId: 'u1', text: '草', capturedAt: T0 + 11 * 60 * 1000 };
    expect(mergeTailRowsIntoDisplay([a], [b], { liveId: LV })).toHaveLength(2);
  });

  it('tail に liveId が無い行(書き出し側の生の行)でも、opts.liveId で base と同じキーになる', () => {
    const a = { liveId: LV, userId: 'u1', text: 'やあ', capturedAt: T0 };
    const b = { userId: 'u1', text: 'やあ', capturedAt: T0 + 1000 };
    expect(mergeTailRowsIntoDisplay([a], [b], { liveId: LV })).toHaveLength(1);
  });

  it('引数の配列は変更しない(新しい配列を返す)', () => {
    const base = [thin(1)];
    const tail = [rich(1), rich(2)];
    const baseCopy = JSON.stringify(base);
    const tailCopy = JSON.stringify(tail);
    const out = mergeTailRowsIntoDisplay(base, tail, { liveId: LV });
    expect(JSON.stringify(base)).toBe(baseCopy);
    expect(JSON.stringify(tail)).toBe(tailCopy);
    expect(out).not.toBe(base);
  });

  it('tail が空なら base をそのまま返す・base が空なら tail を返す', () => {
    const base = [thin(1)];
    expect(mergeTailRowsIntoDisplay(base, [], { liveId: LV })).toBe(base);
    const tail = [rich(1)];
    expect(mergeTailRowsIntoDisplay([], tail, { liveId: LV })).toEqual(tail);
  });

  it('壊れた入力でも落ちない(配列でない・null の要素)', () => {
    expect(() => mergeTailRowsIntoDisplay(/** @type {any} */ (null), /** @type {any} */ (undefined))).not.toThrow();
    expect(mergeTailRowsIntoDisplay(/** @type {any} */ (null), [rich(1)], { liveId: LV })).toHaveLength(1);
    expect(() => mergeTailRowsIntoDisplay([thin(1)], /** @type {any} */ ([null, 3, rich(2)]), { liveId: LV })).not.toThrow();
  });

  it('★大きい base(2万件)でも、キーを作る行数は tail に比例して小さい(毎回 O(N) にしない)', () => {
    const base = Array.from({ length: 20_000 }, (_, i) => ({ liveId: LV, commentNo: String(i + 1), text: `t${i + 1}`, capturedAt: T0 + i }));
    const tail = Array.from({ length: 300 }, (_, i) => ({ liveId: LV, commentNo: String(19_800 + i + 1), text: `t${19_800 + i + 1}`, capturedAt: T0 + i }));
    let calls = 0;
    const probe = (row) => { calls += 1; return String(row.commentNo); };
    const out = mergeTailRowsIntoDisplay(base, tail, { liveId: LV, keyOf: probe });
    expect(calls).toBeLessThanOrEqual(300 * 2 + 64 + 300);
    // 末尾 200 件(19,801〜20,000)は tail と重なるので畳まれ、tail の残り100件だけ増える
    expect(out).toHaveLength(20_000 + 100);
  });

  it('★重なりが base の末尾にあれば大きい base でも畳める(畳み込み直後の想定)', () => {
    const base = Array.from({ length: 5000 }, (_, i) => ({ liveId: LV, commentNo: String(i + 1), text: `t${i + 1}`, capturedAt: T0 + i }));
    const tail = [base[4998], base[4999], { liveId: LV, commentNo: '5001', text: 't5001', capturedAt: T0 + 5001 }];
    const out = mergeTailRowsIntoDisplay(base, tail.map((r) => ({ ...r })), { liveId: LV });
    expect(out).toHaveLength(5001);
  });
});
