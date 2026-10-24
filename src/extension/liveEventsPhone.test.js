import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createPhoneRealtime } from '../../app/live-view-realtime.js';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');

class FakeES {
  static last = null;
  constructor(url) { this.url = url; this.handlers = {}; this.closed = false; FakeES.last = this; }
  addEventListener(n, fn) { this.handlers[n] = fn; }
  close() { this.closed = true; }
  emit(n, data) { this.handlers[n]?.({ data }); }
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const okJson = (j) => ({ ok: true, json: async () => j });
const msg = (liveId, events) => JSON.stringify({ id: 'x', name: 'events', data: JSON.stringify({ liveId, events }) });

function mk(reply) {
  const timers = [];
  const onRows = vi.fn();
  const onLiveChanged = vi.fn();
  const fetchImpl = vi.fn(async () => reply);
  const rt = createPhoneRealtime({
    token: 'tok123',
    onRows,
    onLiveChanged,
    fetchImpl,
    EventSourceImpl: FakeES,
    setTimeoutImpl: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeoutImpl: () => {},
    now: () => 1_000,
    isHidden: () => false
  });
  return { rt, onRows, onLiveChanged, fetchImpl, timers };
}

describe('スマホ: Ably の SSE で新着を受け取る(v0.1.1758)', () => {
  it('★サーバーにキーが無ければつながない(ポーリングだけ)。10分後にもう一度確かめる', async () => {
    FakeES.last = null;
    const { rt, fetchImpl, timers } = mk(okJson({ ok: true, realtime: false }));
    rt.start();
    await flush();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/status?action=realtime&v=tok123');
    expect(FakeES.last).toBeNull();
    expect(rt.stats().state).toBe('off');
    expect(timers[0].ms).toBe(10 * 60_000);
  });

  it('★届いたまとめを鏡の行にして渡す。配信切替の知らせは取り直しへ', async () => {
    const { rt, onRows, onLiveChanged, timers } = mk(okJson({ ok: true, realtime: true, sseUrl: 'https://main.realtime.ably.net/sse?x', expires: 3_601_000 }));
    rt.start();
    await flush();
    expect(FakeES.last.url).toBe('https://main.realtime.ably.net/sse?x');
    expect(timers[0].ms).toBe(3_600_000 - 60_000);
    FakeES.last.emit('message', msg('lv9', [{ type: 'comment', no: '5', at: 100, name: 'a', text: 'こんにちは', userId: '1' }, { type: 'bogus' }]));
    expect(onRows).toHaveBeenCalledWith('lv9', [{ at: 100, name: 'a', text: 'こんにちは', avatarUrl: '', userId: '1', kind: '', no: '5' }]);
    FakeES.last.emit('message', msg('lv10', [{ type: 'liveChanged', liveId: 'lv10' }]));
    expect(onLiveChanged).toHaveBeenCalledWith('lv10');
    FakeES.last.emit('message', 'not json');
    expect(rt.stats().messages).toBe(2);
  });

  it('★切れたら閉じて、間をあけてつなぎ直す(失敗が続くほど延ばす)', async () => {
    const { rt, timers, fetchImpl } = mk(okJson({ ok: true, realtime: true, sseUrl: 'https://main.realtime.ably.net/sse?x', expires: 0 }));
    rt.start();
    await flush();
    const first = FakeES.last;
    first.emit('error');
    expect(first.closed).toBe(true);
    expect(timers.at(-1).ms).toBe(15_000);
    timers.at(-1).fn();
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    FakeES.last.emit('error');
    expect(timers.at(-1).ms).toBe(60_000);
  });

  it('http の接続先や壊れた返事ではつながない', async () => {
    FakeES.last = null;
    const { rt } = mk(okJson({ ok: true, realtime: true, sseUrl: 'http://evil.example/sse' }));
    rt.start();
    await flush();
    expect(FakeES.last).toBeNull();
  });

  it('配線: 起動時に作り、ポーリングで届いた鏡にも足した行を足し直す(巻き戻さない)', () => {
    expect(liveView).toContain('createPhoneRealtime({ token, onRows: onRealtimeRows,');
    expect(liveView).toContain('_latestSnapshot = withRealtimeRows(jsonBlob);');
    expect(liveView).toContain('if (!_latestSnapshot || !_shownLiveId || liveId !== _shownLiveId) return;');
  });
});
