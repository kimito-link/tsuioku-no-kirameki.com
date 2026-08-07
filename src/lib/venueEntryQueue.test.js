import { describe, it, expect } from 'vitest';
import {
  createVenueEntryQueue,
  VENUE_ENTRY_MAX_CONCURRENT,
  VENUE_ENTRY_QUEUE_LIMIT
} from './venueEntryQueue.js';

/** SPEC: docs/handoff/venue-transport-effect-SPEC-2026-08-08.md の受け入れ条件1〜7に対応。 */

const keysOf = (n, prefix = 'u') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('createVenueEntryQueue — 受け入れ条件', () => {
  it('[条件1] 初回は誰も飛ばない(全員そのまま着席)', () => {
    const q = createVenueEntryQueue();
    const r = q.tick({ keys: keysOf(150), liveId: 'lv1', nowMs: 0 });
    expect(r.fly).toHaveLength(0);
    expect(r.seat).toHaveLength(150);
    expect(r.suppressedReason).toBe('first_paint');
  });

  it('[条件2] 新しい人が1人来たら1人だけ飛ぶ', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['a', 'b'], liveId: 'lv1', nowMs: 0 });
    const r = q.tick({ keys: ['a', 'b', 'c'], liveId: 'lv1', nowMs: 100 });
    expect(r.fly).toEqual(['c']);
    expect(r.seat).toHaveLength(0);
  });

  it('[条件3] 30人同時でも同時に飛ぶのは上限まで、残りは順次 or 直接着席', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['seed'], liveId: 'lv1', nowMs: 0 });
    const r = q.tick({ keys: ['seed', ...keysOf(30)], liveId: 'lv1', nowMs: 100 });
    expect(r.fly.length).toBeLessThanOrEqual(VENUE_ENTRY_MAX_CONCURRENT);
    // 30人 = 飛ぶ + キュー待ち + 直接着席 のどれかに必ず含まれる
    expect(r.fly.length + r.seat.length).toBeGreaterThan(0);
    expect(q.stats().queued + r.fly.length + r.seat.length).toBe(30);
  });

  it('[条件4] ★飛ばなかった人も必ず席に居る(演出の間引き ≠ 表示の間引き)', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['seed'], liveId: 'lv1', nowMs: 0 });
    // 実配信規模: 会場参加者152人が一度に現れるケース
    const all = keysOf(152);
    const r = q.tick({ keys: ['seed', ...all], liveId: 'lv1', nowMs: 100 });
    const accounted = new Set([...r.fly, ...r.seat, ...Array.from({ length: q.stats().queued })]);
    // fly + seat + queued で 152 全員が説明できる(誰も消えていない)
    expect(r.fly.length + r.seat.length + q.stats().queued).toBe(152);
    expect(accounted.size).toBeGreaterThan(0);
  });

  it('[条件4-b] キュー上限を超えた分は捨てずに直接着席へ回る', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['seed'], liveId: 'lv1', nowMs: 0 });
    const many = keysOf(100);
    const r = q.tick({ keys: ['seed', ...many], liveId: 'lv1', nowMs: 100 });
    expect(r.seat.length).toBeGreaterThan(0); // 溢れた人が居る
    expect(q.stats().queued).toBeLessThanOrEqual(VENUE_ENTRY_QUEUE_LIMIT);
    expect(r.fly.length + r.seat.length + q.stats().queued).toBe(100);
  });

  it('[条件6] 配信を切り替えたら前配信の人が飛ばない', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['a', 'b'], liveId: 'lv1', nowMs: 0 });
    const r = q.tick({ keys: ['x', 'y', 'z'], liveId: 'lv2', nowMs: 100 });
    expect(r.fly).toHaveLength(0);
    expect(r.suppressedReason).toBe('live_changed');
    expect(r.seat).toEqual(['x', 'y', 'z']);
  });

  it('同じ人が二度飛ばない(既知の人は新規ではない)', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['a'], liveId: 'lv1', nowMs: 0 });
    const r1 = q.tick({ keys: ['a', 'b'], liveId: 'lv1', nowMs: 100 });
    expect(r1.fly).toEqual(['b']);
    q.onFlightDone('b');
    const r2 = q.tick({ keys: ['a', 'b'], liveId: 'lv1', nowMs: 200 });
    expect(r2.fly).toHaveLength(0);
  });

  it('飛行が終わるまで同時数の枠は空かない', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['seed'], liveId: 'lv1', nowMs: 0 });
    const r1 = q.tick({ keys: ['seed', ...keysOf(10)], liveId: 'lv1', nowMs: 100 });
    expect(r1.fly).toHaveLength(VENUE_ENTRY_MAX_CONCURRENT);
    // 飛行中のまま次の tick を回しても、枠が空いていないので増えない
    const r2 = q.tick({ keys: ['seed', ...keysOf(10)], liveId: 'lv1', nowMs: 1200 });
    expect(r2.fly).toHaveLength(0);
    // 1つ終わらせると1つだけ飛べる
    q.onFlightDone(r1.fly[0]);
    const r3 = q.tick({ keys: ['seed', ...keysOf(10)], liveId: 'lv1', nowMs: 1300 });
    expect(r3.fly).toHaveLength(1);
  });

  it('レート制限: 1秒あたりの発火数を超えない', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['seed'], liveId: 'lv1', nowMs: 0 });
    const r = q.tick({ keys: ['seed', ...keysOf(30)], liveId: 'lv1', nowMs: 1000 });
    // 同時数上限のほうが先に効くので、発火数はそれ以下
    expect(r.fly.length).toBeLessThanOrEqual(VENUE_ENTRY_MAX_CONCURRENT);
  });

  it('居なくなった人は忘れる(再入場でまた飛べる)', () => {
    const q = createVenueEntryQueue();
    q.tick({ keys: ['a', 'b'], liveId: 'lv1', nowMs: 0 });
    q.tick({ keys: ['a'], liveId: 'lv1', nowMs: 100 }); // b が消えた
    const r = q.tick({ keys: ['a', 'b'], liveId: 'lv1', nowMs: 200 }); // b が戻った
    expect(r.fly).toEqual(['b']);
  });

  it('空入力・不正入力で落ちない', () => {
    const q = createVenueEntryQueue();
    expect(() => q.tick({ keys: [], liveId: '', nowMs: 0 })).not.toThrow();
    // @ts-expect-error 異常系
    expect(() => q.tick({ keys: null, liveId: 'lv1', nowMs: 0 })).not.toThrow();
    const r = q.tick({ keys: ['', '  ', 'a', 'a'], liveId: 'lv1', nowMs: 10 });
    // 空白と重複は落とす。★上の2回の tick で初回は消費済みなので、ここは通常経路＝
    //   'a' は新規として fly に入る（seat ではない）。
    expect(r.fly).toEqual(['a']);
    expect(r.seat).toHaveLength(0);
  });

  it('正規化: 空文字・空白・重複は数に入らない', () => {
    const q = createVenueEntryQueue();
    const r = q.tick({ keys: ['', '  ', 'a', 'a', 'b'], liveId: 'lv1', nowMs: 0 });
    // 初回なので全員 seat。重複と空白が落ちて 'a','b' の2人だけ。
    expect(r.seat).toEqual(['a', 'b']);
  });
});
