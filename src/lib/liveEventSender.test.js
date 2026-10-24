import { describe, expect, it, vi } from 'vitest';
import { createLiveEventSender } from './liveEventSender.js';
import {
  buildLiveEventsTail,
  LIVE_EVENTS_TAIL_MIN_MS,
  shouldWriteLiveEventsTail
} from './liveEvents.js';

const row = (no, extra = {}) => ({ no: String(no), at: 1_000 + no, name: `u${no}`, text: `c${no}`, userId: `${no}`, ...extra });
const mk = () => {
  const post = vi.fn(async () => ({ ok: true, realtime: true }));
  let n = 0;
  const s = createLiveEventSender({ post, newSendId: () => `send-${String(++n).padStart(4, '0')}` });
  return { s, post };
};

describe('liveEventSender: 3秒ごとに新着だけをまとめて送る(v0.1.1757)', () => {
  it('★最初の TAIL は送らない(過去のコメントを一気に流さない)。次からの新着だけ送る', async () => {
    const { s, post } = mk();
    s.ingest({ liveId: 'lv1', rows: [row(1), row(2)] });
    await s.tick({ enabled: true, nowMs: 10_000 });
    expect(post).not.toHaveBeenCalled();
    s.ingest({ liveId: 'lv1', rows: [row(1), row(2), row(3)] });
    await s.tick({ enabled: true, nowMs: 10_001 });
    expect(post).toHaveBeenCalledTimes(1);
    const body = post.mock.calls[0][0];
    expect(body.liveId).toBe('lv1');
    expect(body.sendId).toBe('send-0001');
    expect(body.events.map((e) => e.no)).toEqual(['3']);
    expect(body.events[0].type).toBe('comment');
  });

  it('3秒たつまでは送らずためる。同じ行は二度送らない', async () => {
    const { s, post } = mk();
    s.ingest({ liveId: 'lv1', rows: [row(1)] });
    s.ingest({ liveId: 'lv1', rows: [row(1), row(2)] });
    await s.tick({ enabled: true, nowMs: 10_000 });
    s.ingest({ liveId: 'lv1', rows: [row(2), row(3)] });
    await s.tick({ enabled: true, nowMs: 11_000 });
    expect(post).toHaveBeenCalledTimes(1);
    await s.tick({ enabled: true, nowMs: 13_000 });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0].events.map((e) => e.no)).toEqual(['3']);
    s.ingest({ liveId: 'lv1', rows: [row(2), row(3)] });
    await s.tick({ enabled: true, nowMs: 20_000 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('★配信が変わったら liveChanged を1件だけ送り、新しい配信の既存の行は送らない', async () => {
    const { s, post } = mk();
    s.ingest({ liveId: 'lv1', rows: [row(1)] });
    s.ingest({ liveId: 'lv2', rows: [row(7), row(8)] });
    await s.tick({ enabled: true, nowMs: 10_000 });
    const body = post.mock.calls[0][0];
    expect(body.liveId).toBe('lv2');
    expect(body.events).toEqual([{ type: 'liveChanged', liveId: 'lv2' }]);
  });

  it('ギフトの行は gift として送る', async () => {
    const { s, post } = mk();
    s.ingest({ liveId: 'lv1', rows: [] });
    s.ingest({ liveId: 'lv1', rows: [{ at: 5_000, name: 'a', text: 'ギフト', kind: 'gift', userId: '9' }] });
    await s.tick({ enabled: true, nowMs: 10_000 });
    expect(post.mock.calls[0][0].events[0].type).toBe('gift');
  });

  it('★無効になったら捨てて、次に有効になったら今ある行から数え直す', async () => {
    const { s, post } = mk();
    s.ingest({ liveId: 'lv1', rows: [row(1)] });
    s.ingest({ liveId: 'lv1', rows: [row(1), row(2)] });
    await s.tick({ enabled: false, nowMs: 10_000 });
    expect(s.stats().pending).toBe(0);
    s.ingest({ liveId: 'lv1', rows: [row(1), row(2), row(3)] });
    await s.tick({ enabled: true, nowMs: 20_000 });
    expect(post).not.toHaveBeenCalled();
  });

  it('サーバーが realtime:false を返したら、無効になるまで送らない。送信の失敗は数えて捨てる', async () => {
    const post = vi.fn(async () => ({ ok: true, realtime: false }));
    const s = createLiveEventSender({ post, newSendId: () => 'send-0001' });
    s.ingest({ liveId: 'lv1', rows: [] });
    s.ingest({ liveId: 'lv1', rows: [row(1)] });
    await s.tick({ enabled: true, nowMs: 10_000 });
    s.ingest({ liveId: 'lv1', rows: [row(1), row(2)] });
    await s.tick({ enabled: true, nowMs: 20_000 });
    expect(post).toHaveBeenCalledTimes(1);

    const bad = vi.fn(async () => { throw new Error('net'); });
    const s2 = createLiveEventSender({ post: bad, newSendId: () => 'send-0001' });
    s2.ingest({ liveId: 'lv1', rows: [] });
    s2.ingest({ liveId: 'lv1', rows: [row(1)] });
    await s2.tick({ enabled: true, nowMs: 10_000 });
    expect(s2.stats().failed).toBe(1);
    expect(s2.stats().pending).toBe(0);
  });
});

describe('liveEvents: 視聴ページが書く小さな TAIL', () => {
  it('直近20件だけ載せる。配信 ID が無ければ作らない', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i + 1));
    const t = buildLiveEventsTail({ liveId: 'LV5', rows }, 99);
    expect(t?.liveId).toBe('lv5');
    expect(t?.rows).toHaveLength(20);
    expect(t?.rows[0].no).toBe('11');
    expect(buildLiveEventsTail({ liveId: 'x', rows }, 1)).toBeNull();
  });

  it('★期限切れ・中身が同じ・最短間隔の内側では書かない', () => {
    const base = { wantedUntilMs: 50_000, nowMs: 10_000, lastWriteAt: 0, sig: 'a', lastSig: '' };
    expect(shouldWriteLiveEventsTail(base)).toBe(true);
    expect(shouldWriteLiveEventsTail({ ...base, wantedUntilMs: 9_999 })).toBe(false);
    expect(shouldWriteLiveEventsTail({ ...base, lastSig: 'a' })).toBe(false);
    expect(shouldWriteLiveEventsTail({ ...base, lastWriteAt: 10_000 - LIVE_EVENTS_TAIL_MIN_MS + 1 })).toBe(false);
  });
});
