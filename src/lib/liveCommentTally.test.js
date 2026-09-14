import { describe, it, expect } from 'vitest';
import {
  createCommentTally,
  TALLY_NAME_MAX,
  TALLY_STATE_UIDS_MAX,
  rowsBeyondWater,
  waterOf
} from './liveCommentTally.js';

/** ndgrChatsToMergeRows の出力(NdgrMergeRow)と同じ形を作る小道具。 */
const row = (no, userId, nickname) => ({
  commentNo: no,
  text: 'こんにちは',
  userId,
  ...(nickname == null ? {} : { nickname })
});

/** no / vpos を明示して作る水位テスト用の行。 */
const wrow = ({ no, vpos, userId = '12345678', nickname = 'x' }) => {
  /** @type {any} */
  const r = { text: 'こんにちは', userId, nickname };
  if (no !== undefined) r.commentNo = no;
  if (vpos !== undefined) r.vpos = vpos;
  return r;
};

describe('createCommentTally', () => {
  it('数値 3 件＋匿名 2 件: 件数降順・rank・anon・commenters/comments/anonCommenters', () => {
    const t = createCommentTally();
    t.add([
      row('1', '12345678', 'みち'),
      row('2', '12345678', 'みち'),
      row('3', '12345678', 'みち'),
      row('4', '87654321', 'こん'),
      row('5', '87654321', 'こん'),
      row('6', 'a:AbCdEfGh01', ''),
      row('7', 'a:AbCdEfGh01', ''),
      row('8', 'a:AbCdEfGh01', ''),
      row('9', 'a:ZzYyXxWw02', '')
    ]);
    const r = t.result();
    expect(r.rankers.map((x) => [x.rank, x.uid, x.count, x.anon])).toEqual([
      [1, '12345678', 3, false],
      [2, 'a:AbCdEfGh01', 3, true],
      [3, '87654321', 2, false],
      [4, 'a:ZzYyXxWw02', 1, true]
    ]);
    expect(r.rankers[0].name).toBe('みち');
    // ★匿名は名前を持たない(表示側が「匿名NNN」を作る)。
    expect(r.rankers[1].name).toBe('');
    expect(r.commenters).toBe(4);
    expect(r.comments).toBe(9);
    expect(r.anonCommenters).toBe(2);
  });

  it('配信者本人は数えない(「応援した人」ではない)', () => {
    const t = createCommentTally({ broadcasterUid: '142919600' });
    t.add([
      row('1', '142919600', '配信者'),
      row('2', '142919600', '配信者'),
      row('3', '12345678', 'みち')
    ]);
    const r = t.result();
    expect(r.commenters).toBe(1);
    expect(r.comments).toBe(1);
    expect(r.rankers.map((x) => x.uid)).toEqual(['12345678']);
  });

  it('userId:null / 空 の行は捨てる', () => {
    const t = createCommentTally();
    t.add([row('1', null, 'x'), row('2', '', 'y'), row('3', '12345678', 'みち')]);
    const r = t.result();
    expect(r.commenters).toBe(1);
    expect(r.comments).toBe(1);
  });

  it('同じ commentNo を 2 回 add しても 1 回だけ数える(区画の重なり対策)', () => {
    const t = createCommentTally();
    const batch = [row('101', '12345678', 'みち'), row('102', '12345678', 'みち')];
    t.add(batch);
    t.add(batch);
    const r = t.result();
    expect(r.comments).toBe(2);
    expect(r.rankers[0].count).toBe(2);
  });

  it("commentNo:'' の行は毎回数える(本文を鍵にしないため重複除去できない)", () => {
    const t = createCommentTally();
    const batch = [row('', 'a:AbCdEfGh01', '')];
    t.add(batch);
    t.add(batch);
    expect(t.result().comments).toBe(2);
  });

  it('11 人以上: rankers は 10 件・commenters は全員', () => {
    const t = createCommentTally();
    const rows = [];
    for (let i = 0; i < 15; i += 1) {
      // 上位ほど件数が多くなるように積む。
      for (let k = 0; k <= 15 - i; k += 1) rows.push(row(`${i}-${k}`, `1000000${i}`, `n${i}`));
    }
    t.add(rows);
    const r = t.result();
    expect(r.rankers.length).toBe(10);
    expect(r.commenters).toBe(15);
    expect(r.rankers[0].uid).toBe('10000000');
    expect(r.rankers[9].rank).toBe(10);
  });

  it('同数は先着順(後から来た人が前へ出ない)', () => {
    const t = createCommentTally();
    t.add([row('1', '11111111', 'さき'), row('2', '22222222', 'あと')]);
    expect(t.result().rankers.map((x) => x.uid)).toEqual(['11111111', '22222222']);
  });

  it('ネガコン: 匿名だけでも rankers が出る(後ろへ送らない)', () => {
    const t = createCommentTally();
    t.add([row('1', 'a:AbCdEfGh01', ''), row('2', 'a:ZzYyXxWw02', '')]);
    const r = t.result();
    expect(r.rankers.length).toBe(2);
    expect(r.rankers.every((x) => x.anon)).toBe(true);
    expect(r.anonCommenters).toBe(2);
  });

  it('ネガコン: 0 件 → rankers は空・数はすべて 0', () => {
    const t = createCommentTally();
    t.add([]);
    t.add(null);
    expect(t.result()).toEqual({ rankers: [], commenters: 0, comments: 0, anonCommenters: 0, uids: {} });
  });

  it(`name は ${TALLY_NAME_MAX} 字で切り詰める`, () => {
    const t = createCommentTally();
    const long = 'あ'.repeat(200);
    t.add([row('1', '12345678', long)]);
    expect(Array.from(t.result().rankers[0].name).length).toBe(TALLY_NAME_MAX);
  });

  it('名前は後から届いても空のときだけ埋める(数値 uid)', () => {
    const t = createCommentTally();
    t.add([row('1', '12345678', '')]);
    t.add([row('2', '12345678', 'みち')]);
    expect(t.result().rankers[0].name).toBe('みち');
  });

  it('result().uids は全員を挿入順(先着順)で返す', () => {
    const t = createCommentTally();
    t.add([
      row('1', '11111111', 'さき'),
      row('2', '22222222', 'あと'),
      row('3', 'a:AbCdEfGh01', '')
    ]);
    const u = t.result().uids;
    expect(Object.keys(u)).toEqual(['11111111', '22222222', 'a:AbCdEfGh01']);
    expect(u['11111111']).toEqual({ name: 'さき', count: 1, anon: false });
    expect(u['a:AbCdEfGh01']).toEqual({ name: '', count: 1, anon: true });
  });

  it('TALLY_STATE_UIDS_MAX は 5000', () => {
    expect(TALLY_STATE_UIDS_MAX).toBe(5000);
  });
});

describe('createCommentTally seed(run 跨ぎ)', () => {
  it('seed の {uids,comments} を渡し 1 行足すと count+1・comments が seed から加算', () => {
    const t = createCommentTally({
      seed: { uids: { '12345678': { name: 'みち', count: 42, anon: false } }, comments: 100 }
    });
    t.add([row('9999', '12345678', 'みち')]);
    const r = t.result();
    expect(r.rankers[0].count).toBe(43);
    expect(r.comments).toBe(101);
    expect(r.commenters).toBe(1);
  });

  it('順位が先着順のまま(seed の人が後から同数でも前に残る)', () => {
    const t = createCommentTally({
      seed: {
        uids: { '11111111': { name: 'さき', count: 1, anon: false } },
        comments: 1
      }
    });
    t.add([row('2', '22222222', 'あと')]);
    expect(t.result().rankers.map((x) => x.uid)).toEqual(['11111111', '22222222']);
  });

  it('seed 無しは既存と同一(characterization)', () => {
    const withSeed = createCommentTally({ seed: undefined });
    const without = createCommentTally();
    const batch = [row('1', '12345678', 'みち'), row('2', 'a:AbCdEfGh01', '')];
    withSeed.add(batch);
    without.add(batch);
    expect(withSeed.result()).toEqual(without.result());
  });

  it('ネガコン: seed の uid を再度 add しても seenNo は弾かない(水位フィルタが必須の証拠)', () => {
    const t = createCommentTally({
      seed: { uids: { '12345678': { name: 'みち', count: 5, anon: false } }, comments: 5 }
    });
    // seed に居る人の「前回数えた行」をそのまま add すると二重計上される(=水位フィルタが要る)。
    t.add([row('1', '12345678', 'みち')]);
    expect(t.result().rankers[0].count).toBe(6);
  });
});

describe('rowsBeyondWater', () => {
  const NULLS = { maxNo: null, maxVpos: null, minNo: null, minVpos: null };

  it('water が全 null → 全行(初回・no も vpos も無い行も採用)', () => {
    const rows = [wrow({ no: '5' }), wrow({ vpos: 10 }), wrow({})];
    expect(rowsBeyondWater(rows, NULLS).length).toBe(3);
  });

  it('no>maxNo のみ通す', () => {
    const water = { maxNo: 10, minNo: 3, maxVpos: null, minVpos: null };
    const rows = [wrow({ no: '11' }), wrow({ no: '10' }), wrow({ no: '5' })];
    expect(rowsBeyondWater(rows, water).map((r) => r.commentNo)).toEqual(['11']);
  });

  it('no<minNo も通す', () => {
    const water = { maxNo: 10, minNo: 3, maxVpos: null, minVpos: null };
    const rows = [wrow({ no: '2' }), wrow({ no: '3' }), wrow({ no: '20' })];
    expect(rowsBeyondWater(rows, water).map((r) => r.commentNo)).toEqual(['2', '20']);
  });

  it('no 無し + vpos>maxVpos 通す・vpos<=maxVpos 弾く', () => {
    const water = { maxNo: 10, minNo: 3, maxVpos: 100, minVpos: 50 };
    const rows = [wrow({ vpos: 120 }), wrow({ vpos: 100 }), wrow({ vpos: 70 })];
    expect(rowsBeyondWater(rows, water).map((r) => r.vpos)).toEqual([120]);
  });

  it('no も vpos も無い行 → water あり時は弾く / water 無し時は通す', () => {
    const water = { maxNo: 10, minNo: 3, maxVpos: 100, minVpos: 50 };
    expect(rowsBeyondWater([wrow({})], water).length).toBe(0);
    expect(rowsBeyondWater([wrow({})], NULLS).length).toBe(1);
  });
});

describe('waterOf', () => {
  it('null 起点から no / vpos の min・max を畳む', () => {
    const rows = [wrow({ no: '5', vpos: 100 }), wrow({ no: '20', vpos: 30 }), wrow({ no: '12', vpos: 300 })];
    expect(waterOf(rows, { maxNo: null, maxVpos: null, minNo: null, minVpos: null })).toEqual({
      maxNo: 20,
      minNo: 5,
      maxVpos: 300,
      minVpos: 30
    });
  });

  it('prev を含めて畳む(前回水位を後退させない)', () => {
    const prev = { maxNo: 50, minNo: 10, maxVpos: 500, minVpos: 100 };
    const rows = [wrow({ no: '5', vpos: 40 }), wrow({ no: '60', vpos: 600 })];
    expect(waterOf(rows, prev)).toEqual({ maxNo: 60, minNo: 5, maxVpos: 600, minVpos: 40 });
  });

  it('NaN な no / 負の vpos は無視する', () => {
    const rows = [wrow({ no: 'abc', vpos: -5 }), wrow({ no: '7', vpos: 20 })];
    expect(waterOf(rows, { maxNo: null, maxVpos: null, minNo: null, minVpos: null })).toEqual({
      maxNo: 7,
      minNo: 7,
      maxVpos: 20,
      minVpos: 20
    });
  });
});
