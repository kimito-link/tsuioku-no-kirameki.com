import { describe, expect, it } from 'vitest';
import { resolveVenueHoverFacts } from './venueHoverFacts.js';

/*
 * ★このテストは【実装より先に】書いた（2026-08-29）。
 *
 *   理由: 直そうとしている欠陥は「count: 0 を1ヶ月出し続けても誰も赤くならなかった」もの。
 *   `resolveSeatlessHoverData` に触れるテストは2本あったが、どちらも
 *   ソース文字列の正規表現マッチで、★値を1つも検証していなかった。
 *   後からテストを書くと「今の実装が通る形」に無意識に寄せてしまうので、
 *   規律を先に固定する。
 */

const NOW = 1_700_000_000_000;

describe('★正本優先: registered が有効なら registered だけを見る', () => {
  it('registered がある限り roster を見ない（値が小さくても registered を返す）', () => {
    // ★これが max 混入の毒テスト。
    //   Math.max(registered, roster) を書くと 70 が返って赤くなる。
    const r = resolveVenueHoverFacts({
      registered: { count: 3, giftCount: 0, lastAt: NOW - 1000 },
      rosterEntry: { commentCount: 70, giftCount: 9, lastSeen: NOW - 500 }
    });
    expect(r.count).toBe(3);
    expect(r.source).toBe('registered');
  });

  it('逆向きも固定する（registered の方が大きい場合）', () => {
    const r = resolveVenueHoverFacts({
      registered: { count: 70, giftCount: 2 },
      rosterEntry: { commentCount: 3, giftCount: 0 }
    });
    expect(r.count).toBe(70);
    expect(r.source).toBe('registered');
  });

  it('★registered.count が 0 でも registered を採る（本当に0発言の人を落とさない）', () => {
    const r = resolveVenueHoverFacts({
      registered: { count: 0, giftCount: 0 },
      rosterEntry: { commentCount: 99 }
    });
    expect(r.count).toBe(0);
    expect(r.source).toBe('registered');
  });

  it('giftCount も混ぜない', () => {
    const r = resolveVenueHoverFacts({
      registered: { count: 5, giftCount: 1 },
      rosterEntry: { commentCount: 5, giftCount: 40 }
    });
    expect(r.giftCount).toBe(1);
  });
});

describe('registered が無いときだけ roster を見る', () => {
  it('roster から発言数・時刻・本文を拾う', () => {
    const r = resolveVenueHoverFacts({
      registered: null,
      rosterEntry: {
        commentCount: 70,
        giftCount: 2,
        lastSeen: NOW - 5000,
        lastText: 'こんばんは',
        recentTexts: ['こんばんは', 'いいね']
      }
    });
    expect(r.count).toBe(70);
    expect(r.giftCount).toBe(2);
    expect(r.lastAt).toBe(NOW - 5000);
    expect(r.lastText).toBe('こんばんは');
    expect(r.recentTexts).toEqual(['こんばんは', 'いいね']);
    expect(r.source).toBe('roster');
  });

  it('★registered.count が数値でなければ registered は無効（roster へ落ちる）', () => {
    const r = resolveVenueHoverFacts({
      registered: { count: undefined, giftCount: 0 },
      rosterEntry: { commentCount: 42 }
    });
    expect(r.count).toBe(42);
    expect(r.source).toBe('roster');
  });
});

describe('★どちらも無いときは「知らない」と言う（0 と言わない）', () => {
  it('count は null になる（0 ではない）', () => {
    const r = resolveVenueHoverFacts({ registered: null, rosterEntry: null });
    expect(r.count).toBeNull();
    expect(r.giftCount).toBeNull();
    expect(r.source).toBe('none');
  });

  it('★これが今回の欠陥の核心: 0 を返してはいけない', () => {
    // 「0回喋った」と「知らない」を同じ値で表すと、区別が構造的に不可能になる。
    // 実機で「発言 0」「発言 1」という嘘が出ていたのはこれが原因。
    const r = resolveVenueHoverFacts({});
    expect(r.count).not.toBe(0);
    expect(r.count).toBeNull();
  });

  it('壊れた入力でも throw せず「知らない」に倒す（fail-closed）', () => {
    expect(() => resolveVenueHoverFacts(null)).not.toThrow();
    expect(() => resolveVenueHoverFacts('x')).not.toThrow();
    expect(resolveVenueHoverFacts(null).source).toBe('none');
    expect(resolveVenueHoverFacts(undefined).count).toBeNull();
  });
});

describe('出所ラベルが必ず付く（どちらを見たか後から分かる）', () => {
  it('3種類のいずれかを返す', () => {
    const a = resolveVenueHoverFacts({ registered: { count: 1 } });
    const b = resolveVenueHoverFacts({ rosterEntry: { commentCount: 1 } });
    const c = resolveVenueHoverFacts({});
    expect([a.source, b.source, c.source]).toEqual(['registered', 'roster', 'none']);
  });
});

describe('★数値の正規化（嘘の値を作らない）', () => {
  it('負の数は 0 に丸める（マイナス回数を作らない）', () => {
    const r = resolveVenueHoverFacts({ registered: { count: -5, giftCount: -3 } });
    expect(r.count).toBe(0);
    expect(r.giftCount).toBe(0);
  });

  it('小数は切り捨てる', () => {
    const r = resolveVenueHoverFacts({ registered: { count: 2.9 } });
    expect(r.count).toBe(2);
  });

  it('venueRank は 0 起点（順位なしを 0 で表す）', () => {
    expect(resolveVenueHoverFacts({ registered: { count: 1 } }).venueRank).toBe(0);
    expect(resolveVenueHoverFacts({ registered: { count: 1, venueRank: 2 } }).venueRank).toBe(2);
  });

  it('recentTexts は必ず配列（null を渡さない）', () => {
    expect(Array.isArray(resolveVenueHoverFacts({}).recentTexts)).toBe(true);
    expect(Array.isArray(resolveVenueHoverFacts({ registered: { count: 1 } }).recentTexts)).toBe(true);
  });
});
