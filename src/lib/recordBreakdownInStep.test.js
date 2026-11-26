import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createRecordBreakdownInStepState,
  resolveRecordBreakdownInStep
} from './recordBreakdownInStep.js';
import {
  summarizeCommentRecordBreakdown,
  formatCommentRecordBreakdownLine
} from './commentRecordBreakdown.js';
import { createMonotonicCommentCountState, resolveMonotonicCommentCount } from './monotonicCommentCount.js';

const here = dirname(fileURLToPath(import.meta.url));

/** @param {number} n */
const rows = (n, mk = (/** @type {number} */ i) => ({ text: `c${i}` })) => Array.from({ length: n }, (_, i) => mk(i));

/** setCountDisplay の「記録 → 単調ゲート → 内訳」の順番をそのまま写した小さな画面モデル */
function makeScreen() {
  const gate = createMonotonicCommentCountState();
  const st = createRecordBreakdownInStepState();
  /** @type {{ record: number|null, line: string|undefined }} */
  const view = { record: null, line: undefined };
  return {
    view,
    /**
     * @param {string} lv
     * @param {number} recorded
     * @param {any} [breakdown]
     * @param {{ breakdownFollowsRecord?: boolean }} [opts]
     */
    setCountDisplay(lv, recorded, breakdown = undefined, opts = undefined) {
      const g = resolveMonotonicCommentCount(gate, lv, recorded);
      view.record = g;
      const b = resolveRecordBreakdownInStep(st, lv, g, breakdown, { followRecord: !!opts?.breakdownFollowsRecord });
      if (b !== undefined) view.line = b ? formatCommentRecordBreakdownLine(b, { broadcasterCount: b._broadcasterCount }) : '';
      return b;
    }
  };
}

/** @param {string|undefined} line */
const normalOf = (line) => {
  const m = String(line || '').match(/通常 ([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

describe('resolveRecordBreakdownInStep(内訳を記録と同じ数字で動かす)', () => {
  it('★実機再現: まとめ読み込み中(手元の配列が 2,001 で止まる)でも、軽い見回りの記録に合わせて通常が増える', () => {
    const s = makeScreen();
    const lv = 'lv900000000001';
    // 全件読み直し 1回目: 記録 720・手元 720 行
    s.setCountDisplay(lv, 720, summarizeCommentRecordBreakdown(rows(720)));
    expect(normalOf(s.view.line)).toBe(720);
    // 全件読み直しは止まり(手元 2,001 行のまま)、記録だけが増えていく
    const stale = summarizeCommentRecordBreakdown(rows(2001));
    s.setCountDisplay(lv, 2001, stale);
    for (const rec of [2600, 3400, 4200, 5104]) {
      // 軽い見回り(行を読まない)
      s.setCountDisplay(lv, rec, undefined, { breakdownFollowsRecord: true });
      expect(s.view.record).toBe(rec);
      expect(normalOf(s.view.line)).toBe(rec);
      // 止まった配列での全件読み直しが割り込んでも、記録に置いていかれない
      s.setCountDisplay(lv, rec, stale);
      expect(normalOf(s.view.line)).toBe(rec);
    }
  });

  it('★同じ配信の途中で、後から短い配列で数え直しても内訳は減らない(1,072 → 285 の再現)', () => {
    const s = makeScreen();
    const lv = 'lv900000000002';
    s.setCountDisplay(lv, 1072, summarizeCommentRecordBreakdown(rows(1072)));
    expect(normalOf(s.view.line)).toBe(1072);
    // 記録のサマリが一時的に小さい値を返し、手元の配列も 285 行しかない
    s.setCountDisplay(lv, 285, summarizeCommentRecordBreakdown(rows(285)));
    expect(s.view.record).toBe(1072);
    expect(normalOf(s.view.line)).toBe(1072);
  });

  it('通常は記録の数字を土台にし、通常以外の分類(システム・フォロー・配信者)は行で数えた数を引く', () => {
    const st = createRecordBreakdownInStepState();
    const seen = summarizeCommentRecordBreakdown([
      ...rows(90),
      { text: 'お知らせ', isSystem: true },
      { text: 'フォローしました', commentType: 'followNotice' }
    ]);
    const b = resolveRecordBreakdownInStep(st, 'lv1', 500, { ...seen, _broadcasterCount: 8 });
    expect(b).toMatchObject({ normal: 500 - 1 - 1 - 8, otherSystem: 1, followNotice: 1, _broadcasterCount: 8 });
    const line = formatCommentRecordBreakdownLine(/** @type {any} */ (b), { broadcasterCount: 8 });
    expect(line).toBe('内訳: 通常 490 / フォロー通知 1 / システム 1 / 配信者 8');
  });

  it('記録と手元の行がそろっているときは、今までと同じ内訳になる', () => {
    const st = createRecordBreakdownInStepState();
    const seen = summarizeCommentRecordBreakdown([...rows(40), { text: 'x', isSystem: true }]);
    const b = resolveRecordBreakdownInStep(st, 'lv1', 41, seen);
    expect(b).toMatchObject({ normal: 40, otherSystem: 1 });
  });

  it('手元の行で数えた通常のほうが大きいとき(記録の数字がまだ古い)は、そちらを使う', () => {
    const st = createRecordBreakdownInStepState();
    const b = resolveRecordBreakdownInStep(st, 'lv1', 10, summarizeCommentRecordBreakdown(rows(25)));
    expect(b?.normal).toBe(25);
  });

  it('一度も行を数えていない配信では、軽い見回りから内訳を作らない(今までどおり最初の全件読み直しを待つ)', () => {
    const st = createRecordBreakdownInStepState();
    expect(resolveRecordBreakdownInStep(st, 'lv1', 300, undefined, { followRecord: true })).toBeUndefined();
  });

  it('followRecord を付けない呼び出し(配信の無い画面など)は内訳の行に触らない', () => {
    const st = createRecordBreakdownInStepState();
    resolveRecordBreakdownInStep(st, 'lv1', 10, summarizeCommentRecordBreakdown(rows(10)));
    expect(resolveRecordBreakdownInStep(st, 'lv1', 99, undefined)).toBeUndefined();
  });

  it('null(行を隠す)は隠したまま。軽い見回りで勝手に出し直さない', () => {
    const st = createRecordBreakdownInStepState();
    resolveRecordBreakdownInStep(st, 'lv1', 10, summarizeCommentRecordBreakdown(rows(10)));
    expect(resolveRecordBreakdownInStep(st, 'lv1', 10, null)).toBeNull();
    expect(resolveRecordBreakdownInStep(st, 'lv1', 20, undefined, { followRecord: true })).toBeUndefined();
  });

  it('配信が変わったら覚えをやり直す(前の配信の数を持ち越さない)', () => {
    const st = createRecordBreakdownInStepState();
    resolveRecordBreakdownInStep(st, 'lv1', 5000, summarizeCommentRecordBreakdown(rows(5000)));
    expect(resolveRecordBreakdownInStep(st, 'lv2', 30, undefined, { followRecord: true })).toBeUndefined();
    const b = resolveRecordBreakdownInStep(st, 'lv2', 30, summarizeCommentRecordBreakdown(rows(30)));
    expect(b?.normal).toBe(30);
  });

  it('記録が数字でない(「この配信は未取得」など)ときは、記録から通常を作らない', () => {
    const st = createRecordBreakdownInStepState();
    const b = resolveRecordBreakdownInStep(st, 'lv1', null, summarizeCommentRecordBreakdown(rows(3)));
    expect(b?.normal).toBe(3);
  });

  it('配信が分からない(lv でない)ときは素通し(覚えを汚さない)', () => {
    const st = createRecordBreakdownInStepState();
    const seen = summarizeCommentRecordBreakdown(rows(3));
    expect(resolveRecordBreakdownInStep(st, '', 99, seen)).toBe(seen);
    expect(st.lv).toBe('');
  });

  it('全サービス: 他サービスの疑似 lv(YouTube・Twitch・Kick・ツイキャス等は ytNicoShim の疑似 lv)でも同じに動く', () => {
    const s = makeScreen();
    const pseudoLv = 'lv990000012345';
    s.setCountDisplay(pseudoLv, 100, summarizeCommentRecordBreakdown(rows(100)));
    s.setCountDisplay(pseudoLv, 900, undefined, { breakdownFollowsRecord: true });
    expect(normalOf(s.view.line)).toBe(900);
  });

  it('同じ配信の中では、どの分類も減らない(何度呼んでも)', () => {
    const st = createRecordBreakdownInStepState();
    let prev = /** @type {any} */ (null);
    const seq = [
      [100, summarizeCommentRecordBreakdown([...rows(95), ...rows(5, () => ({ text: 's', isSystem: true }))])],
      [150, undefined],
      [150, summarizeCommentRecordBreakdown(rows(20))],
      [149, summarizeCommentRecordBreakdown([...rows(3), { text: 's', isSystem: true }])],
      [300, undefined]
    ];
    for (const [rec, seen] of seq) {
      const b = /** @type {any} */ (resolveRecordBreakdownInStep(st, 'lv1', /** @type {number} */ (rec), seen, { followRecord: true }));
      if (prev && b) {
        for (const k of ['normal', 'interestArrival', 'followNotice', 'otherSystem']) expect(b[k]).toBeGreaterThanOrEqual(prev[k]);
      }
      if (b) prev = b;
    }
    expect(prev.normal).toBe(295);
    expect(prev.otherSystem).toBe(5);
  });
});

describe('popup-entry の配線(内訳が記録と同じ数字を土台にする)', () => {
  const src = readFileSync(join(here, '../extension/popup-entry.js'), 'utf8');
  const setCount = src.slice(src.indexOf('function setCountDisplay('), src.indexOf('function setCountDisplay(') + 9000);

  it('setCountDisplay は単調ゲート後の記録(recordedNum)と同じ lv で内訳を決める', () => {
    expect(setCount).toMatch(/resolveRecordBreakdownInStep\(\s*_recordBreakdownInStepState,\s*watchPopupLastPaintedLiveId,\s*recordedNum,\s*breakdown,/);
    // 記録の単調ゲートより後で内訳を決める
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

  it('全件読み直しは今までどおり行で数えた内訳を渡す', () => {
    expect(src).toContain('setCountDisplay(countToShow, snapForCards, recordedBreakdown);');
  });
});
