import { describe, it, expect } from 'vitest';
import {
  addRepaintReason,
  totalRepaints,
  dominantRepaintReason,
  formatRepaintReasonLine
} from './repaintReasonCensus.js';

/**
 * repaintReasonCensus.js — 描き直しの「理由別内訳」を数える純関数群。
 *
 * 2026-08-04: 総数(paintCount=2517)だけでは、refresh の引き金36箇所のうち
 * どれが暴走しているか分からなかった。理由別に数えて初めて犯人を名指しできる。
 */

describe('addRepaintReason', () => {
  it('初回は1件目として積む', () => {
    expect(addRepaintReason(null, 'instant_push')).toEqual({ instant_push: 1 });
  });

  it('同じ理由は加算される', () => {
    let c = addRepaintReason(null, 'interval');
    c = addRepaintReason(c, 'interval');
    expect(c.interval).toBe(2);
  });

  it('別の理由は別のキーになる', () => {
    let c = addRepaintReason(null, 'a');
    c = addRepaintReason(c, 'b');
    expect(c).toEqual({ a: 1, b: 1 });
  });

  it('理由が空ならunknownに寄せる(捨てない=数が合わなくなるのを防ぐ)', () => {
    expect(addRepaintReason(null, '')).toEqual({ unknown: 1 });
    expect(addRepaintReason(null, null)).toEqual({ unknown: 1 });
  });

  it('元のオブジェクトを書き換えない(純関数)', () => {
    const orig = { a: 1 };
    addRepaintReason(orig, 'a');
    expect(orig.a).toBe(1);
  });
});

describe('totalRepaints', () => {
  it('全理由の合計を返す', () => {
    expect(totalRepaints({ a: 10, b: 5, c: 1 })).toBe(16);
  });

  it('壊れた値は無視して落ちない', () => {
    expect(totalRepaints({ a: 3, b: NaN, c: -1, d: 'x' })).toBe(3);
    expect(totalRepaints(null)).toBe(0);
  });
});

describe('dominantRepaintReason — 犯人を名指しできるときだけ名指しする', () => {
  // 2026-08-04 の症状を想定: 1つの経路だけが暴走しているケース。
  it('1つが過半かつ2位の2倍以上なら、それを犯人として返す', () => {
    const v = dominantRepaintReason({ instant_push: 2000, interval: 10, storage: 3 });
    expect(v?.reason).toBe('instant_push');
    expect(v?.share).toBeGreaterThan(0.9);
  });

  // ここが重要: 均等に分かれているなら「特定の1箇所」を直しても効かない。
  // 断定できないときに断定すると、また間違った場所を直すことになる。
  it('拮抗しているならnull(判定不能)を返す', () => {
    expect(dominantRepaintReason({ a: 100, b: 90, c: 80 })).toBeNull();
  });

  // ★この2件は「share<0.5」と「2位の2倍」の【各条件を単独で】殺す変異を検知する。
  //   片方だけのテストだと、もう片方が生き残って変異が素通りする(実際に踏んだ)。
  it('過半に届かないならnull(2位の2倍以上でも)', () => {
    // a=40(40%)は過半に届かない。b=15の2倍(30)は超えているので、
    // 「2倍」条件だけでは通ってしまう=share条件が単独で効いていることの断言。
    expect(dominantRepaintReason({ a: 40, b: 15, c: 15, d: 15, e: 15 })).toBeNull();
  });

  it('過半でも2位の2倍未満ならnull', () => {
    // a=60(55%)だが b=50 の2倍(100)に届かない
    expect(dominantRepaintReason({ a: 60, b: 50 })).toBeNull();
  });

  it('1種類しか無ければそれが犯人', () => {
    expect(dominantRepaintReason({ only: 5 })?.reason).toBe('only');
  });

  it('空/壊れた入力はnull', () => {
    expect(dominantRepaintReason(null)).toBeNull();
    expect(dominantRepaintReason({})).toBeNull();
    expect(dominantRepaintReason({ a: 0 })).toBeNull();
  });
});

describe('formatRepaintReasonLine — 速報に出す1行', () => {
  // 【実測・見落とした値】2026-08-04: 3分で描画+2013回・コメント+26件。
  // この内訳が出ていれば、どの経路が犯人か即座に分かったはず。
  it('実測相当の値で、1コメントあたりの回数と犯人を出す', () => {
    const line = formatRepaintReasonLine({ instant_push: 2000, interval: 13 }, 26);
    expect(line).toContain('計2013回');
    expect(line).toContain('77回'); // 2013/26 ≒ 77
    expect(line).toContain('instant_push');
    expect(line).toContain('ここが原因');
  });

  it('健全な値では犯人を名指ししない(誤報を出さない)', () => {
    const line = formatRepaintReasonLine({ interval: 30, storage: 28, push: 25 }, 100);
    expect(line).toContain('計83回');
    expect(line).not.toContain('ここが原因');
  });

  it('母数20件未満なら1件あたりの比を出さない(跳ねるので誤解を生む)', () => {
    const line = formatRepaintReasonLine({ a: 50 }, 5);
    expect(line).not.toContain('1コメントあたり');
  });

  it('0件なら空文字(静かな計器)', () => {
    expect(formatRepaintReasonLine({}, 100)).toBe('');
    expect(formatRepaintReasonLine(null, 100)).toBe('');
  });
});

/*
 * ★v0.1.1391(ユーザー実機 2026-08-14): 分子から「止めた回数」を除く。
 *   同じ速報に「1コメントあたり6.5回」と「1コメントあたり26回」が併記されていた。
 */
describe('1コメントあたりの比は【実際に描いた分】で出す', () => {
  it('★self_write_skipped(止めた回数)を分子に含めない', () => {
    // 実機の数字: total 6875 / 止めた 5133 / コメント 268 → 実 paint 1742 = 6.5回
    const line = formatRepaintReasonLine(
      { self_write_skipped: 5133, 'storage_changed:nls_watch_snapshot_*': 1742 },
      268
    );
    expect(line).toContain('実際に描いたのは1コメントあたり6.5回');
    // 止めた分を含めた 25.7/26 回が出てはいけない(これが誤誘導の正体)。
    expect(line).not.toContain('あたり26回');
    expect(line).not.toContain('あたり25.7回');
  });

  it('内訳の総数は従来どおり(止めた回数も分母には残す=隠さない)', () => {
    const line = formatRepaintReasonLine(
      { self_write_skipped: 5133, 'storage_changed:x': 1742 },
      268
    );
    expect(line).toContain('計6875回');
    expect(line).toContain('self_write_skipped5133');
  });

  it('抑制系が無ければ従来と同じ比', () => {
    const line = formatRepaintReasonLine({ 'storage_changed:x': 536 }, 268);
    expect(line).toContain('実際に描いたのは1コメントあたり2.0回');
  });
});
