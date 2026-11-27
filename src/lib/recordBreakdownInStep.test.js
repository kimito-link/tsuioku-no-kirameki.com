import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createRecordBreakdownInStepState,
  resolveRecordBreakdownInStep
} from './recordBreakdownInStep.js';
import { formatCommentRecordBreakdownLine, summarizeCommentRecordBreakdown } from './commentRecordBreakdown.js';
import { createMonotonicCommentCountState, resolveMonotonicCommentCount } from './monotonicCommentCount.js';

const here = dirname(fileURLToPath(import.meta.url));

/** 記録の行(保存と同じ形: commentNo あり)。 */
const normalRow = (/** @type {number} */ no) => ({ commentNo: String(no), text: `c${no}`, userId: `u${no % 50}` });
const arrivalRow = (/** @type {number} */ no) => ({ commentNo: String(no), text: `放送者の好み「夜」に興味のある${(no % 9) + 1}人が来場しました` });
const systemRow = (/** @type {number} */ no) => ({ commentNo: String(no), text: `お知らせ${no}`, isSystem: true });

/**
 * 配信の記録(保存した行)を作る。ニコ生の実機(lv351893456)に近い割合: およそ 3行に1行が興味来場。
 * @param {number} n
 */
function nicoRecord(n) {
  const out = [];
  for (let i = 1; i <= n; i += 1) out.push(i % 10 < 3 ? arrivalRow(i) : normalRow(i));
  return out;
}

/** @param {readonly any[]} rows */
const rowsOf = (rows, broadcasterUid = '') => ({ rows: rows.map((r) => ({ ...r })), broadcasterUid });

/** setCountDisplay の「記録 → 単調ゲート → 内訳」の順番をそのまま写した小さな画面モデル */
function makeScreen() {
  const gate = createMonotonicCommentCountState();
  const st = createRecordBreakdownInStepState();
  /** @type {{ record: number|null, b: any, line: string|undefined }} */
  const view = { record: null, b: undefined, line: undefined };
  return {
    view,
    /**
     * @param {string} lv
     * @param {number} recorded
     * @param {any} [seen]
     * @param {{ breakdownFollowsRecord?: boolean }} [opts]
     */
    setCountDisplay(lv, recorded, seen = undefined, opts = undefined) {
      const g = resolveMonotonicCommentCount(gate, lv, recorded);
      view.record = g;
      const b = resolveRecordBreakdownInStep(st, lv, g, seen, { followRecord: !!opts?.breakdownFollowsRecord });
      if (b !== undefined) {
        view.b = b;
        view.line = b ? formatCommentRecordBreakdownLine(b, { broadcasterCount: b._broadcasterCount }) : '';
      }
      return b;
    }
  };
}

/** @param {any} b */
const sumOf = (b) => b.normal + b.interestArrival + b.followNotice + b.otherSystem + (b._broadcasterCount || 0);

describe('resolveRecordBreakdownInStep(内訳を記録と同じ行・同じ重複キーで数える)', () => {
  it('★ニコ生の実機再現(lv351893456・過去コメントの大きな読み込み): 内訳の合計はいつも記録と同じで、通常が止まらない', () => {
    const lv = 'lv351893456';
    const all = nicoRecord(2600);
    const bc = { commentNo: '2601', text: '配信者です', userId: 'owner' };
    const record = (/** @type {number} */ n) => [...all.slice(0, n), ...(n >= 2164 ? [bc] : [])];
    const s = makeScreen();

    // 0.1.2242 の決まり(手元の配列で数えた通常以外 + 通常 = 記録 − 通常以外 + 最大を保つ)を、そのまま写したもの
    const old = { normal: 0, interestArrival: 0 };
    const oldStep = (/** @type {number} */ rec, /** @type {any[]} */ rows) => {
      const sum = summarizeCommentRecordBreakdown(rows);
      old.interestArrival = Math.max(old.interestArrival, sum.interestArrival);
      old.normal = Math.max(old.normal, sum.normal, rec - old.interestArrival);
    };

    // 1) まとめ読み込みの途中: 記録(サマリ)は先に 2,164 になったのに、手元の行は 19 行(来場がまだ入っていない)
    const partial = all.filter((r) => !String(r.text).includes('来場')).slice(0, 19);
    s.setCountDisplay(lv, 2164, rowsOf(partial, 'owner'));
    oldStep(2164, partial);
    expect(sumOf(s.view.b)).toBe(2164);
    // 2) 読み込みが終わって全件(保存した行 2,164 件: 通常 1,510 / 興味来場 653 / 配信者 1 の割合)を読む
    let prevNormal = s.view.b.normal;
    const seenNormals = [];
    for (const n of [2164, 2220, 2280, 2340, 2400, 2460, 2520]) {
      const rows = record(n);
      const rec = rows.length;
      s.setCountDisplay(lv, rec, rowsOf(rows, 'owner'));
      oldStep(rec, rows);
      const b = s.view.b;
      expect(sumOf(b)).toBe(rec); // 内訳の合計 = 記録
      expect(b._broadcasterCount).toBe(1);
      expect(b.interestArrival).toBe(rows.filter((r) => String(r.text).includes('来場')).length);
      seenNormals.push(b.normal);
      // 軽い見回り(行を読まない)でも合計は記録のまま
      s.setCountDisplay(lv, rec, undefined, { breakdownFollowsRecord: true });
      expect(sumOf(s.view.b)).toBe(rec);
      prevNormal = b.normal;
    }
    // 読み終わった後は、記録が増えるたびに通常も増える(止まらない)
    for (let i = 1; i < seenNormals.length; i += 1) expect(seenNormals[i]).toBeGreaterThan(seenNormals[i - 1]);
    expect(prevNormal).toBe(seenNormals[seenNormals.length - 1]);
    // 0.1.2242 の決まりでは通常が 2,164 − 0 = 2,164 前後で固定され、記録 2,520 まで来ても動かず、合計が記録を超えていた
    expect(old.normal + old.interestArrival).toBeGreaterThan(2520);
  });

  it('記録の行を読み終えた後は、内訳はどの分類も減らず、合計は記録とぴったり同じ', () => {
    const lv = 'lv900000000010';
    const all = [...nicoRecord(300), systemRow(301), { commentNo: '302', text: 'フォローしました', commentType: 'followNotice' }];
    const s = makeScreen();
    /** @type {any} */
    let prev = null;
    for (const n of [50, 51, 120, 200, 260, 302]) {
      s.setCountDisplay(lv, n, rowsOf(all.slice(0, n)));
      s.setCountDisplay(lv, n + 3, undefined, { breakdownFollowsRecord: true }); // まだ読んでいない3行
      const b = s.view.b;
      expect(sumOf(b)).toBe(s.view.record);
      if (prev) for (const k of ['normal', 'interestArrival', 'followNotice', 'otherSystem']) expect(b[k]).toBeGreaterThanOrEqual(prev[k]);
      prev = b;
    }
  });

  it('同じ行を何度読んでも(テールと全件の重なり・同じ番号の行)数は増えない(保存と同じ重複キー)', () => {
    const st = createRecordBreakdownInStepState();
    const rows = nicoRecord(40);
    const b = resolveRecordBreakdownInStep(st, 'lv1', 40, { rows: [...rows, ...rows.slice(30).map((r) => ({ ...r }))] });
    expect(b && sumOf(b)).toBe(40);
    expect(b?.interestArrival).toBe(12);
    expect(b?.normal).toBe(28);
  });

  it('★同じ配信の途中で、後から短い配列で数え直しても内訳は減らない(1,072 → 285 の再現)', () => {
    const s = makeScreen();
    const lv = 'lv900000000002';
    const all = nicoRecord(1072);
    s.setCountDisplay(lv, 1072, rowsOf(all));
    const before = { ...s.view.b };
    s.setCountDisplay(lv, 285, rowsOf(all.slice(0, 285)));
    expect(s.view.record).toBe(1072);
    expect(s.view.b).toMatchObject({ normal: before.normal, interestArrival: before.interestArrival });
  });

  it('まとめ読み込み中(手元の配列が止まっている)でも、軽い見回りの記録に合わせて合計が動く', () => {
    const s = makeScreen();
    const lv = 'lv900000000001';
    const stale = nicoRecord(2001);
    s.setCountDisplay(lv, 2001, rowsOf(stale));
    for (const rec of [2600, 3400, 4200, 5104]) {
      s.setCountDisplay(lv, rec, undefined, { breakdownFollowsRecord: true });
      expect(s.view.record).toBe(rec);
      expect(sumOf(s.view.b)).toBe(rec);
      s.setCountDisplay(lv, rec, rowsOf(stale));
      expect(sumOf(s.view.b)).toBe(rec);
    }
  });

  it('配信者・システム・フォロー通知の行を分ける(配信者は表示から外すのと同じ userId の一致)', () => {
    const st = createRecordBreakdownInStepState();
    const rows = [
      ...Array.from({ length: 90 }, (_, i) => normalRow(i + 1)),
      systemRow(91),
      { commentNo: '92', text: 'フォローしました', commentType: 'followNotice' },
      ...Array.from({ length: 8 }, (_, i) => ({ commentNo: String(93 + i), text: `bc${i}`, userId: 'owner' }))
    ];
    const b = resolveRecordBreakdownInStep(st, 'lv1', 100, { rows, broadcasterUid: 'owner' });
    expect(b).toMatchObject({ total: 100, normal: 90, otherSystem: 1, followNotice: 1, _broadcasterCount: 8 });
    const line = formatCommentRecordBreakdownLine(/** @type {any} */ (b), { broadcasterCount: 8 });
    expect(line).toBe('内訳: 通常 90 / フォロー通知 1 / システム 1 / 配信者 8');
  });

  it('一度も行を数えていない配信では、軽い見回りから内訳を作らない(最初の全件読み直しを待つ)', () => {
    const st = createRecordBreakdownInStepState();
    expect(resolveRecordBreakdownInStep(st, 'lv1', 300, undefined, { followRecord: true })).toBeUndefined();
  });

  it('followRecord を付けない呼び出し(配信の無い画面など)は内訳の行に触らない', () => {
    const st = createRecordBreakdownInStepState();
    resolveRecordBreakdownInStep(st, 'lv1', 10, rowsOf(nicoRecord(10)));
    expect(resolveRecordBreakdownInStep(st, 'lv1', 99, undefined)).toBeUndefined();
  });

  it('null(行を隠す)は隠したまま。軽い見回りで勝手に出し直さない', () => {
    const st = createRecordBreakdownInStepState();
    resolveRecordBreakdownInStep(st, 'lv1', 10, rowsOf(nicoRecord(10)));
    expect(resolveRecordBreakdownInStep(st, 'lv1', 10, null)).toBeNull();
    expect(resolveRecordBreakdownInStep(st, 'lv1', 20, undefined, { followRecord: true })).toBeUndefined();
  });

  it('配信が変わったら台帳をやり直す(前の配信の数を持ち越さない)', () => {
    const st = createRecordBreakdownInStepState();
    resolveRecordBreakdownInStep(st, 'lv1', 5000, rowsOf(nicoRecord(5000)));
    expect(resolveRecordBreakdownInStep(st, 'lv2', 30, undefined, { followRecord: true })).toBeUndefined();
    const b = resolveRecordBreakdownInStep(st, 'lv2', 30, rowsOf(nicoRecord(30)));
    expect(b && sumOf(b)).toBe(30);
    expect(b?.interestArrival).toBe(9);
  });

  it('記録が数字でない(「この配信は未取得」など)ときは、読んだ行の数を使う', () => {
    const st = createRecordBreakdownInStepState();
    const b = resolveRecordBreakdownInStep(st, 'lv1', null, rowsOf(nicoRecord(3)));
    expect(b && sumOf(b)).toBe(3);
  });

  it('配信が分からない(lv でない)ときは、その行だけを数える(覚えを汚さない)', () => {
    const st = createRecordBreakdownInStepState();
    const b = resolveRecordBreakdownInStep(st, '', 3, rowsOf(nicoRecord(3)));
    expect(b && sumOf(b)).toBe(3);
    expect(st.lv).toBe('');
  });

  it('全サービス: 他サービスの疑似 lv(YouTube・Twitch 等は ytNicoShim の疑似 lv)でも同じに動く', () => {
    const s = makeScreen();
    const pseudoLv = 'lv990000012345';
    const yt = Array.from({ length: 900 }, (_, i) => ({ commentNo: String(i + 1), text: `yt${i}`, ytPlatform: 'youtube' }));
    s.setCountDisplay(pseudoLv, 100, rowsOf(yt.slice(0, 100)));
    s.setCountDisplay(pseudoLv, 900, undefined, { breakdownFollowsRecord: true });
    expect(s.view.b).toMatchObject({ normal: 900, interestArrival: 0 });
    s.setCountDisplay(pseudoLv, 900, rowsOf(yt));
    expect(s.view.b).toMatchObject({ normal: 900 });
  });
});

describe('popup-entry の配線(内訳が記録と同じ行から数える)', () => {
  const src = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');
  const setCount = src.slice(src.indexOf('function setCountDisplay('), src.indexOf('function setCountDisplay(') + 9000);

  it('setCountDisplay は単調ゲート後の記録(recordedNum)と同じ lv で内訳を決める', () => {
    expect(setCount).toMatch(/resolveRecordBreakdownInStep\(\s*_recordBreakdownInStepState,\s*watchPopupLastPaintedLiveId,\s*recordedNum,\s*breakdown,/);
    expect(setCount.indexOf('resolveMonotonicCommentCount(')).toBeLessThan(setCount.indexOf('resolveRecordBreakdownInStep('));
  });

  it('軽い見回り(applyLightweightPanelSummaryCards・applyPanelMetricsFromContent)は内訳を記録に合わせる', () => {
    for (const fn of ['async function applyLightweightPanelSummaryCards(', 'function applyPanelMetricsFromContent(']) {
      const at = src.indexOf(fn);
      expect(at).toBeGreaterThan(0);
      const body = src.slice(at, at + 3000);
      expect(body).toContain('setCountDisplay(recorded, snapForCards, undefined, { breakdownFollowsRecord: true });');
    }
  });

  it('全件読み直しは、表示用の配列でなく記録の行(arr)と配信者の userId を渡す', () => {
    expect(src).toContain("const recordedRows = { rows: arr, broadcasterUid: String(_displayEntriesMemo?.broadcasterUid || '') };");
    expect(src).toContain('setCountDisplay(countToShow, snapForCards, recordedRows);');
    expect(src).not.toContain('summarizeCommentRecordBreakdown(displayEntries)');
  });
});
