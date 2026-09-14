import { describe, expect, it, vi } from 'vitest';
import { fetchViewUri } from './nicoliveGuest.js';

/**
 * v0.1.1514: WS 握手(viewUri 取得)を偽 WebSocket 実装で検査する(DOM/chrome 非依存)。
 * ★viewUri は戻り値でだけ扱い、ログや例外本文に出さない設計。ここは戻り値の正しさを固定する。
 */

/**
 * テスト用の偽 WebSocket。生成後に scenario を呼び、open→(任意の)message を発火する。
 * @param {(fake: FakeWs) => void} scenario open 後に呼ばれ、fake.emit(...) を使う。
 */
function makeFakeWs(scenario) {
  return class FakeWs {
    constructor() {
      this.listeners = { open: [], message: [], error: [], close: [] };
      // 非同期で open を発火(実 WS と同じく constructor 後にイベントが来る)。
      queueMicrotask(() => {
        this.emit('open');
        scenario(this);
      });
    }
    addEventListener(type, fn) { (this.listeners[type] || []).push(fn); }
    send() { /* startWatching は握らず、scenario が message を返す */ }
    close() { /* no-op */ }
    emit(type, payload) {
      for (const fn of this.listeners[type] || []) fn(payload);
    }
  };
}

describe('fetchViewUri', () => {
  it('messageServer で viewUri を返す', async () => {
    const WebSocketImpl = makeFakeWs((ws) => {
      ws.emit('message', { data: JSON.stringify({ type: 'messageServer', data: { viewUri: 'https://mpn.example/view' } }) });
    });
    const r = await fetchViewUri('wss://secret/handshake', { timeoutMs: 500, WebSocketImpl });
    expect(r).toEqual({ viewUri: 'https://mpn.example/view', error: '' });
  });

  it('https でない viewUri は空にする(messageServer 自体は来ているので error は空)', async () => {
    const WebSocketImpl = makeFakeWs((ws) => {
      ws.emit('message', { data: JSON.stringify({ type: 'messageServer', data: { viewUri: 'ftp://nope' } }) });
    });
    const r = await fetchViewUri('wss://x', { timeoutMs: 500, WebSocketImpl });
    expect(r.viewUri).toBe('');
  });

  it('viewUri が空の messageServer は no_view_uri', async () => {
    const WebSocketImpl = makeFakeWs((ws) => {
      ws.emit('message', { data: JSON.stringify({ type: 'messageServer', data: {} }) });
    });
    const r = await fetchViewUri('wss://x', { timeoutMs: 500, WebSocketImpl });
    expect(r).toEqual({ viewUri: '', error: 'no_view_uri' });
  });

  it('disconnect は空を返す', async () => {
    const WebSocketImpl = makeFakeWs((ws) => {
      ws.emit('message', { data: JSON.stringify({ type: 'disconnect' }) });
    });
    const r = await fetchViewUri('wss://x', { timeoutMs: 500, WebSocketImpl });
    expect(r).toEqual({ viewUri: '', error: 'ws_disconnect' });
  });

  it('何も来なければ timeout で空', async () => {
    vi.useFakeTimers();
    try {
      const WebSocketImpl = makeFakeWs(() => { /* 何も返さない */ });
      const p = fetchViewUri('wss://x', { timeoutMs: 100, WebSocketImpl });
      await vi.advanceTimersByTimeAsync(120);
      const r = await p;
      expect(r).toEqual({ viewUri: '', error: 'ws_timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('WebSocket 実装が無ければ ws_unavailable(Node 22 未満のフォールバック)', async () => {
    const r = await fetchViewUri('wss://x', { timeoutMs: 500, WebSocketImpl: null });
    expect(r).toEqual({ viewUri: '', error: 'ws_unavailable' });
  });
});
