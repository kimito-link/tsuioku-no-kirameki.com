import { describe, expect, it } from 'vitest';
import {
  diffLaneRoster,
  formatLaneRosterDeltaLine,
  laneUserIdSet,
  makeLaneRosterDeltaState,
  noteLaneRoster,
  snapshotLaneRosterDelta
} from './laneRosterDelta.js';

/**
 * v0.1.1231 Phase 1: レーンから「誰が消えたか」を測る計器。
 *
 * ユーザー確定の不変条件:
 *   「増えるのは良いが、減って消えてはいけない。その配信に来た人はずっと残る」
 *
 * ★既存の計器は「個数」しか見ていないため、同じ人数のまま中身が入れ替わる
 *   ケースを検知できなかった。ここを埋めるのが本計器。
 */

/** 実際の描画候補の形({ entry: { userId } })。 */
const pick = (uid) => ({ entry: { userId: uid }, title: `u${uid}` });

describe('laneUserIdSet — 描画候補から人物集合を作る', () => {
  it('entry.userId を拾う(本番の候補の形)', () => {
    const s = laneUserIdSet([pick('a'), pick('b')]);
    expect([...s].sort()).toEqual(['a', 'b']);
  });

  it('userId を直接持つ形にも対応する', () => {
    const s = laneUserIdSet([{ userId: 'x' }, { userId: 'y' }]);
    expect([...s].sort()).toEqual(['x', 'y']);
  });

  it('空 userId や壊れた要素は無視する', () => {
    const s = laneUserIdSet([pick(''), null, undefined, {}, pick('ok')]);
    expect([...s]).toEqual(['ok']);
  });

  it('配列でなければ空集合', () => {
    expect(laneUserIdSet(null).size).toBe(0);
    expect(laneUserIdSet(undefined).size).toBe(0);
  });
});

describe('diffLaneRoster', () => {
  it('消えた人・増えた人・残った人を割り出す', () => {
    const r = diffLaneRoster(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']));
    expect(r.dropped).toEqual(['a']);
    expect(r.added).toEqual(['d']);
    expect(r.keptCount).toBe(2);
  });

  it('増えるだけなら消えた人は0(不変条件を満たす形)', () => {
    const r = diffLaneRoster(new Set(['a']), new Set(['a', 'b', 'c']));
    expect(r.dropped).toEqual([]);
    expect(r.added.sort()).toEqual(['b', 'c']);
  });

  it('★同じ人数でも中身が入れ替われば検知する(既存の個数計器では見えない穴)', () => {
    const r = diffLaneRoster(new Set(['a', 'b']), new Set(['c', 'd']));
    expect(r.dropped.sort()).toEqual(['a', 'b']);
    expect(r.added.sort()).toEqual(['c', 'd']);
  });
});

describe('noteLaneRoster — 実配信の流れを再現', () => {
  it('★増える一方なら「消えた人0」のまま', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a')] });
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b')] });
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b'), pick('c')] });
    const snap = snapshotLaneRosterDelta(st);
    expect(snap.droppedTotal).toBe(0);
    expect(snap.everSeenMax).toBe(3);
  });

  it('★人が消えたら件数と例を記録する(本丸)', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b'), pick('c')] });
    const r = noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a')] });
    expect(r.dropped).toBe(2);
    const snap = snapshotLaneRosterDelta(st);
    expect(snap.droppedTotal).toBe(2);
    expect(snap.maxDroppedAtOnce).toBe(2);
    expect(snap.droppedSamples.sort()).toEqual(['b', 'c']);
  });

  it('★一度出た人は everSeen に残る(Phase 2 の蓄積器が扱う人数の実測)', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b')] });
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('c')] }); // a,b が消えた
    const snap = snapshotLaneRosterDelta(st);
    expect(snap.everSeenMax).toBe(3); // a,b,c の3人が来た
    expect(snap.everSeenNow).toBe(3);
    expect(snap.droppedTotal).toBe(2); // だが2人消えた
  });

  it('★配信が変わったらリセットする(別番組はユーザー操作=正当な切替)', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b')] });
    noteLaneRoster(st, { liveId: 'lv2', picks: [pick('z')] });
    const snap = snapshotLaneRosterDelta(st);
    expect(snap.droppedTotal).toBe(0); // 切替は「消えた」に数えない
    expect(snap.everSeenMax).toBe(1);
  });

  it('上限で切られた人数を数える(上限48を決める材料)', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a')], candidateTotal: 10 });
    expect(snapshotLaneRosterDelta(st).cappedOutTotal).toBe(0); // 初回はリセット扱い
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a')], candidateTotal: 10 });
    expect(snapshotLaneRosterDelta(st).cappedOutTotal).toBe(9);
  });

  it('例の件数は上限で頭打ち(状態速報を膨らませない)', () => {
    const st = makeLaneRosterDeltaState();
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(pick);
    noteLaneRoster(st, { liveId: 'lv1', picks: many });
    noteLaneRoster(st, { liveId: 'lv1', picks: [] });
    expect(snapshotLaneRosterDelta(st).droppedSamples.length).toBeLessThanOrEqual(5);
  });

  it('壊れた入力でも例外を投げない(計器は本体を止めない)', () => {
    expect(() => noteLaneRoster(null, { liveId: 'lv1', picks: [] })).not.toThrow();
    const st = makeLaneRosterDeltaState();
    expect(() => noteLaneRoster(st, null)).not.toThrow();
  });
});

describe('formatLaneRosterDeltaLine', () => {
  it('何も起きていなければ空(静かな計器)', () => {
    expect(formatLaneRosterDeltaLine({})).toBe('');
    expect(formatLaneRosterDeltaLine(null)).toBe('');
  });

  it('★消えた人がいれば警告として出す', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b')] });
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a')] });
    const line = formatLaneRosterDeltaLine(snapshotLaneRosterDelta(st));
    expect(line).toContain('消えた人');
    expect(line).toContain('⚠');
  });

  it('★消えていなければ 0人 ✅ と明示する(判定不能にしない)', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a')] });
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b')] });
    const line = formatLaneRosterDeltaLine(snapshotLaneRosterDelta(st));
    expect(line).toContain('消えた人 0人 ✅');
  });

  it('来た人の累計を必ず出す(上限を決める材料)', () => {
    const st = makeLaneRosterDeltaState();
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a')] });
    noteLaneRoster(st, { liveId: 'lv1', picks: [pick('a'), pick('b')] });
    expect(formatLaneRosterDeltaLine(snapshotLaneRosterDelta(st))).toContain('来た人 累計2人');
  });
});
