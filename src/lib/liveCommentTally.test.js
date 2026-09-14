import { describe, it, expect } from 'vitest';
import { createCommentTally, TALLY_NAME_MAX } from './liveCommentTally.js';

/** ndgrChatsToMergeRows の出力(NdgrMergeRow)と同じ形を作る小道具。 */
const row = (no, userId, nickname) => ({
  commentNo: no,
  text: 'こんにちは',
  userId,
  ...(nickname == null ? {} : { nickname })
});

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
    expect(t.result()).toEqual({ rankers: [], commenters: 0, comments: 0, anonCommenters: 0 });
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
});
