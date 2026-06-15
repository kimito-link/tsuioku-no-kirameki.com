import { describe, it, expect } from 'vitest';
import {
  mergeUserLaneAggregates,
  selectNewChunkSeqs
} from './venueIncrementalAggregate.js';

/*
 * v0.1.754 会場3時間安定化: 参加者集計を「30秒毎に全コメント再読み」から
 * 「新規チャンクの差分だけ集計してマージ」へ。会議(6体ほぼ全会一致)が最大ボトルネックと特定。
 * チャンクは append-only(commentChunkStore)なので、未処理 seq だけ読めば O(新規分)。
 */

describe('selectNewChunkSeqs (未処理の新規 seq だけ選ぶ)', () => {
  it('初回(processed 空)は全 seq を返す', () => {
    expect(selectNewChunkSeqs([0, 1, 2], [])).toEqual([0, 1, 2]);
  });
  it('既処理を除いた新規 seq だけ返す(昇順)', () => {
    expect(selectNewChunkSeqs([0, 1, 2, 3, 4], [0, 1, 2])).toEqual([3, 4]);
  });
  it('新規が無ければ空', () => {
    expect(selectNewChunkSeqs([0, 1, 2], [0, 1, 2])).toEqual([]);
  });
  it('順不同の index.seqs でも昇順で返す', () => {
    expect(selectNewChunkSeqs([2, 0, 4, 1, 3], [0, 1])).toEqual([2, 3, 4]);
  });
  it('processed に未知 seq があっても無害(現存 seq 基準で差分)', () => {
    expect(selectNewChunkSeqs([0, 1], [0, 1, 99])).toEqual([]);
  });
  it('非配列は安全に空/全件', () => {
    expect(selectNewChunkSeqs(null, [])).toEqual([]);
    expect(selectNewChunkSeqs([0, 1], null)).toEqual([0, 1]);
  });
});

describe('mergeUserLaneAggregates (既存集約 + 新規集約を userId 単位で合成)', () => {
  const cand = (o) => ({
    userId: o.userId,
    nickname: o.nickname ?? '',
    avatarUrl: o.avatarUrl ?? '',
    avatarObserved: o.avatarObserved ?? false,
    liveId: o.liveId ?? 'lv1',
    commentCount: o.commentCount ?? 1,
    giftCount: o.giftCount ?? 0,
    _laneSortAt: o._laneSortAt ?? 0
  });

  it('新規ユーザーは追加される', () => {
    const out = mergeUserLaneAggregates([], [cand({ userId: 'a', commentCount: 1, _laneSortAt: 10 })]);
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe('a');
  });

  it('同一ユーザーは commentCount/giftCount を合算する(全件再読みと同じ総数)', () => {
    const prev = [cand({ userId: 'a', commentCount: 3, giftCount: 1, _laneSortAt: 10 })];
    const next = [cand({ userId: 'a', commentCount: 2, giftCount: 1, _laneSortAt: 20 })];
    const out = mergeUserLaneAggregates(prev, next);
    expect(out).toHaveLength(1);
    expect(out[0].commentCount).toBe(5);
    expect(out[0].giftCount).toBe(2);
  });

  it('_laneSortAt は最大(最新発言時刻)を採る', () => {
    const out = mergeUserLaneAggregates(
      [cand({ userId: 'a', _laneSortAt: 100 })],
      [cand({ userId: 'a', _laneSortAt: 50 })]
    );
    expect(out[0]._laneSortAt).toBe(100);
    const out2 = mergeUserLaneAggregates(
      [cand({ userId: 'a', _laneSortAt: 50 })],
      [cand({ userId: 'a', _laneSortAt: 100 })]
    );
    expect(out2[0]._laneSortAt).toBe(100);
  });

  it('avatarObserved は OR(片方でも観測済みなら true)', () => {
    const out = mergeUserLaneAggregates(
      [cand({ userId: 'a', avatarObserved: false })],
      [cand({ userId: 'a', avatarObserved: true })]
    );
    expect(out[0].avatarObserved).toBe(true);
  });

  it('nickname は空でない方を保持(新規が空でも既存を維持)', () => {
    const out = mergeUserLaneAggregates(
      [cand({ userId: 'a', nickname: 'りんく' })],
      [cand({ userId: 'a', nickname: '' })]
    );
    expect(out[0].nickname).toBe('りんく');
  });

  it('avatarUrl は新規が実URLを持てば反映(実サムネ後着を拾う)', () => {
    const url = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/123/4567.jpg';
    const out = mergeUserLaneAggregates(
      [cand({ userId: '4567', avatarUrl: '' })],
      [cand({ userId: '4567', avatarUrl: url })]
    );
    expect(out[0].avatarUrl).toBe(url);
  });

  it('結果は _laneSortAt 降順(最新発言が上位席)', () => {
    const out = mergeUserLaneAggregates(
      [cand({ userId: 'a', _laneSortAt: 10 }), cand({ userId: 'b', _laneSortAt: 30 })],
      [cand({ userId: 'c', _laneSortAt: 20 })]
    );
    expect(out.map((r) => r.userId)).toEqual(['b', 'c', 'a']);
  });

  it('多数ユーザーでも全件再読みと同じ集約結果(等価性)', () => {
    // chunk1 と chunk2 を別々に集約してマージ = 全件まとめて集約と同じ commentCount。
    const chunk1 = [
      cand({ userId: 'a', commentCount: 2, _laneSortAt: 5 }),
      cand({ userId: 'b', commentCount: 1, _laneSortAt: 6 })
    ];
    const chunk2 = [
      cand({ userId: 'a', commentCount: 3, _laneSortAt: 9 }),
      cand({ userId: 'c', commentCount: 1, _laneSortAt: 8 })
    ];
    const merged = mergeUserLaneAggregates(chunk1, chunk2);
    const byId = Object.fromEntries(merged.map((r) => [r.userId, r]));
    expect(byId.a.commentCount).toBe(5); // 2 + 3 = 全5発言
    expect(byId.a._laneSortAt).toBe(9);
    expect(byId.b.commentCount).toBe(1);
    expect(byId.c.commentCount).toBe(1);
    expect(merged).toHaveLength(3);
  });

  it('非配列は安全', () => {
    expect(mergeUserLaneAggregates(null, null)).toEqual([]);
    expect(mergeUserLaneAggregates([cand({ userId: 'a' })], null)).toHaveLength(1);
  });
});
